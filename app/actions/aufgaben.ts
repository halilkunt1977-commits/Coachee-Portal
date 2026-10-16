"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor, ownCoachee } from "@/lib/access";
import { audit, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { dateOrNull, text, type FormState } from "@/lib/forms";
import { noticeMail, sendMail } from "@/lib/mail";

const refresh = (coacheeId: string | null) => {
  revalidatePath("/coach", "layout");
  revalidatePath("/mein-bereich", "layout");
  if (coacheeId) revalidatePath(`/coach/coachees/${coacheeId}`);
};

/** Aufgabe aus dem Aufgabenbereich: beim Coach für sich selbst oder einen Coachee, beim Coachee für sich. */
export async function createTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const title = text(fd, "title", 300);
  if (!title) return { error: "Bitte die Aufgabe beschreiben." };
  const due = dateOrNull(fd, "due_on");
  const details = text(fd, "details", 5000);
  const forId = text(fd, "for", 36);
  const c = user.role === "coach" ? (forId ? await coacheeFor(user, forId) : null) : await ownCoachee(user);
  if (user.role === "coachee" && !c) return { error: "Dein Zugang ist noch keinem Coaching zugeordnet." };
  await query("INSERT INTO tasks (coachee_id, owner_id, title, details, due_on, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [c?.id ?? null, c ? null : user.id, title, details, due, user.id]);
  await audit(user.id, "task_created", c?.id ?? null);
  if (user.role === "coach" && c?.user_id && fd.get("notify") === "on") {
    await sendMail({ to: c.email, ...noticeMail(c.first_name, "Du hast eine neue Aufgabe im Portal.") }).catch(() => false);
  }
  refresh(c?.id ?? null);
  return { ok: c && user.role === "coach" ? `Aufgabe für ${c.first_name} angelegt.` : "Aufgabe angelegt." };
}

type Owned = { id: string; coachee_id: string | null; created_by: string | null };

async function taskFor(user: User, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return user.role === "coach"
    ? one<Owned>(
        `SELECT t.id, t.coachee_id, t.created_by FROM tasks t LEFT JOIN coachees c ON c.id = t.coachee_id
          WHERE t.id = $2 AND (t.owner_id = $1 OR c.coach_id = $1)`,
        [user.id, id],
      )
    : one<Owned>(
        `SELECT t.id, t.coachee_id, t.created_by FROM tasks t JOIN coachees c ON c.id = t.coachee_id WHERE t.id = $2 AND c.user_id = $1`,
        [user.id, id],
      );
}

export async function toggleTaskDone(id: string) {
  const user = await requireUser();
  const t = await taskFor(user, id);
  if (!t) return;
  await query("UPDATE tasks SET done_at = CASE WHEN done_at IS NULL THEN now() END WHERE id = $1", [id]);
  await audit(user.id, "task_toggled", t.coachee_id, { taskId: id });
  refresh(t.coachee_id);
}

/** Löschen darf der Coach immer, der Coachee nur, was er selbst angelegt hat. */
export async function removeTask(id: string) {
  const user = await requireUser();
  const t = await taskFor(user, id);
  if (!t || (user.role === "coachee" && t.created_by !== user.id)) return;
  await query("DELETE FROM tasks WHERE id = $1", [id]);
  await audit(user.id, "task_deleted", t.coachee_id, { taskId: id });
  refresh(t.coachee_id);
}
