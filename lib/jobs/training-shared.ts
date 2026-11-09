/*
 * Interview-Training mit Kamera und Mikrofon (Typen für Browser und Server). Die Mimik wird im Browser gemessen
 * (components/jobs/face.ts), nur Zahlen gehen an den Server; Aufnahmen werden in Text umgewandelt und nicht gespeichert.
 */
export type TrainingLang = "de" | "tr";

/** Messwerte einer Antwort aus dem Browser, Anteile 0–1 */
export type FaceMetrics = {
  /** Bilder mit erkanntem Gesicht */
  face: number;
  /** davon mit Blick in die Kamera */
  eye: number;
  /** davon mit Lächeln */
  smile: number;
  /** Kopfbewegung: 0 = ganz ruhig, 1 = sehr unruhig */
  motion: number;
  /** Messung lief (Kamera und Gesichtserkennung verfügbar) */
  ok: boolean;
};

export type TrainingAnswer = { question: string; text: string; seconds: number; metrics: FaceMetrics | null };

export type AnswerReport = { score: number; good: string; improve: string; better: string };
export type TrainingReport = {
  score: number;
  summary: string;
  strengths: string[];
  improve: string[];
  /** Mimik und Auftreten vor der Kamera */
  body: string;
  /** Sprechweise: Tempo, Pausen, Füllwörter */
  speech: string;
  answers: AnswerReport[];
};

export type TrainingRow = {
  id: string;
  title: string;
  interview_lang: TrainingLang;
  feedback_lang: TrainingLang;
  questions: string[];
  answers: TrainingAnswer[];
  report: TrainingReport | null;
  created_at: string;
  finished_at: string | null;
};

export const MAX_ANSWER_SECONDS = 150;
export const TRAINING_QUESTIONS = 6;

const FILLERS: Record<TrainingLang, RegExp> = {
  de: /\b(äh|ähm|öhm|ehm|hm|halt|sozusagen|quasi|irgendwie)\b/gi,
  tr: /(^|\s)(ııı+|ıı|eee+|ee|şey|yani|hani|işte|aslında)(?=[\s,.!?]|$)/gi,
};

/** Sprechweise aus Text und Dauer: Wörter, Tempo (Wörter je Minute), Füllwörter */
export function speechStats(text: string, seconds: number, lang: TrainingLang) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const fillers = (text.match(FILLERS[lang]) ?? []).length;
  return { words, wpm: seconds > 5 ? Math.round((words / seconds) * 60) : 0, fillers };
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Messwerte als kurzer Text für die Auswertung */
export function metricsText(m: FaceMetrics | null) {
  if (!m || !m.ok) return "Kamera-Messung: nicht verfügbar";
  return `Gesicht sichtbar ${pct(m.face)}, Blick in die Kamera ${pct(m.eye)}, Lächeln ${pct(m.smile)}, Kopfbewegung ${m.motion < 0.25 ? "ruhig" : m.motion < 0.55 ? "normal" : "unruhig"}`;
}

export function normalizeReport(raw: unknown): TrainingReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, n = 2000) => (typeof v === "string" ? v.slice(0, n).trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 500)).filter(Boolean).slice(0, 8) : []);
  const score = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  return {
    score: score(r.score),
    summary: s(r.summary),
    strengths: list(r.strengths),
    improve: list(r.improve),
    body: s(r.body),
    speech: s(r.speech),
    answers: (Array.isArray(r.answers) ? r.answers : []).slice(0, 12).map((a) => {
      const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return { score: score(o.score), good: s(o.good, 1200), improve: s(o.improve, 1200), better: s(o.better, 2500) };
    }),
  };
}
