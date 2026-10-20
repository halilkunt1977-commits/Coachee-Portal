import "server-only";
import type { Coachee } from "../access";
import { aiEnabled, jsonResponse, pseudonymize } from "../ai";
import { one, query } from "../db";
import { profileForAi } from "./store";

/*
 * Stellenanalyse nur für den Coach: Wie gut passt die gemerkte Stelle zum Coachee, was fehlt, was gehört
 * ins Anschreiben und ins Gespräch. Dazu ein Bericht in Du-Form, den der Coach dem Coachee geben kann.
 */
export type JobAnalysis = {
  fit: "hoch" | "mittel" | "gering";
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  cv_tips: string[];
  letter_tips: string[];
  interview: string[];
  salary: string;
  next_steps: string[];
  report: string;
};

const list = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object",
  properties: {
    fit: { type: "string", enum: ["hoch", "mittel", "gering"] },
    score: { type: "integer" },
    summary: { type: "string" },
    strengths: list,
    gaps: list,
    cv_tips: list,
    letter_tips: list,
    interview: list,
    salary: { type: "string" },
    next_steps: list,
    report: { type: "string" },
  },
  required: ["fit", "score", "summary", "strengths", "gaps", "cv_tips", "letter_tips", "interview", "salary", "next_steps", "report"],
  additionalProperties: false,
};

const INSTRUCTIONS = `Du bist erfahrener Jobcoach in Deutschland und analysierst für den Coach, wie gut eine Stelle zu seinem Coachee passt.
Grundlage sind nur die Angaben zur Stelle und das Profil; erfinde keine Anforderungen. Fehlt der Stellentext, leite typische Anforderungen des Berufs vorsichtig ab und sag das in der Zusammenfassung.
- fit/score: Passung gesamt (score 0–100).
- summary: 2–3 Sätze für den Coach, ehrlich.
- strengths: konkrete Punkte aus dem Profil, die zur Stelle passen.
- gaps: was fehlt oder schwach ist, und wie man es ausgleichen kann.
- cv_tips: was im Lebenslauf für diese Stelle nach vorn gehört oder ergänzt werden sollte.
- letter_tips: Kernargumente fürs Anschreiben.
- interview: 5–8 wahrscheinliche Fragen im Vorstellungsgespräch, passend zur Stelle und zu den Lücken.
- salary: grobe übliche Gehaltsspanne für den Beruf in der Region, als Orientierung, ohne Gewähr.
- next_steps: 3–5 konkrete Schritte bis zur Bewerbung.
- report: Bericht für den Coachee in Du-Form, 150–250 Wörter, motivierend und konkret, mit Stärken, was noch zu tun ist und worauf es im Gespräch ankommt. Ohne Zahlen-Score, ohne Hinweis auf Software oder Auswertungen, als Einschätzung des Coachs.
Niemals Gesundheit, Behinderung, Alter, Herkunft, Religion oder Familie bewerten oder erwähnen.`;

type AppRow = { id: string; title: string; employer: string; location: string; url: string; job_text: string; note: string };

export async function analyzeApplication(c: Coachee, appId: string, userId: string): Promise<JobAnalysis | null> {
  if (!aiEnabled()) return null;
  const a = await one<AppRow>("SELECT id, title, employer, location, url, job_text, note FROM applications WHERE id = $1 AND coachee_id = $2", [appId, c.id]);
  if (!a) return null;
  const profile = await profileForAi(c);
  const input = pseudonymize(
    `Stelle: ${a.title}
Arbeitgeber: ${a.employer || "unbekannt"}
Ort: ${a.location || "unbekannt"}
${a.job_text.trim() ? `Stellentext:\n${a.job_text.slice(0, 12000)}` : "Stellentext: liegt nicht vor"}

Profil des Coachees (Jobcoaching):
${profile.empty ? "Noch kein Kompetenzprofil und kein Lebenslauf erfasst." : profile.text}`,
    [c.first_name, c.last_name],
  );
  const r = await jsonResponse<JobAnalysis>({ coacheeId: c.id, userId, purpose: "job_analysis", instructions: INSTRUCTIONS, input, schemaName: "stellenanalyse", schema: SCHEMA });
  r.score = Math.max(0, Math.min(100, Math.round(r.score)));
  await query("UPDATE applications SET analysis = $2, analyzed_at = now() WHERE id = $1", [a.id, r]);
  return r;
}

export type AnalyzedApp = AppRow & { status: string; analysis: JobAnalysis | null; analyzed_at: string | null };

/** Alle gemerkten und laufenden Bewerbungen mit Analyse; verworfene und abgesagte nicht */
export const appsForAnalysis = (coacheeId: string) =>
  query<AnalyzedApp>(
    `SELECT id, title, employer, location, url, job_text, note, status, analysis, analyzed_at FROM applications
      WHERE coachee_id = $1 AND status IN ('vorschlag', 'gemerkt', 'beworben', 'gespraech') ORDER BY created_at DESC`,
    [coacheeId],
  );
