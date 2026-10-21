"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { toggleTaskDone } from "./aufgaben";
import { updateApplication } from "./stellen";

/*
 * Posteingang der Coachees: gelesen markieren und die direkten Aktionen (Aufgabe erledigt, Stelle merken oder verwerfen).
 * Alles nur für den eigenen Posteingang; der Lesestand ändert nichts am Original.
 */

async function me() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) throw new Error("Keine Coaching-Akte.");
  return { user, c };
}

const refresh = () => revalidatePath("/mein-bereich", "layout");
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Ein Eintrag wurde geöffnet */
export async function openInboxEntry(id: string) {
  const { c } = await me();
  if (!isId(id)) return;
  await query("UPDATE coachee_inbox SET read_at = now() WHERE id = $1 AND coachee_id = $2 AND read_at IS NULL", [id, c.id]);
  refresh();
}

/** Das Gespräch mit dem Coach wurde geöffnet: seine Nachrichten gelten als gelesen */
export async function openThread() {
  const { user, c } = await me();
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [c.id, user.id]);
  refresh();
}

export async function markAllInboxRead() {
  const { user, c } = await me();
  await query("UPDATE coachee_inbox SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL", [c.id]);
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [c.id, user.id]);
  refresh();
}

/** Aufgabe direkt im Posteingang abhaken (oder wieder öffnen) */
export async function inboxToggleTask(entryId: string, taskId: string) {
  const { c } = await me();
  if (!isId(entryId) || !isId(taskId)) return;
  await toggleTaskDone(taskId);
  await query("UPDATE coachee_inbox SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND coachee_id = $2", [entryId, c.id]);
  refresh();
}

/** Vorgeschlagene Stelle merken oder verwerfen */
export async function inboxJobStatus(entryId: string, applicationId: string, status: "gemerkt" | "verworfen") {
  const { c } = await me();
  if (!isId(entryId) || !isId(applicationId) || !["gemerkt", "verworfen"].includes(status)) return;
  const res = await updateApplication(c.id, applicationId, { status });
  if (res.error) console.error("[posteingang]", res.error);
  await query("UPDATE coachee_inbox SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND coachee_id = $2", [entryId, c.id]);
  refresh();
}

/** „Bewerben“: Vorschlag wird zur gemerkten Stelle, dann geht es direkt zum Anschreiben */
export async function inboxApply(entryId: string, applicationId: string) {
  const { c } = await me();
  if (!isId(entryId) || !isId(applicationId)) return;
  const app = await one<{ status: string }>("SELECT status FROM applications WHERE id = $1 AND coachee_id = $2", [applicationId, c.id]);
  if (!app) return;
  if (app.status === "vorschlag") await updateApplication(c.id, applicationId, { status: "gemerkt" });
  await query("UPDATE coachee_inbox SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND coachee_id = $2", [entryId, c.id]);
  refresh();
  redirect(`/anschreiben/${applicationId}`);
}
