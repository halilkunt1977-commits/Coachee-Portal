import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import { one, query } from "../db";
import type { JobAnalysis } from "./analysis";
import { LIST_SECTIONS, normalizeInterview, type Interview, type InterviewAiTask } from "./interview-shared";
import { profileForAi } from "./store";

/*
 * Gesprächsvorbereitung für eine Stelle, nur vom Coach erzeugt: wahrscheinliche Fragen mit ehrlichem Antwortvorschlag,
 * Nachfragen, Auftreten, Mitbringen, Fragen an den Arbeitgeber. An die KI gehen Stelle, Anzeigentext, das Profil ohne
 * Gesundheitsangaben und interne Einträge (profileForAi), Stärken/Lücken aus der Stellenanalyse und was der Coach unter
 * „Zur Stelle“ über Stelle und Gespräch notiert hat, Namen ersetzt.
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

type AppRow = { id: string; title: string; employer: string; location: string; job_text: string; ad_text: string | null; brief: string; analysis: JobAnalysis | null; interview: unknown };

const loadApp = (c: Coachee, appId: string) =>
  one<AppRow>(
    "SELECT id, title, employer, location, job_text, letter->>'adText' AS ad_text, interview_brief AS brief, analysis, interview FROM applications WHERE id = $1 AND coachee_id = $2",
    [appId, c.id],
  );

/** Stelle, Beschreibung des Coachs, Profil und Einschätzung als Eingabe für die KI, Namen ersetzt */
async function context(c: Coachee, a: AppRow) {
  const profile = await profileForAi(c);
  const ad = a.job_text.trim() || a.ad_text?.trim() || "";
  return [
    `Stelle: ${a.title}`,
    `Arbeitgeber: ${a.employer || "unbekannt"}`,
    `Ort: ${a.location || "unbekannt"}`,
    ad ? `Stellentext:\n${ad.slice(0, 12000)}` : "Stellentext: liegt nicht vor",
    ...(a.brief.trim() ? ["", `Was der Coach über Stelle und Gespräch weiß (wichtig, hat Vorrang):\n${a.brief.slice(0, 6000)}`] : []),
    "",
    "Profil des Coachees (Jobcoaching):",
    profile.empty ? "Noch kein Kompetenzprofil und kein Lebenslauf erfasst." : profile.text,
    ...(a.analysis
      ? ["", "Einschätzung zur Stelle:", ...(a.analysis.strengths ?? []).map((s) => `- Stärke: ${s}`), ...(a.analysis.gaps ?? []).map((s) => `- Lücke: ${s}`)]
      : []),
  ].join("\n");
}

/** Neu erstellen und speichern. Die Empfehlungen des Coachs bleiben, wie sie sind. Prüfen, ob der Aufruf erlaubt ist, muss der Aufrufer. */
export async function prepareInterview(c: Coachee, appId: string, userId: string): Promise<Interview | null> {
  const a = await loadApp(c, appId);
  if (!a) return null;
  const input = pseudonymize(await context(c, a), [c.first_name, c.last_name]);
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

/** Die Fassung, wie sie gerade im Editor steht, als Text für die KI (ohne die Empfehlungen des Coachs) */
function draftText(i: Interview) {
  return [
    `Worauf es ankommt: ${i.focus || "(leer)"}`,
    "Fragen:",
    ...i.questions.map((q, n) => `${n + 1}. ${q.question}\n   Antwort: ${q.answer}\n   Tipp: ${q.tips}\n   Nachfragen: ${q.followups.join(" | ")}`),
    ...LIST_SECTIONS.map((s) => `${s.title}: ${i[s.key].join(" | ") || "(leer)"}`),
  ].join("\n");
}

const QUESTION = SCHEMA.properties.questions.items;
const MORE_SCHEMA = { type: "object", properties: { questions: SCHEMA.properties.questions }, required: ["questions"], additionalProperties: false };
const ONE_SCHEMA = { type: "object", properties: { question: QUESTION }, required: ["question"], additionalProperties: false };

const EDIT_RULES = `Du bist erfahrener Jobcoach in Deutschland und arbeitest an der Gesprächsvorbereitung deines Coachees für genau diese Stelle. Der Coach gibt dir eine Anweisung; setz sie genau um.
Es gelten dieselben Regeln wie bei der Vorbereitung: Fragen in Sie-Form wie vom Arbeitgeber, Antwortvorschläge in der Ich-Form (2–5 Sätze, gesprochen, natürlich), Tipps in Du-Form, ehrlich und nur gestützt auf Profil und Angaben zur Stelle. Was der Coach über Stelle und Gespräch weiß, hat Vorrang. Nichts erfinden, keine Superlative, keine erfundenen Zahlen.
Niemals Gesundheit, Behinderung, Alter, Herkunft, Religion oder Familie des Coachees bewerten oder ansprechen. Namen sind durch [Name] ersetzt; schreibe [Name] nie in den Text. Kein Hinweis auf Software, Auswertungen oder KI: Der Text soll klingen, als hätte der Coach ihn selbst geschrieben.`;

/**
 * KI-Hilfe beim Bearbeiten, ohne zu speichern: ganze Fassung nach Anweisung überarbeiten, weitere Fragen ergänzen oder
 * eine einzelne Frage neu fassen. Grundlage ist die Fassung im Editor; die Empfehlungen des Coachs gehen nie mit.
 * Liefert die neue Fassung, der Coach prüft und speichert selbst. Prüfen, ob der Aufruf erlaubt ist, muss der Aufrufer.
 */
export async function editInterview(c: Coachee, appId: string, userId: string, draft: Interview, task: InterviewAiTask): Promise<Interview | null> {
  const a = await loadApp(c, appId);
  if (!a) return null;
  const instruction = task.instruction.replace(/\r/g, "").trim().slice(0, 2000);
  const base = [await context(c, a), "", "Aktuelle Fassung der Vorbereitung:", draftText(draft)].join("\n");
  const usage = { coacheeId: c.id, userId, purpose: "interview_prep" };
  const names = [c.first_name, c.last_name];

  if (task.mode === "question") {
    const q = draft.questions[task.index];
    if (!q) return draft;
    const r = await jsonResponse<{ question: Interview["questions"][number] }>({
      ...usage,
      instructions: `${EDIT_RULES}\nÜberarbeite nur die genannte Frage mit Antwort, Tipp und Nachfragen. Die übrigen Fragen bleiben, wie sie sind; wiederhole sie nicht.`,
      input: pseudonymize(`${base}\n\nZu überarbeiten: Frage ${task.index + 1}\nAnweisung des Coachs: ${instruction || "Antwort natürlicher, konkreter und näher am Profil formulieren."}`, names),
      schemaName: "gespraechsfrage",
      schema: ONE_SCHEMA,
      maxTokens: 2500,
    });
    const fixed = normalizeInterview({ questions: [r.question] }).questions[0];
    return fixed ? { ...draft, questions: draft.questions.map((x, n) => (n === task.index ? fixed : x)) } : draft;
  }

  if (task.mode === "more") {
    const r = await jsonResponse<{ questions: Interview["questions"] }>({
      ...usage,
      instructions: `${EDIT_RULES}\nErstelle 4–6 weitere wahrscheinliche Fragen des Arbeitgebers für diese Stelle, die in der aktuellen Fassung noch fehlen. Keine Frage doppelt oder nur umformuliert. Folge dem Wunsch des Coachs, wenn er einen nennt (z. B. ein Thema oder eine Art von Fragen).`,
      input: pseudonymize(`${base}\n\nWunsch des Coachs: ${instruction || "keiner, ergänze die wichtigsten noch fehlenden Fragen"}`, names),
      schemaName: "gespraechsfragen",
      schema: MORE_SCHEMA,
      maxTokens: 6000,
    });
    return normalizeInterview({ ...draft, questions: [...draft.questions, ...normalizeInterview({ questions: r.questions }).questions] });
  }

  const r = await jsonResponse<Omit<Interview, "coach">>({
    ...usage,
    instructions: `${EDIT_RULES}\nGib die ganze Vorbereitung überarbeitet zurück (focus, questions, behavior, bring, avoid, ask). Ändere nur, was die Anweisung verlangt; was gut ist, bleibt wörtlich stehen. Reihenfolge der Fragen beibehalten, außer der Coach will es anders.`,
    input: pseudonymize(`${base}\n\nAnweisung des Coachs: ${instruction}`, names),
    schemaName: "gespraechsvorbereitung",
    schema: SCHEMA,
    maxTokens: 9000,
  });
  return normalizeInterview({ ...r, coach: draft.coach });
}
