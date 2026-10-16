"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { DOC_CATEGORIES, DOC_TYPES, MAX_DOC_BYTES, categoryLabel, extOf, extractReportRows, guessCategory, guessCategoryFromText, isReport, type ReportRow } from "@/lib/documents";
import { PARSER_VERSION, extractDocumentText } from "@/lib/documents-text";
import { removeFile, storeFile } from "@/lib/files";
import { text, type FormState } from "@/lib/forms";

const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/coach");
  revalidatePath("/mein-bereich");
};
const validCategory = (v: string) => DOC_CATEGORIES.some((c) => c.key === v);

/** Eine Datei hochladen. Mehrere Dateien schickt das Formular nacheinander, je ein Aufruf. */
export async function uploadDocument(coacheeId: string, fd: FormData): Promise<{ error?: string; ok?: string; category?: string; rows?: number }> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Keine Datei ausgewählt." };
  const ext = extOf(file.name);
  const mime = DOC_TYPES[ext];
  if (!mime) return { error: `${file.name}: Dieses Dateiformat geht nicht. Erlaubt sind PDF, Word, Excel, Bilder und Text.` };
  if (file.size > MAX_DOC_BYTES) return { error: `${file.name}: Die Datei ist größer als 25 MB.` };
  const chosen = text(fd, "category", 40);
  const data = Buffer.from(await file.arrayBuffer());
  const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: file.name, mime, data, userId: coach.id });
  const plain = await extractDocumentText(file.name, data);
  const byName = guessCategory(file.name);
  const category = validCategory(chosen) ? chosen : byName !== "sonstiges" ? byName : (guessCategoryFromText(plain) ?? "sonstiges");
  const rows = isReport(category) && plain ? extractReportRows(plain) : null;
  const title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim().slice(0, 200) || file.name;
  await query(
    "INSERT INTO documents (coachee_id, file_id, category, title, extracted, extracted_text, created_by, parser_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [c.id, fileId, category, title, rows ? JSON.stringify(rows) : null, plain || null, coach.id, PARSER_VERSION],
  );
  await audit(coach.id, "document_uploaded", c.id, { category, name: file.name.slice(0, 120) });
  refresh(c.id);
  return { ok: `${file.name}: als ${categoryLabel(category)} gespeichert${rows?.length ? `, ${rows.length} Termine erkannt` : ""}.`, category, rows: rows?.length ?? 0 };
}

async function ownDocument(coachId: string, coacheeId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<{ id: string; file_id: string; category: string; title: string; extracted_text: string | null }>(
    "SELECT d.id, d.file_id, d.category, d.title, d.extracted_text FROM documents d JOIN coachees c ON c.id = d.coachee_id WHERE d.id = $1 AND d.coachee_id = $2 AND c.coach_id = $3",
    [id, coacheeId, coachId],
  );
}

/** Titel, Art und Freigabe ändern. Wird die Art zu einem Bericht, werden die Termine neu ausgelesen. */
export async function updateDocument(coacheeId: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const doc = await ownDocument(coach.id, c.id, id);
  if (!doc) return { error: "Dokument nicht gefunden." };
  const title = text(fd, "title", 200) || doc.title;
  const category = validCategory(text(fd, "category", 40)) ? text(fd, "category", 40) : doc.category;
  const shared = fd.get("shared") === "on";
  const rows = isReport(category) && doc.extracted_text ? extractReportRows(doc.extracted_text) : null;
  await query("UPDATE documents SET title = $2, category = $3, shared = $4, extracted = $5 WHERE id = $1", [doc.id, title, category, shared, rows ? JSON.stringify(rows) : null]);
  await audit(coach.id, "document_updated", c.id, { category, shared });
  refresh(c.id);
  return { ok: "Gespeichert." };
}

export async function deleteDocument(coacheeId: string, id: string) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const doc = await ownDocument(coach.id, c.id, id);
  if (!doc) return;
  await query("DELETE FROM files WHERE id = $1", [doc.file_id]); // löscht den Eintrag in documents mit
  await removeFile(doc.file_id);
  await audit(coach.id, "document_deleted", c.id, { title: doc.title });
  refresh(c.id);
}

/** Termine aus dem Bericht, die im Portal fehlen, in die Anwesenheit übernehmen */
export async function importReportRows(coacheeId: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const doc = await one<{ extracted: ReportRow[] | null; title: string }>("SELECT extracted, title FROM documents WHERE id = $1 AND coachee_id = $2", [id, c.id]);
  if (!doc?.extracted) return { error: "In diesem Dokument wurden keine Termine erkannt." };
  const wanted = new Set(fd.getAll("row").map(String));
  const rows = doc.extracted.filter((r, i) => wanted.has(String(i)) && r.units != null && r.units > 0);
  if (!rows.length) return { error: "Bitte mindestens einen Termin mit UE auswählen." };
  const source = c.traeger === "erfolgspfad" ? "erfolgspfad" : c.traeger === "avocons" ? "avocons" : "manuell";
  for (const r of rows) {
    await query(
      "INSERT INTO attendance (coachee_id, held_on, starts_at, ends_at, units, source, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [c.id, r.held_on, r.starts_at, r.ends_at, r.units, source, `aus ${doc.title}`.slice(0, 500), coach.id],
    );
  }
  await audit(coach.id, "attendance_from_document", c.id, { count: rows.length });
  refresh(c.id);
  return { ok: `${rows.length} Termin${rows.length > 1 ? "e" : ""} in die Anwesenheit übernommen.` };
}

/** Coaching abschließen oder wieder aufnehmen */
export async function setCoachingStatus(coacheeId: string, status: "aktiv" | "abgeschlossen") {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  await query("UPDATE coachees SET status = $2 WHERE id = $1", [c.id, status]);
  await audit(coach.id, status === "abgeschlossen" ? "coaching_closed" : "coaching_reopened", c.id);
  refresh(c.id);
}
