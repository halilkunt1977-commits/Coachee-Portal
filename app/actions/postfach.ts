"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { DOC_TYPES, extOf, guessCategory } from "@/lib/documents";
import { isCategory, parseBookings, parseContact, parseLocation } from "@/lib/inbox/classify";
import { afterFormFiled } from "@/lib/doku/store";
import { applyMail } from "@/lib/inbox/ingest";
import { vaultRead, vaultWrite } from "@/lib/vault";
import { text } from "@/lib/forms";

const refresh = (coacheeId?: string | null) => {
  revalidatePath("/coach", "layout");
  revalidatePath("/mein-bereich", "layout");
  if (coacheeId) revalidatePath(`/coach/coachees/${coacheeId}`);
};

async function ownMail(coachId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<{ id: string; coachee_id: string | null; subject: string; body: string; received_at: string; category: string }>(
    "SELECT id, coachee_id, subject, body, received_at, category FROM inbox_mails WHERE id = $1 AND coach_id = $2",
    [id, coachId],
  );
}

/** Art korrigieren; danach setzt das Portal um, was zur neuen Art gehört (Termin, Dokument, Anfrage) */
export async function setMailCategory(id: string, fd: FormData) {
  const coach = await requireCoach();
  const m = await ownMail(coach.id, id);
  const category = text(fd, "category", 30);
  if (!m || !isCategory(category)) return;
  const received = new Date(m.received_at);
  const parsed = category === "buerobuchung" ? { bookings: parseBookings(m.body, received), location: parseLocation(m.body) } : category === "anfrage" ? { contact: parseContact(m.body, m.subject) } : {};
  await query("UPDATE inbox_mails SET category = $2, category_by = 'coach', parsed = $3 WHERE id = $1", [id, category, parsed]);
  await applyMail(id);
  await audit(coach.id, "mail_category", m.coachee_id, { mailId: id, category });
  refresh(m.coachee_id);
}

export async function setMailCoachee(id: string, fd: FormData) {
  const coach = await requireCoach();
  const m = await ownMail(coach.id, id);
  if (!m) return;
  const raw = text(fd, "coachee_id", 36);
  const c = raw ? await coacheeFor(coach, raw) : null;
  await query("UPDATE inbox_mails SET coachee_id = $2 WHERE id = $1", [id, c?.id ?? null]);
  await applyMail(id);
  refresh(c?.id ?? m.coachee_id);
}

export async function toggleMailDone(id: string) {
  const coach = await requireCoach();
  await query("UPDATE inbox_mails SET done_at = CASE WHEN done_at IS NULL THEN now() END, read_at = COALESCE(read_at, now()) WHERE id = $1 AND coach_id = $2", [id, coach.id]);
  refresh();
}

export async function markMailUnread(id: string) {
  const coach = await requireCoach();
  await query("UPDATE inbox_mails SET read_at = NULL WHERE id = $1 AND coach_id = $2", [id, coach.id]);
  refresh();
}

export async function markAllRead() {
  const coach = await requireCoach();
  await query("UPDATE inbox_mails SET read_at = now() WHERE coach_id = $1 AND read_at IS NULL", [coach.id]);
  refresh();
}

/** Einzelnen Anhang in die Dokumente des zugeordneten Coachees legen (für Mails, die das nicht von selbst tun) */
export async function attachmentToDocuments(attachmentId: string) {
  const coach = await requireCoach();
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return;
  const a = await one<{ id: string; name: string; mime: string; size: number; mail_id: string; coachee_id: string | null; category: string; document_id: string | null }>(
    `SELECT a.id, a.name, a.mime, a.size, a.mail_id, m.coachee_id, m.category, a.document_id FROM inbox_attachments a JOIN inbox_mails m ON m.id = a.mail_id
      WHERE a.id = $1 AND m.coach_id = $2`,
    [attachmentId, coach.id],
  );
  if (!a || !a.coachee_id || a.document_id || !DOC_TYPES[extOf(a.name)]) return;
  const data = await vaultRead("postfach", a.id);
  const f = await one<{ id: string }>("INSERT INTO files (coachee_id, kind, name, mime, size, created_by) VALUES ($1,'dokument',$2,$3,$4,$5) RETURNING id", [a.coachee_id, a.name, a.mime, a.size, coach.id]);
  await vaultWrite("dateien", f!.id, data);
  const category = a.category === "projektvertrag" ? "vertrag" : a.category === "coachbericht" ? "coachbericht" : guessCategory(a.name);
  const d = await one<{ id: string }>(
    "INSERT INTO documents (coachee_id, file_id, category, title, signature, created_by, parser_version) VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING id",
    [a.coachee_id, f!.id, category, a.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").slice(0, 200), category === "coachbericht" ? "offen" : null, coach.id],
  );
  await query("UPDATE inbox_attachments SET document_id = $2 WHERE id = $1", [a.id, d!.id]);
  await audit(coach.id, "document_from_mail", a.coachee_id, { name: a.name.slice(0, 120) });
  const coacheeId = a.coachee_id;
  after(() => afterFormFiled(coacheeId, a.name, coach.id));
  refresh(a.coachee_id);
}

/** Bericht als unterschrieben (oder wieder offen) markieren */
export async function setSignature(documentId: string, state: "offen" | "unterschrieben" | null) {
  const coach = await requireCoach();
  const d = await one<{ coachee_id: string }>("SELECT d.coachee_id FROM documents d JOIN coachees c ON c.id = d.coachee_id WHERE d.id = $1 AND c.coach_id = $2", [documentId, coach.id]);
  if (!d) return;
  await query("UPDATE documents SET signature = $2 WHERE id = $1", [documentId, state]);
  await audit(coach.id, "document_signature", d.coachee_id, { documentId, state });
  refresh(d.coachee_id);
}
