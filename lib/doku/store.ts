import "server-only";
import { aiEnabled, jsonResponse, pseudonymize } from "../ai";
import { one, query, transaction } from "../db";
import { removeFile, storeFile } from "../files";
import { htmlToPdf } from "../cv/pdf";
import { PARSER_VERSION } from "../documents-text";
import { DOC_TEXT_MAX, renderDokuHtml, type DokuRow } from "./render";

/*
 * Aus jeder Gesprächsnotiz entsteht der Eintrag für die Beratungsdokumentation des Trägers, und bei
 * AVOCONS-Coachees liegt danach die fertige Dokumentation (alle Blätter) als PDF in den Dokumenten.
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
  const rows: DokuRow[] = meetings.map((m) => ({ held_on: m.held_on, units: m.units, text: m.doc_text || plainDocText(m), online: m.format !== "praesenz" }));
  const measure = c.measure_type || (c.units_total ? `(${c.units_total} UE)` : "");
  return { head: { name: `${c.first_name} ${c.last_name}`, customerNo: c.voucher_number ?? "", measure, from: c.start_date, to: c.end_date, coach: c.coach }, rows };
}

export async function dokuPdf(coacheeId: string) {
  const data = await dokuData(coacheeId);
  if (!data) return null;
  return { pdf: await htmlToPdf(renderDokuHtml(data.head, data.rows)), ...data };
}

/** Dokumentation neu erzeugen und in der Akte ablegen (ersetzt die vorige Fassung, Unterschrift-Status bleibt) */
export async function refreshDoku(coacheeId: string, userId: string) {
  const made = await dokuPdf(coacheeId);
  if (!made || !made.rows.length) return null;
  const sheets = Math.ceil(made.rows.length / 4);
  const name = `Beratungsdokumentation ${made.head.name}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  const fileId = await storeFile({ coacheeId, kind: "dokument", name, mime: "application/pdf", data: made.pdf, userId });
  const title = `Beratungsdokumentation AVOCONS (${sheets === 1 ? "Blatt 1" : `Blatt 1–${sheets}`}, ${made.rows.length} Termine)`;
  const old = await transaction(async (db) => {
    const prev = await db.query<{ file_id: string }>("SELECT file_id FROM documents WHERE coachee_id = $1 AND generated = 'avocons_doku'", [coacheeId]);
    if (prev.rows.length) {
      await db.query("UPDATE documents SET file_id = $2, title = $3, created_at = now() WHERE coachee_id = $1 AND generated = 'avocons_doku'", [coacheeId, fileId, title]);
      await db.query("DELETE FROM files WHERE id = $1", [prev.rows[0].file_id]);
    } else {
      await db.query(
        "INSERT INTO documents (coachee_id, file_id, category, title, signature, generated, created_by, parser_version) VALUES ($1,$2,'dokumentation',$3,'offen','avocons_doku',$4,$5)",
        [coacheeId, fileId, title, userId, PARSER_VERSION],
      );
    }
    return prev.rows[0]?.file_id ?? null;
  });
  if (old) await removeFile(old).catch(() => {});
  return fileId;
}
