import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import { one, query } from "../db";
import type { JobAnalysis } from "./analysis";
import { normalizeInterview, type Interview } from "./interview-shared";
import { profileForAi } from "./store";

/*
 * Gesprächsvorbereitung für eine Stelle, nur vom Coach erzeugt: wahrscheinliche Fragen mit ehrlichem Antwortvorschlag,
 * Nachfragen, Auftreten, Mitbringen, Fragen an den Arbeitgeber. An die KI gehen Stelle, Anzeigentext, das Profil ohne
 * Gesundheitsangaben und interne Einträge (profileForAi) und Stärken/Lücken aus der Stellenanalyse, Namen ersetzt.
 * Die Empfehlungen des Coachs gehen nicht mit (dort kann frei Eingetragenes stehen) und bleiben beim Neu-Erstellen erhalten.
 */
const list = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object",
  properties: {
    focus: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, answer: { type: "string" }, tips: { type: "string" }, followups: list },
        required: ["question", "answer", "tips", "followups"],
        additionalProperties: false,
      },
    },
    behavior: list,
    bring: list,
    avoid: list,
    ask: list,
  },
  required: ["focus", "questions", "behavior", "bring", "avoid", "ask"],
  additionalProperties: false,
};

const INSTRUCTIONS = `Du bist erfahrener Jobcoach in Deutschland und bereitest deinen Coachee auf das Vorstellungsgespräch für genau diese Stelle vor. Der Coach liest alles, passt es an und gibt es dem Coachee.
Grundlage sind nur die Angaben zur Stelle und das Profil (Lebenslauf und Kompetenzprofil). Erfinde keine Anforderungen der Stelle und nichts über den Coachee.
- focus: 2–4 Sätze in Du-Form: worauf es bei dieser Stelle im Gespräch ankommt und womit du ehrlich punkten kannst. Fehlt der Stellentext, sag, dass sich die Vorbereitung an typischen Anforderungen des Berufs orientiert.
- questions: 10–12 wahrscheinliche Fragen des Arbeitgebers für diese Stelle, in der Reihenfolge eines typischen Gesprächs (kurze Vorstellung, Motivation für Stelle und Betrieb, Erfahrung und fachliche Fragen zu den Aufgaben, Stärken und Schwächen, Lücken oder Wechsel im Lebenslauf, Arbeitszeiten, Gehaltsvorstellung, frühester Eintritt). Je Frage:
  - question: die Frage, wie der Arbeitgeber sie stellen würde (Sie-Form).
  - answer: Antwortvorschlag in der Ich-Form, 2–5 Sätze, gesprochen und natürlich, gestützt auf konkrete Stationen und Kenntnisse aus dem Profil. Ehrlich und nicht übertrieben: nur, was im Profil belegt ist. Fehlt etwas, offen sagen und zeigen, wie man es lernt oder ausgleicht. Keine Superlative, keine erfundenen Zahlen oder Erfolge. Bei der Gehaltsfrage eine Spanne als Platzhalter nennen, die der Coach anpasst.
  - tips: 1–3 Sätze in Du-Form: worauf der Arbeitgeber mit der Frage hinauswill und worauf du achtest.
  - followups: 1–3 mögliche Nachfragen des Arbeitgebers.
- behavior: 5–8 konkrete Hinweise in Du-Form zum Auftreten: etwa 10 Minuten vorher da sein, Begrüßung, Körpersprache und Blickkontakt, Kleidung passend zur Branche dieser Stelle, Handy aus, ruhig nachfragen, wenn du etwas nicht verstehst, Dank am Ende.
- bring: 3–6 Dinge zum Mitnehmen (z. B. Bewerbungsmappe, Ausweis, Zeugnisse und Nachweise, die für diese Stelle zählen, Stift und Notizen mit deinen Fragen).
- avoid: 3–6 Dinge, die du lieber lässt (z. B. schlecht über frühere Arbeitgeber reden, Antworten auswendig aufsagen, Unwahres sagen). Dazu ein Hinweis: Fragen nach Gesundheit, Schwangerschaft, Familienplanung, Religion oder Partei sind meist unzulässig; du musst sie nicht beantworten und lenkst freundlich zur Stelle zurück.
- ask: 4–6 gute Fragen an den Arbeitgeber, passend zu dieser Stelle (Einarbeitung, Team, typischer Arbeitstag, nächste Schritte).
Allgemein: einfache, klare Sprache, kurze Sätze. Niemals Gesundheit, Behinderung, Alter, Herkunft, Religion oder Familie des Coachees bewerten oder ansprechen. Namen sind durch [Name] ersetzt; schreibe [Name] nie in den Text. Kein Hinweis auf Software, Auswertungen oder KI.`;

type AppRow = { id: string; title: string; employer: string; location: string; job_text: string; ad_text: string | null; analysis: JobAnalysis | null; interview: unknown };

/** Neu erstellen und speichern. Die Empfehlungen des Coachs bleiben, wie sie sind. Prüfen, ob der Aufruf erlaubt ist, muss der Aufrufer. */
export async function prepareInterview(c: Coachee, appId: string, userId: string): Promise<Interview | null> {
  const a = await one<AppRow>(
    "SELECT id, title, employer, location, job_text, letter->>'adText' AS ad_text, analysis, interview FROM applications WHERE id = $1 AND coachee_id = $2",
    [appId, c.id],
  );
  if (!a) return null;
  const profile = await profileForAi(c);
  const ad = a.job_text.trim() || a.ad_text?.trim() || "";
  const input = pseudonymize(
    [
      `Stelle: ${a.title}`,
      `Arbeitgeber: ${a.employer || "unbekannt"}`,
      `Ort: ${a.location || "unbekannt"}`,
      ad ? `Stellentext:\n${ad.slice(0, 12000)}` : "Stellentext: liegt nicht vor",
      "",
      "Profil des Coachees (Jobcoaching):",
      profile.empty ? "Noch kein Kompetenzprofil und kein Lebenslauf erfasst." : profile.text,
      ...(a.analysis
        ? ["", "Einschätzung zur Stelle:", ...(a.analysis.strengths ?? []).map((s) => `- Stärke: ${s}`), ...(a.analysis.gaps ?? []).map((s) => `- Lücke: ${s}`)]
        : []),
    ].join("\n"),
    [c.first_name, c.last_name],
  );
  const r = await jsonResponse<Omit<Interview, "coach">>({
    coacheeId: c.id,
    userId,
    purpose: "interview_prep",
    instructions: INSTRUCTIONS,
    input,
    schemaName: "gespraechsvorbereitung",
    schema: SCHEMA,
    maxTokens: 9000,
  });
  const interview = normalizeInterview({ ...r, coach: normalizeInterview(a.interview).coach });
  await query("UPDATE applications SET interview = $2, interview_updated_at = now() WHERE id = $1", [a.id, JSON.stringify(interview)]);
  return interview;
}
