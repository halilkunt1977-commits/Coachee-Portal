import "server-only";
import { aiEnabled, jsonResponse, pseudonymize } from "../ai";
import { one, query, transaction } from "../db";
import { loadFile, removeFile, storeFile } from "../files";
import { htmlToPdf } from "../cv/pdf";
import { PARSER_VERSION } from "../documents-text";
import { fillSheet, isBlankForm } from "./fill";
import { DOC_TEXT_MAX, renderDokuHtml, sheetsOf, type DokuRow } from "./render";

/*
 * Aus jeder Gesprächsnotiz entsteht der Eintrag für die Beratungsdokumentation des Trägers, und bei
 * AVOCONS-Coachees liegt danach die fertige Dokumentation als PDF in den Dokumenten. Liegt das Original-Formular
 * von AVOCONS in den Dokumenten (per Mail oder hochgeladen), wird es Blatt für Blatt ausgefüllt, sonst der Nachbau.
 */

type MeetingText = { id: string; coachee_id: string; title: string; notes: string; results: string; next_steps: string };

/** Ohne KI: Thema und Ergebnisse, gekürzt auf das, was in die Zeile passt */
export function plainDocText(m: { title: string; results: string; notes: string }) {
  const body = (m.results || m.notes).replace(/\s+/g, " ").trim();
  const text = body ? `${m.title.replace(/[.:]\s*$/, "")}: ${body}` : m.title;
  return text.length > DOC_TEXT_MAX ? `${text.slice(0, DOC_TEXT_MAX - 1).replace(/\s+\S*$/, "")}…` : text;
}

const INSTRUCTIONS = `Du schreibst für die Beratungsdokumentation eines AVGS-Coachings (Formular des Bildungsträgers, das die Agentur für Arbeit prüfen kann) den Eintrag „Inhalt des Coachings“ zu einem Termin.
Stil wie in diesen Beispielen:
- „Bestandsaufnahme der beruflichen Situation, Analyse von Lebenslauf, Zeugnissen und bisherigen Tätigkeiten. Klärung beruflicher Ziele mit Schwerpunkt Ausbau der Unterrichtstätigkeit.“
- „Entwicklung einer Bewerbungsstrategie für Rothenburg und Online-Tätigkeiten. Überarbeitung und Professionalisierung des Lebenslaufs sowie Vorbereitung gezielter Bewerbungen bei Bildungsträgern.“
Regeln: sachlicher Nominalstil, 2 bis 3 Sätze, höchstens ${DOC_TEXT_MAX - 20} Zeichen, nur Inhalte, Methoden und Ergebnisse des Coachings.
Niemals: Namen, Gesundheit, Krankheiten, Behinderung, Familie, Schulden, Religion oder andere private Details; keine Bewertung der Person; keine Erfindungen.`;

export async function writeDocText(meetingId: string, userId: string) {
  const m = await one<MeetingText & { first_name: string; last_name: string; coaching_type: string }>(
    `SELECT m.id, m.coachee_id, m.title, m.notes, m.results, m.next_steps, c.first_name, c.last_name, c.coaching_type
       FROM meetings m JOIN coachees c ON c.id = m.coachee_id WHERE m.id = $1`,
    [meetingId],
  );
  if (!m) return;
  let text = plainDocText(m);
  if (aiEnabled() && `${m.notes}${m.results}`.trim().length >= 20) {
    const input = pseudonymize(
      `Art des Coachings: ${m.coaching_type === "gruendung" ? "Existenzgründung" : "Jobcoaching"}\nThema: ${m.title}\nNotizen:\n${m.notes}\nErgebnisse:\n${m.results || "-"}\nNächste Schritte:\n${m.next_steps || "-"}`,
      [m.first_name, m.last_name],
    );
    try {
      const r = await jsonResponse<{ text: string }>({
        coacheeId: m.coachee_id, userId, purpose: "meeting_doc", instructions: INSTRUCTIONS, input, schemaName: "dokumentation", maxTokens: 1500,
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      });
      const t = r.text.replace(/\s+/g, " ").trim();
      if (t) text = t.length > DOC_TEXT_MAX ? `${t.slice(0, DOC_TEXT_MAX - 1).replace(/\s+\S*$/, "")}…` : t;
    } catch (error) {
      console.error("[doku] text", error);
    }
  }
  // Nur überschreiben, solange der Coach den Text nicht selbst geändert hat
  await query("UPDATE meetings SET doc_text = $2 WHERE id = $1 AND doc_auto", [meetingId, text]);
}

export const isAvocons = (traeger: string | null) => traeger === "avocons";

/** Kopf und Zeilen der Dokumentation; Gespräche ohne UE (z. B. Telefonnotizen) gehören nicht hinein */
export async function dokuData(coacheeId: string) {
  const c = await one<{ first_name: string; last_name: string; voucher_number: string | null; measure_type: string | null; units_total: number | null; start_date: string | null; end_date: string | null; coach: string }>(
    `SELECT c.first_name, c.last_name, c.voucher_number, c.measure_type, c.units_total::float AS units_total, c.start_date::text, c.end_date::text, u.name AS coach
       FROM coachees c JOIN users u ON u.id = c.coach_id WHERE c.id = $1`,
    [coacheeId],
  );
  if (!c) return null;
  const meetings = await query<{ held_on: string; units: number; doc_text: string; title: string; results: string; notes: string; format: string }>(
    "SELECT held_on::text, units::float AS units, doc_text, title, results, notes, format FROM meetings WHERE coachee_id = $1 AND units > 0 ORDER BY held_on, created_at",
    [coacheeId],
  );
  const times = await timesOf(coacheeId);
  const rows: DokuRow[] = meetings.map((m) => ({ held_on: m.held_on, units: m.units, text: m.doc_text || plainDocText(m), online: m.format !== "praesenz", time: times.get(m.held_on) }));
  const measure = c.measure_type || (c.units_total ? `(${c.units_total} UE)` : "");
  return { head: { name: `${c.first_name} ${c.last_name}`, customerNo: c.voucher_number ?? "", measure, from: c.start_date, to: c.end_date, coach: c.coach }, rows };
}

/** Uhrzeit je Tag („09:00–10:30“): aus der Anwesenheit des Trägers, sonst aus dem Kalender */
async function timesOf(coacheeId: string) {
  const [att, cal] = await Promise.all([
    query<{ day: string; t: string }>(
      "SELECT held_on::text AS day, to_char(min(starts_at), 'HH24:MI') || '–' || to_char(max(ends_at), 'HH24:MI') AS t FROM attendance WHERE coachee_id = $1 AND starts_at IS NOT NULL AND ends_at IS NOT NULL GROUP BY held_on",
      [coacheeId],
    ),
    query<{ day: string; t: string }>(
      `SELECT (starts_at AT TIME ZONE 'Europe/Berlin')::date::text AS day,
              to_char(min(starts_at AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') || '–' || to_char(max(ends_at AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') AS t
         FROM appointments WHERE coachee_id = $1 AND status = 'geplant' GROUP BY 1`,
      [coacheeId],
    ),
  ]);
  return new Map([...cal, ...att].map((x) => [x.day, x.t]));
}

/** Neuestes leeres Original-Formular in den Dokumenten; wird beim Fund als Vorlage einsortiert (nicht zum Unterschreiben) */
export async function blankForm(coacheeId: string) {
  const docs = await query<{ id: string; file_id: string; category: string }>(
    `SELECT d.id, d.file_id, d.category FROM documents d JOIN files f ON f.id = d.file_id
      WHERE d.coachee_id = $1 AND d.generated IS NULL AND f.mime = 'application/pdf'
        AND (d.title ~* 'dokumentation' OR f.name ~* 'dokumentation' OR d.extracted_text ILIKE '%Beratungsdokumentation%')
      ORDER BY d.created_at DESC LIMIT 5`,
    [coacheeId],
  );
  for (const d of docs) {
    const data = await loadFile(d.file_id).catch(() => null);
    if (!data || !(await isBlankForm(data))) continue;
    if (d.category !== "dokumentation") await query("UPDATE documents SET category = 'dokumentation', signature = NULL, extracted = NULL WHERE id = $1", [d.id]);
    return data;
  }
  return null;
}

/** Ein Blatt des Original-Formulars (Nummer ab 1) */
async function formSheet(template: Uint8Array, data: NonNullable<Awaited<ReturnType<typeof dokuData>>>, n: number) {
  const sheets = sheetsOf(data.rows);
  const before = sheets.slice(0, n - 1).flat().reduce((a, r) => a + r.units, 0);
  return fillSheet(template, sheets[n - 1] ?? [], { coach: data.head.coach, sheet: n, before });
}

/** PDF zum Ansehen: mit Original-Formular das gewünschte (sonst das aktuelle) Blatt, ohne den Nachbau mit allen Blättern */
export async function dokuPdf(coacheeId: string, blatt?: number) {
  const data = await dokuData(coacheeId);
  if (!data) return null;
  const template = await blankForm(coacheeId);
  if (template) {
    const count = sheetsOf(data.rows).length;
    const n = blatt && blatt >= 1 && blatt <= count ? blatt : count;
    return { pdf: await formSheet(template, data, n), sheet: n, ...data };
  }
  return { pdf: await htmlToPdf(renderDokuHtml(data.head, data.rows)), sheet: null, ...data };
}

/** Erzeugtes Dokument anlegen oder ersetzen (Unterschrift-Status bleibt) */
async function putGenerated(coacheeId: string, key: string, title: string, fileName: string, pdf: Buffer, userId: string) {
  const name = fileName.replace(/[\\/:*?"<>|]/g, "");
  const fileId = await storeFile({ coacheeId, kind: "dokument", name, mime: "application/pdf", data: pdf, userId });
  const old = await transaction(async (db) => {
    const prev = await db.query<{ file_id: string }>("SELECT file_id FROM documents WHERE coachee_id = $1 AND generated = $2", [coacheeId, key]);
    if (prev.rows.length) {
      await db.query("UPDATE documents SET file_id = $3, title = $4, created_at = now() WHERE coachee_id = $1 AND generated = $2", [coacheeId, key, fileId, title]);
      await db.query("DELETE FROM files WHERE id = $1", [prev.rows[0].file_id]);
    } else {
      await db.query(
        "INSERT INTO documents (coachee_id, file_id, category, title, signature, generated, created_by, parser_version) VALUES ($1,$2,'dokumentation',$3,'offen',$4,$5,$6)",
        [coacheeId, fileId, title, key, userId, PARSER_VERSION],
      );
    }
    return prev.rows[0]?.file_id ?? null;
  });
  if (old) await removeFile(old).catch(() => {});
  return fileId;
}

/** Erzeugte Dokumente entfernen, die nicht mehr gebraucht werden (unterschriebene bleiben) */
async function dropGenerated(coacheeId: string, keep: string[]) {
  const gone = await query<{ file_id: string }>(
    `DELETE FROM documents WHERE coachee_id = $1 AND (generated = 'avocons_doku' OR generated LIKE 'avocons_doku\\_%')
       AND NOT (generated = ANY($2)) AND signature IS DISTINCT FROM 'unterschrieben' RETURNING file_id`,
    [coacheeId, keep],
  );
  for (const g of gone) {
    await query("DELETE FROM files WHERE id = $1", [g.file_id]);
    await removeFile(g.file_id).catch(() => {});
  }
}

/** Dokumentation neu erzeugen und in der Akte ablegen */
export async function refreshDoku(coacheeId: string, userId: string) {
  const data = await dokuData(coacheeId);
  if (!data || !data.rows.length) return null;
  const template = await blankForm(coacheeId);
  if (!template) {
    const sheets = sheetsOf(data.rows).length;
    const title = `Beratungsdokumentation AVOCONS (${sheets === 1 ? "Blatt 1" : `Blatt 1–${sheets}`}, ${data.rows.length} Termine)`;
    await putGenerated(coacheeId, "avocons_doku", title, `Beratungsdokumentation ${data.head.name}.pdf`, await htmlToPdf(renderDokuHtml(data.head, data.rows)), userId);
    await dropGenerated(coacheeId, ["avocons_doku"]);
    return true;
  }
  // Original-Formular: jedes Blatt ein eigenes Dokument, weil jedes Blatt einzeln unterschrieben und hochgeladen wird
  const signed = new Set(
    (await query<{ generated: string }>("SELECT generated FROM documents WHERE coachee_id = $1 AND generated LIKE 'avocons_doku\\_%' AND signature = 'unterschrieben'", [coacheeId])).map((d) => d.generated),
  );
  const sheets = sheetsOf(data.rows);
  const keys: string[] = [];
  for (let n = 1; n <= sheets.length; n++) {
    const key = `avocons_doku_${n}`;
    keys.push(key);
    if (signed.has(key)) continue;
    const terms = sheets[n - 1].length;
    await putGenerated(coacheeId, key, `Beratungsdokumentation AVOCONS Blatt ${n} (${terms} ${terms === 1 ? "Termin" : "Termine"})`, `Beratungsdokumentation ${data.head.name} Blatt ${n}.pdf`, await formSheet(template, data, n), userId);
  }
  await dropGenerated(coacheeId, keys);
  return true;
}

/** Nach dem Ablegen einer Datei: Ist es das Formular von AVOCONS, gleich die Blätter erzeugen */
export async function afterFormFiled(coacheeId: string, fileName: string, userId: string) {
  if (!/dokumentation/i.test(fileName) || !/\.pdf$/i.test(fileName)) return;
  const c = await one<{ traeger: string | null }>("SELECT traeger FROM coachees WHERE id = $1", [coacheeId]);
  if (!c || !isAvocons(c.traeger)) return;
  await refreshDoku(coacheeId, userId).catch((e) => console.error("[doku] formular", e));
}
