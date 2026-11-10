/*
 * Interview-Training mit Kamera und Mikrofon (Typen für Browser und Server). Die Mimik wird im Browser gemessen
 * (components/jobs/face.ts), nur Zahlen gehen an den Server; Aufnahmen werden in Text umgewandelt und nicht gespeichert.
 */
export type TrainingLang = "de" | "tr";
/** Gegenüber im Training: f = Interviewerin, m = Interviewer */
export type TrainingVoice = "f" | "m";
export const isTrainingVoice = (v: unknown): v is TrainingVoice => v === "f" || v === "m";

/** Wie viele Fragen: kurz, normal, ausführlich */
export const QUESTION_COUNTS = [6, 10, 15] as const;
export const DEFAULT_COUNT = 10;

/** Name des Gegenübers von Gründarium */
export const INTERVIEWER: Record<TrainingVoice, Record<TrainingLang, string>> = {
  f: { de: "Lena Berger", tr: "Elif Yılmaz" },
  m: { de: "Jonas Keller", tr: "Emre Kaya" },
};

/** Begrüßung vor der ersten Frage und Abschied nach der letzten */
export function welcomeText(lang: TrainingLang, voice: TrainingVoice) {
  const name = INTERVIEWER[voice][lang];
  return lang === "tr"
    ? `Merhaba, hoş geldiniz. Benim adım ${name}. Zaman ayırdığınız için teşekkür ederim. Şimdi size pozisyonla ilgili birkaç soru soracağım. Gerçek bir mülakattaki gibi, sakin bir şekilde cevap verin.`
    : `Guten Tag und herzlich willkommen. Mein Name ist ${name}. Schön, dass Sie sich Zeit nehmen. Ich stelle Ihnen gleich einige Fragen zur Stelle. Antworten Sie ganz in Ruhe, so wie im echten Gespräch.`;
}
export function goodbyeText(lang: TrainingLang) {
  return lang === "tr"
    ? "Görüşme için çok teşekkür ederim. Cevaplarınıza şimdi bakıyorum, birazdan değerlendirmenizi alacaksınız."
    : "Vielen Dank für das Gespräch. Ich schaue mir Ihre Antworten jetzt an, gleich bekommen Sie Ihre Auswertung.";
}

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
  voice: TrainingVoice;
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
    answers: (Array.isArray(r.answers) ? r.answers : []).slice(0, 20).map((a) => {
      const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return { score: score(o.score), good: s(o.good, 1200), improve: s(o.improve, 1200), better: s(o.better, 2500) };
    }),
  };
}
