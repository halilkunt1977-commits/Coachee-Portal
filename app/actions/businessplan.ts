"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { changeFinance, type FinanceTurn } from "@/lib/bp/finanz-ki";
import { audit, requireCoach, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { DOC_TYPES, MAX_DOC_BYTES, extOf } from "@/lib/documents";
import { PARSER_VERSION, extractDocumentText } from "@/lib/documents-text";
import { loadFile, storeFile } from "@/lib/files";
import { applyFinanceXlsx, applyPlanDocx, documentFile, importTarget, type ImportResult } from "@/lib/bp/apply-import";
import { normalizeFinance, type FinanceInput } from "@/lib/bp/finance";
import { MAX_NOTE, VORHABEN, type ChatTurn } from "@/lib/bp/notes";
import { appendTurns, setTurnStatus } from "@/lib/bp/schreibhilfe";
import { SECTIONS, normalizeGlance, normalizeSections, type GlanceItem } from "@/lib/bp/sections";
import { financeFromItems, financeItems, planFor } from "@/lib/bp/store";
import { backupFinance, gist, listVersions, saveSnapshot, snapshotFinance, type FinanceGist, type Version } from "@/lib/bp/fassungen";

async function gruendungCoachee(user: User, coacheeId: string) {
  const c = await coacheeFor(user, coacheeId);
  if (c.coaching_type !== "gruendung") throw new Error("Businessplan gibt es nur im Gründungscoaching.");
  await planFor(c);
  return c;
}

/** Ins Protokoll höchstens alle 30 Minuten, nicht bei jedem automatischen Speichern */
async function auditThrottled(user: User, action: string, coacheeId: string, detail: Record<string, string> = {}) {
  const recent = await one(
    "SELECT 1 FROM audit_log WHERE user_id = $1 AND action = $2 AND coachee_id = $3 AND detail @> $4 AND created_at > now() - interval '30 minutes' LIMIT 1",
    [user.id, action, coacheeId, JSON.stringify(detail)],
  );
  if (!recent) await audit(user.id, action, coacheeId, detail);
}

// ---------- Businessplan-Texte ----------

export type SectionSave = { ok: true; version: number; savedAt: string } | { ok: false; error: string; conflict?: { text: string; sources: string; version: number; by: string | null } };

export async function saveSection(coacheeId: string, key: string, baseVersion: number, text: string, sources: string): Promise<SectionSave> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  if (!SECTIONS.some((s) => s.key === key)) return { ok: false, error: "Unbekanntes Kapitel." };
  const body = String(text ?? "").slice(0, 60000);
  const src = String(sources ?? "").slice(0, 8000);
  // Speichern nur, wenn niemand anderes inzwischen geändert hat (eigene schnelle Folgespeicherungen sind erlaubt)
  const row = await one<{ version: number; saved_at: string }>(
    `UPDATE business_plans
        SET sections = jsonb_set(sections, ARRAY[$2::text], jsonb_build_object('text', $3::text, 'sources', $6::text, 'version', COALESCE((sections->($2::text)->>'version')::int, 0) + 1, 'updated_at', now(), 'updated_by', $4::text)),
            updated_at = now()
      WHERE coachee_id = $1 AND (COALESCE((sections->($2::text)->>'version')::int, 0) = $5 OR sections->($2::text)->>'updated_by' = $4::text)
      RETURNING (sections->($2::text)->>'version')::int AS version, sections->($2::text)->>'updated_at' AS saved_at`,
    [c.id, key, body, user.id, baseVersion, src],
  );
  if (!row) {
    const now = await one<{ sections: unknown }>("SELECT sections FROM business_plans WHERE coachee_id = $1", [c.id]);
    const s = normalizeSections(now?.sections)[key];
    const by = s.updated_by ? await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [s.updated_by]) : null;
    return { ok: false, error: "Jemand anderes hat dieses Kapitel gerade geändert.", conflict: { text: s.text, sources: s.sources, version: s.version, by: by?.name ?? null } };
  }
  await auditThrottled(user, "bp_saved", c.id, { section: key });
  return { ok: true, version: row.version, savedAt: row.saved_at };
}

export async function saveTitle(coacheeId: string, title: string) {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  await query("UPDATE business_plans SET title = $2, updated_at = now() WHERE coachee_id = $1", [c.id, String(title ?? "").trim().slice(0, 120)]);
  return { ok: true };
}

/** „Auf einen Blick“: Liste aus Bezeichnung und Angabe, wird als Ganzes gespeichert */
export async function saveGlance(coacheeId: string, glance: GlanceItem[]) {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [c.id, JSON.stringify(normalizeGlance(glance))]);
  await auditThrottled(user, "bp_saved", c.id, { section: "blick" });
  return { ok: true as const };
}

// ---------- Schreibhilfe (nur Coach) ----------
// Das Schreiben selbst läuft über /api/businessplan/[id]/schreibhilfe, damit das automatische Speichern nicht warten muss.

/** Notizen zum ganzen Vorhaben: Material für alle Kapitel */
export async function saveProjectNotes(coacheeId: string, notes: string) {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  await query(
    `INSERT INTO bp_notes (coachee_id, section, notes, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (coachee_id, section) DO UPDATE SET notes = EXCLUDED.notes, updated_by = $4, updated_at = now()`,
    [c.id, VORHABEN, String(notes ?? "").slice(0, MAX_NOTE), coach.id],
  );
  await auditThrottled(coach, "bp_notes_saved", c.id);
  return { ok: true as const };
}

/** Notiz zu einem Kapitel merken, ohne dass die KI schreibt */
export async function addChapterNote(coacheeId: string, key: string, text: string): Promise<ChatTurn[] | null> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const body = String(text ?? "").trim().slice(0, MAX_NOTE);
  if (!SECTIONS.some((s) => s.key === key) || !body) return null;
  return appendTurns(c.id, key, coach.id, [{ id: randomUUID(), role: "coach", text: body, at: new Date().toISOString() }]);
}

/** Vorschlag als übernommen oder verworfen markieren (das Übernehmen des Textes macht der Editor über saveSection) */
export async function markProposal(coacheeId: string, key: string, turnId: string, status: "uebernommen" | "verworfen"): Promise<ChatTurn[]> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  if (!SECTIONS.some((s) => s.key === key) || (status !== "uebernommen" && status !== "verworfen")) return [];
  const next = await setTurnStatus(c.id, key, [String(turnId)], status);
  if (status === "uebernommen") await audit(coach.id, "bp_draft_applied", c.id, { section: key });
  return next;
}

/** Verlauf eines Kapitels leeren (Notizen und Vorschläge) */
export async function clearChapterChat(coacheeId: string, key: string) {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  await query("DELETE FROM bp_notes WHERE coachee_id = $1 AND section = $2 AND section <> $3", [c.id, String(key), VORHABEN]);
  return { ok: true as const };
}

// ---------- Finanzplan ----------

export type FinanceSave = { ok: true; version: number } | { ok: false; error: string; conflict?: { by: string | null; version: number } };

export async function saveFinance(coacheeId: string, baseVersion: number, raw: unknown): Promise<FinanceSave> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const f = normalizeFinance(raw);
  const row = await one<{ finance_version: number }>(
    `UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3, updated_at = now()
      WHERE coachee_id = $1 AND (finance_version = $4 OR finance_updated_by = $3) RETURNING finance_version`,
    [c.id, JSON.stringify(f), user.id, baseVersion],
  );
  if (!row) {
    const now = await one<{ name: string | null; finance_version: number }>("SELECT u.name, bp.finance_version FROM business_plans bp LEFT JOIN users u ON u.id = bp.finance_updated_by WHERE bp.coachee_id = $1", [c.id]);
    return { ok: false, error: "Jemand anderes hat den Finanzplan gerade geändert.", conflict: { by: now?.name ?? null, version: now?.finance_version ?? 0 } };
  }
  await auditThrottled(user, "finance_saved", c.id);
  return { ok: true, version: row.finance_version };
}

/** Zahlen aus den Gesprächen (Reiter „Zahlen“) neu in den Finanzplan übernehmen. Ersetzt die bisherigen Eingaben. */
export async function importFinanceItems(coacheeId: string): Promise<{ ok: true; finance: FinanceInput; version: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const items = await financeItems(c.id);
  if (!items.length) return { ok: false, error: "Es gibt noch keine Zahlen aus den Gesprächen." };
  const current = await one<{ finance: unknown }>("SELECT finance FROM business_plans WHERE coachee_id = $1", [c.id]);
  const before = normalizeFinance(current?.finance);
  const f = { ...financeFromItems(items), start: before.start };
  await saveSnapshot(c.id, before, "Vor der Übernahme der Zahlen aus den Gesprächen", user.id);
  const row = await one<{ finance_version: number }>(
    "UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3, updated_at = now() WHERE coachee_id = $1 RETURNING finance_version",
    [c.id, JSON.stringify(f), user.id],
  );
  await audit(user.id, "finance_imported", c.id, { items: String(items.length) });
  return { ok: true, finance: f, version: row!.finance_version };
}

// ---------- Übernahme aus Word und Excel (nur Coach) ----------

/** Datei im Businessplan- oder Finanzplan-Bereich hochladen: wird unter Dokumente abgelegt und übernommen. */
export async function importPlanFile(coacheeId: string, fd: FormData): Promise<ImportResult> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei ausgewählt." };
  const ext = extOf(file.name);
  if (ext !== "docx" && ext !== "xlsx") return { ok: false, error: "Bitte eine Word-Datei (.docx) für den Businessplan oder eine Excel-Datei (.xlsx) für den Finanzplan wählen." };
  if (file.size > MAX_DOC_BYTES) return { ok: false, error: "Die Datei ist größer als 25 MB." };
  const data = Buffer.from(await file.arrayBuffer());
  const category = ext === "docx" ? "businessplan" : "finanzplan";
  // erst prüfen, ob die Datei passt, dann ablegen
  const result = ext === "docx" ? await applyPlanDocx(coach, c, data, { document: null, name: file.name }) : await applyFinanceXlsx(coach, c, data, { document: null, name: file.name });
  if (!result.ok) return result;
  const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: file.name, mime: DOC_TYPES[ext], data, userId: coach.id });
  const plain = await extractDocumentText(file.name, data);
  const doc = await one<{ id: string }>(
    "INSERT INTO documents (coachee_id, file_id, category, title, extracted_text, created_by, parser_version) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [c.id, fileId, category, file.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim().slice(0, 200) || file.name, plain || null, coach.id, PARSER_VERSION],
  );
  await query(`UPDATE business_plans SET imports = jsonb_set(imports, ARRAY[$2::text, 'document'], to_jsonb($3::text)) WHERE coachee_id = $1 AND imports ? $2`, [c.id, ext === "docx" ? "plan" : "finance", doc!.id]);
  revalidatePath(`/coach/coachees/${c.id}`);
  return { ...result, message: `${result.message} Die Datei liegt unter Dokumente.` };
}

/** Ein unter Dokumente abgelegtes Word- oder Excel-Dokument übernehmen */
export async function importDocument(coacheeId: string, docId: string): Promise<ImportResult> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const doc = await documentFile(c.id, coach.id, docId);
  if (!doc) return { ok: false, error: "Dokument nicht gefunden." };
  const target = importTarget(doc.category, doc.name);
  if (!target) return { ok: false, error: "Übernehmen geht nur mit einem Businessplan als .docx oder einem Finanzplan als .xlsx." };
  const data = await loadFile(doc.file_id);
  const result = target === "plan" ? await applyPlanDocx(coach, c, data, { document: doc.id, name: doc.name }) : await applyFinanceXlsx(coach, c, data, { document: doc.id, name: doc.name });
  revalidatePath(`/coach/coachees/${c.id}`);
  return result;
}

/**
 * KI im Finanzplan (nur Coach): trägt die Angaben des Coachs in den Finanzplan ein. Gespeichert wird über das normale
 * automatische Speichern im Editor, damit „Rückgängig“ und der Schutz vor gleichzeitigen Änderungen greifen.
 */
export async function askFinanceAi(coacheeId: string, current: unknown, message: string, earlier: FinanceTurn[]): Promise<{ ok: true; finance: FinanceInput; note: string } | { ok: false; error: string }> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const text = message.trim().slice(0, 4000);
  if (!text) return { ok: false, error: "Bitte schreib, was eingetragen oder geändert werden soll." };
  try {
    await assertAiAllowed(coach, { coachOnly: true });
    const turns = (Array.isArray(earlier) ? earlier : []).slice(-6).map((t) => ({ message: String(t?.message ?? "").slice(0, 2000), note: String(t?.note ?? "").slice(0, 1000) }));
    const res = await changeFinance(coach, c, normalizeFinance(current), text, turns);
    await auditThrottled(coach, "finance_ai", c.id);
    return { ok: true, ...res };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("KI im Finanzplan", e);
    return { ok: false, error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

// ---------- Frühere Fassungen (nur Coach) ----------

export async function financeVersions(coacheeId: string): Promise<Version[]> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  return listVersions(c.id);
}

/** Eine frühere Fassung laden, damit der Coach sie ansehen und ganz oder teilweise zurückholen kann */
export async function loadFinanceVersion(coacheeId: string, source: "fassung" | "sicherung", id: string): Promise<{ ok: true; finance: FinanceInput; gist: FinanceGist } | { ok: false; error: string }> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  try {
    const f = source === "fassung" ? await snapshotFinance(c.id, id) : await backupFinance(c.id, id);
    if (!f) return { ok: false, error: source === "fassung" ? "Diese Fassung gibt es nicht mehr." : "In dieser Sicherung steht für diese Person noch kein Finanzplan." };
    return { ok: true, finance: f, gist: gist(f) };
  } catch (e) {
    console.error("Frühere Fassung laden", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Falscher Schlüssel") ? "Die Sicherung lässt sich mit dem jetzigen Schlüssel nicht öffnen." : "Die Sicherung ließ sich nicht lesen." };
  }
}

/** Vor dem Zurückholen: den jetzigen Stand als Fassung ablegen */
export async function keepCurrentFinance(coacheeId: string, reason: string) {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const row = await one<{ finance: unknown }>("SELECT finance FROM business_plans WHERE coachee_id = $1", [c.id]);
  if (row) await saveSnapshot(c.id, normalizeFinance(row.finance), reason, coach.id);
  await audit(coach.id, "finance_restored", c.id, { reason: reason.slice(0, 120) });
}
