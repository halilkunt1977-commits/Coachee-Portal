"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { dateOrNull, numberOrNull, text, type FormState } from "@/lib/forms";
import { noticeMail, sendMail } from "@/lib/mail";
import { notify } from "@/lib/push";
import { isAvocons, refreshDoku, writeDocText } from "@/lib/doku/store";

const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/mein-bereich");
};

// ---------- Gespräche (nur Coach) ----------

function readMeeting(fd: FormData) {
  const formatRaw = text(fd, "format", 20);
  return {
    held_on: dateOrNull(fd, "held_on"),
    units: numberOrNull(fd, "units") ?? 0,
    format: ["praesenz", "online", "telefon"].includes(formatRaw) ? formatRaw : "praesenz",
    title: text(fd, "title", 200),
    notes: text(fd, "notes", 50000),
    results: text(fd, "results", 20000),
    next_steps: text(fd, "next_steps", 20000),
    internal_note: text(fd, "internal_note", 20000),
    shared: fd.get("shared") === "on",
    // nur beim Bearbeiten im Formular; leer = wieder automatisch aus den Notizen schreiben
    doc_text: fd.has("doc_text") ? text(fd, "doc_text", 600) : null,
  };
}

export async function saveMeeting(coacheeId: string, meetingId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const m = readMeeting(fd);
  if (!m.held_on) return { error: "Bitte das Datum des Gesprächs angeben." };
  if (!m.title) return { error: "Bitte ein Thema angeben, zum Beispiel „Erstgespräch“." };
  if (m.units > 24) return { error: "Mehr als 24 Unterrichtseinheiten an einem Termin? Bitte prüfen." };
  let id = meetingId;
  let rewrite = true;
  if (meetingId) {
    const before = await one<{ title: string; notes: string; results: string; next_steps: string; doc_text: string; doc_auto: boolean }>(
      "SELECT title, notes, results, next_steps, doc_text, doc_auto FROM meetings WHERE id = $1 AND coachee_id = $2",
      [meetingId, coacheeId],
    );
    if (!before) return { error: "Dieses Gespräch gibt es nicht mehr." };
    // Selbst geänderter Dokumentationstext bleibt; leeres Feld schaltet zurück auf automatisch
    const ownText = m.doc_text !== null && m.doc_text !== before.doc_text && m.doc_text !== "";
    const auto = m.doc_text === "" ? true : ownText ? false : before.doc_auto;
    const changed = before.title !== m.title || before.notes !== m.notes || before.results !== m.results || before.next_steps !== m.next_steps;
    rewrite = auto && (changed || !before.doc_text || m.doc_text === "");
    await query(
      `UPDATE meetings SET held_on=$3, units=$4, format=$5, title=$6, notes=$7, results=$8, next_steps=$9, internal_note=$10, shared=$11,
              doc_text = CASE WHEN $12 THEN $13 ELSE doc_text END, doc_auto = $14, updated_at=now()
        WHERE id=$1 AND coachee_id=$2`,
      [meetingId, coacheeId, m.held_on, m.units, m.format, m.title, m.notes, m.results, m.next_steps, m.internal_note, m.shared, ownText, m.doc_text ?? "", auto],
    );
    await audit(coach.id, "meeting_updated", coacheeId, { meetingId });
  } else {
    const row = await one<{ id: string }>(
      `INSERT INTO meetings (coachee_id, held_on, units, format, title, notes, results, next_steps, internal_note, shared, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [coacheeId, m.held_on, m.units, m.format, m.title, m.notes, m.results, m.next_steps, m.internal_note, m.shared, coach.id],
    );
    id = row?.id ?? null;
    await audit(coach.id, "meeting_created", coacheeId, { meetingId: id });
  }
  // Eintrag für die Beratungsdokumentation gleich mitschreiben, das PDF danach im Hintergrund erneuern
  if (id && rewrite) await writeDocText(id, coach.id);
  if (isAvocons(c.traeger)) after(() => refreshDoku(coacheeId, coach.id).catch((e) => console.error("[doku]", e)));
  refresh(coacheeId);
  return { ok: isAvocons(c.traeger) ? "Gespräch gespeichert. Die Beratungsdokumentation wird aktualisiert." : "Gespräch gespeichert." };
}

export async function deleteMeeting(coacheeId: string, meetingId: string) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  await query("DELETE FROM meetings WHERE id = $1 AND coachee_id = $2", [meetingId, coacheeId]);
  await audit(coach.id, "meeting_deleted", coacheeId, { meetingId });
  if (isAvocons(c.traeger)) after(() => refreshDoku(coacheeId, coach.id).catch((e) => console.error("[doku]", e)));
  refresh(coacheeId);
}

// ---------- Aufgaben (Coach legt an, beide haken ab) ----------

export async function addTask(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  const title = text(fd, "title", 300);
  if (!title) return { error: "Bitte die Aufgabe beschreiben." };
  await query("INSERT INTO tasks (coachee_id, title, details, due_on, created_by) VALUES ($1,$2,$3,$4,$5)", [coacheeId, title, text(fd, "details", 5000), dateOrNull(fd, "due_on"), user.id]);
  await audit(user.id, "task_created", coacheeId);
  if (user.role === "coach" && c.user_id && fd.get("notify") === "on") {
    await sendMail({ to: c.email, ...noticeMail(c.first_name, "Du hast eine neue Aufgabe im Portal.") }).catch(() => false);
    await notify([c.user_id], { title: "Neue Aufgabe", body: "Dein Coach hat dir eine Aufgabe gegeben.", url: "/mein-bereich/aufgaben", tag: "aufgabe" });
  }
  refresh(coacheeId);
  return { ok: "Aufgabe angelegt." };
}

export async function toggleTask(coacheeId: string, taskId: string) {
  const user = await requireUser();
  await coacheeFor(user, coacheeId);
  await query("UPDATE tasks SET done_at = CASE WHEN done_at IS NULL THEN now() END WHERE id = $1 AND coachee_id = $2", [taskId, coacheeId]);
  await audit(user.id, "task_toggled", coacheeId, { taskId });
  refresh(coacheeId);
}

export async function deleteTask(coacheeId: string, taskId: string) {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  await query("DELETE FROM tasks WHERE id = $1 AND coachee_id = $2", [taskId, coacheeId]);
  await audit(coach.id, "task_deleted", coacheeId, { taskId });
  refresh(coacheeId);
}

// ---------- Nachrichten ----------

export async function sendMessage(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  const body = text(fd, "body", 10000);
  if (!body) return { error: "Die Nachricht ist leer." };
  await query("INSERT INTO messages (coachee_id, author_id, body) VALUES ($1,$2,$3)", [coacheeId, user.id, body]);
  await audit(user.id, "message_sent", coacheeId);
  // Benachrichtigung ohne Inhalt
  if (user.role === "coach" && c.user_id) {
    await sendMail({ to: c.email, ...noticeMail(c.first_name, "Du hast eine neue Nachricht von deinem Coach.") }).catch(() => false);
    await notify([c.user_id], { title: "Neue Nachricht", body: "Von deinem Coach. Öffnen zum Lesen.", url: "/mein-bereich#nachrichten", tag: "nachricht" });
  } else if (user.role === "coachee") {
    await notify([c.coach_id], { title: `${c.first_name} ${c.last_name} hat geschrieben`, body: "Neue Nachricht im Portal.", url: `/coach/coachees/${c.id}?tab=nachrichten`, tag: `nachricht-${c.id}` });
    const coach = await one<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = $1", [c.coach_id]);
    if (coach) await sendMail({ to: coach.email, ...noticeMail(coach.name.split(" ")[0], `${c.first_name} ${c.last_name} hat dir eine Nachricht geschrieben.`) }).catch(() => false);
  }
  refresh(coacheeId);
  return { ok: "Gesendet." };
}

export async function markMessagesRead(coacheeId: string) {
  const user = await requireUser();
  await coacheeFor(user, coacheeId);
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [coacheeId, user.id]);
}
