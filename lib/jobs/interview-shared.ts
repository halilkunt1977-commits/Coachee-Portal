/*
 * Gesprächsvorbereitung je Stelle (applications.interview). Ohne "server-only", weil der Editor des Coachs im Browser
 * dieselben Typen und Grenzen nutzt. Erzeugt wird sie in lib/jobs/interview.ts, nur vom Coach.
 */
export type InterviewQuestion = {
  /** Frage, wie der Arbeitgeber sie stellen würde */
  question: string;
  /** Antwortvorschlag in der Ich-Form */
  answer: string;
  /** Worauf der Arbeitgeber hinauswill und worauf der Coachee achten sollte */
  tips: string;
  /** Mögliche Nachfragen */
  followups: string[];
};

export type Interview = {
  /** Worauf es bei dieser Stelle im Gespräch ankommt */
  focus: string;
  questions: InterviewQuestion[];
  /** Auftreten: Ankunft, Begrüßung, Körpersprache, Kleidung */
  behavior: string[];
  /** Was der Coachee mitnimmt */
  bring: string[];
  /** Was er lieber lässt */
  avoid: string[];
  /** Fragen an den Arbeitgeber */
  ask: string[];
  /** Empfehlungen des Coachs, frei geschrieben. Geht nie an die KI und bleibt beim Neu-Erstellen erhalten. */
  coach: string;
};

export const LIST_SECTIONS = [
  { key: "behavior", title: "So trittst du auf", hint: "Ankunft, Begrüßung, Körpersprache, Kleidung" },
  { key: "bring", title: "Das nimmst du mit", hint: "Unterlagen und Nachweise" },
  { key: "avoid", title: "Das lässt du lieber", hint: "Was im Gespräch nicht gut ankommt" },
  { key: "ask", title: "Deine Fragen an den Arbeitgeber", hint: "Zeigt Interesse am Ende des Gesprächs" },
] as const satisfies readonly { key: keyof Interview; title: string; hint: string }[];

export type ListKey = (typeof LIST_SECTIONS)[number]["key"];

export const emptyInterview = (): Interview => ({ focus: "", questions: [], behavior: [], bring: [], avoid: [], ask: [], coach: "" });
export const emptyQuestion = (): InterviewQuestion => ({ question: "", answer: "", tips: "", followups: [] });

const MAX_QUESTIONS = 30;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").replace(/\[Name\]\s*/g, "").slice(0, n) : "");
const items = (v: unknown, max = 20) => (Array.isArray(v) ? v.map((x) => clip(x, 500).trim()).filter(Boolean).slice(0, max) : []);

/** Gespeicherte oder vom Coach geschickte Fassung in Form bringen: Längen begrenzen, leere Einträge weg */
export function normalizeInterview(raw: unknown): Interview {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q): InterviewQuestion => {
      const o = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
      return { question: clip(o.question, 500).trim(), answer: clip(o.answer, 3000).trim(), tips: clip(o.tips, 1500).trim(), followups: items(o.followups, 8) };
    })
    .filter((q) => q.question || q.answer)
    .slice(0, MAX_QUESTIONS);
  return {
    focus: clip(r.focus, 2000).trim(),
    questions,
    behavior: items(r.behavior),
    bring: items(r.bring),
    avoid: items(r.avoid),
    ask: items(r.ask),
    coach: clip(r.coach, 8000).trim(),
  };
}

export const isEmptyInterview = (i: Interview) => !i.focus && !i.questions.length && !i.coach && LIST_SECTIONS.every((s) => !i[s.key].length);
