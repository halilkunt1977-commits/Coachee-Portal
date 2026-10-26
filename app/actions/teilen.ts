"use server";
import { revalidatePath } from "next/cache";
import { ownCoachee, type Coachee } from "@/lib/access";
import { audit, requireUser, type User } from "@/lib/auth";
import { notifyCoachee, postToInbox } from "@/lib/coachee-inbox";
import { one, query } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import type { Job, Status } from "@/lib/jobs/shared";
import { storeJob } from "@/lib/jobs/store";
import { notify } from "@/lib/push";
import { shareTarget } from "@/lib/teilen";
import { isShareKind, JOB_QUESTION, SHARE_META, type ShareKind } from "@/lib/teilen-shared";
import { sendMessage } from "./akte";

/*
 * Teilen und Senden zwischen Coach und Coachee. Eine geteilte Sache ist eine Nachricht mit Verweis:
 * Sie steht im Gespräch, beim Coachee zusätzlich als Eintrag im Posteingang, beim Coach unter Posteingang > Von Coachees.
 * Coachees teilen nur eigene Sachen mit ihrem eigenen Coach, der Coach nur mit seinen eigenen Coachees.
 */

export type ShareInput = {
  /** "suche": Treffer aus der Stellensuche, der erst in die Bewerbungen übernommen wird */
  kind: ShareKind | "suche";
  refId?: string;
  job?: Job;
  /** Empfänger beim Coach; beim Coachee höchstens die eigene Akte */
  coacheeId?: string;
  note?: string;
};
export type ShareResult = { ok?: string; error?: string; status?: Status; /** Vorname des Empfängers, für „an … gesendet ✓“ */ to?: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const NOT_FOUND = "Nicht gefunden. Vielleicht wurde es gerade gelöscht.";

/** Die Akte, um die es geht: Coachee nur die eigene, Coach nur eigene, nicht archivierte */
async function recipientAkte(user: User, coacheeId: unknown): Promise<Coachee | null> {
  if (user.role === "coachee") {
    const c = await ownCoachee(user);
    if (!c || (coacheeId !== undefined && coacheeId !== c.id)) return null;
    return c;
  }
  if (!isId(coacheeId)) return null;
  return one<Coachee>("SELECT * FROM coachees WHERE id = $1 AND coach_id = $2 AND archived_at IS NULL", [coacheeId, user.id]);
}

const refresh = (coacheeId: string) => {
  revalidatePath("/coach", "layout");
  revalidatePath("/mein-bereich", "layout");
  revalidatePath(`/coach/coachees/${coacheeId}`);
};

export async function shareItem(input: ShareInput): Promise<ShareResult> {
  const user = await requireUser();
  if (!input || (input.kind !== "suche" && !isShareKind(input.kind))) return { error: "Das lässt sich nicht teilen." };
  const c = await recipientAkte(user, input.coacheeId);
  if (!c) return { error: user.role === "coach" && !input.coacheeId ? "Bitte zuerst auswählen, an wen es gehen soll." : NOT_FOUND };
  const coach = user.role === "coach";
  let note = String(input.note ?? "").replace(/\r/g, "").trim().slice(0, 600);

  let kind: ShareKind;
  let refId = String(input.refId ?? "");
  let status: Status | undefined;
  if (input.kind === "suche") {
    // Stelle aus der Suche: erst in die Bewerbungen der Akte, beim Coach als Vorschlag, beim Coachee als gemerkt
    if (c.coaching_type !== "job") return { error: "Stellen gibt es nur im Jobcoaching." };
    if (!input.job?.refnr) return { error: "Diese Stelle hat keine Referenznummer." };
    const row = await storeJob(c.id, user, input.job, coach ? note : "");
    if ("error" in row) return { error: row.error };
    kind = "stelle";
    refId = row.id;
    status = row.status;
    if (!coach && !note) note = JOB_QUESTION;
  } else {
    kind = input.kind;
    // Gesprächsvorbereitungen schickt nur der Coach
    if (kind === "vorbereitung" && !coach) return { error: "Das lässt sich nicht teilen." };
    // Eigene Aufgabe des Coachs (ohne Akte) geht als Kopie an den Coachee
    if (coach && kind === "aufgabe" && isId(refId)) {
      const own = await one<{ title: string; details: string; due_on: string | null }>("SELECT title, details, due_on FROM tasks WHERE id = $1 AND owner_id = $2 AND coachee_id IS NULL", [refId, user.id]);
      if (own) {
        const copy = await one<{ id: string }>("INSERT INTO tasks (coachee_id, title, details, due_on, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [c.id, own.title, own.details, own.due_on, user.id]);
        refId = copy!.id;
        await audit(user.id, "task_created", c.id);
      }
    }
  }

  const target = await shareTarget(kind, refId, c.id, user.role);
  if (!target) return { error: NOT_FOUND };
  status ??= target.status as Status | undefined;
  // Gesprächsvorbereitung: genau die gespeicherte Fassung geht als Kopie raus; spätere Änderungen erst beim nächsten Schicken
  if (coach && kind === "vorbereitung")
    await query("UPDATE applications SET interview_sent = interview, interview_sent_at = now(), interview_seen_at = NULL WHERE id = $1 AND coachee_id = $2", [refId, c.id]);
  // Ein Dokument zu schicken heißt auch: Der Coachee darf es öffnen
  if (coach && kind === "dokument" && !target.shared) await query("UPDATE documents SET shared = true WHERE id = $1 AND coachee_id = $2", [refId, c.id]);

  await query("INSERT INTO messages (coachee_id, author_id, body, ref_kind, ref_id, ref_title) VALUES ($1,$2,$3,$4,$5,$6)", [c.id, user.id, note, kind, refId, target.title.slice(0, 300)]);
  await audit(user.id, "shared", c.id, { kind, ref: refId });

  // Meldungen nur mit Name und Anlass, nie mit Inhalten
  const meta = SHARE_META[kind];
  if (coach) {
    const url = await postToInbox(c.id, kind, refId, user.id, note);
    await notifyCoachee(c.user_id, { title: "Neu von deinem Coach", body: `${meta.article} für dich. Öffnen zum Ansehen.`, url, tag: `geteilt-${kind}` });
  } else {
    await notify([c.coach_id], { title: `${c.first_name} ${c.last_name} hat dir etwas geschickt`, body: `${meta.article}. Öffnen zum Ansehen.`, url: "/coach/posteingang?bereich=coachees", tag: `geteilt-${c.id}` });
  }
  refresh(c.id);
  const to = coach ? c.first_name : (await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]))?.name.split(" ")[0];
  return { ok: to ? `An ${to} gesendet.` : "An deinen Coach gesendet.", status, to };
}

/** Neue Nachricht ohne Anhang: Coachee an den eigenen Coach, Coach an einen ausgewählten eigenen Coachee */
export async function composeMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await recipientAkte(user, user.role === "coach" ? String(fd.get("coachee") ?? "") : undefined);
  if (!c) return { error: user.role === "coach" && !fd.get("coachee") ? "Bitte auswählen, an wen die Nachricht geht." : NOT_FOUND };
  const res = await sendMessage(c.id, undefined, fd);
  return res?.ok ? { ok: user.role === "coach" ? `Nachricht an ${c.first_name} gesendet.` : "Nachricht an deinen Coach gesendet." } : res;
}

/** Coach: Nachrichten und geteilte Sachen von Coachees als gelesen markieren (alle oder eine) */
export async function markFromCoacheesRead(messageId?: string) {
  const user = await requireUser("coach");
  if (messageId !== undefined && !isId(messageId)) return;
  await query(
    `UPDATE messages m SET read_at = now() FROM coachees c
      WHERE c.id = m.coachee_id AND c.coach_id = $1 AND m.read_at IS NULL AND m.author_id IS DISTINCT FROM $1 ${messageId ? "AND m.id = $2" : ""}`,
    messageId ? [user.id, messageId] : [user.id],
  );
  revalidatePath("/coach", "layout");
}
