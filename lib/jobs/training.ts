import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize, transcribe } from "../ai";
import { one, query } from "../db";
import { hasFeature } from "../features";
import { isLetterLang, looksTurkish } from "../letter/types";
import { normalizeInterview } from "./interview-shared";
import { inTurkey } from "../turkey";
import { profileForAi } from "./store";
import {
  MAX_ANSWER_SECONDS,
  DEFAULT_COUNT,
  QUESTION_COUNTS,
  metricsText,
  normalizeReport,
  speechStats,
  type FaceMetrics,
  type TrainingAnswer,
  type TrainingLang,
  type TrainingRow,
  type TrainingVoice,
} from "./training-shared";

/*
 * Interview-Training: Probegespräch je Stelle. Fragen kommen aus der Gesprächsvorbereitung, sonst passend zur Anzeige
 * neu. Gesprochen wird in der Sprache des echten Gesprächs (Türkisch bei türkischen Firmen, sonst Deutsch); die
 * Auswertung kommt in der Sprache der Oberfläche. An die KI gehen nur Stelle, Profil ohne Gesundheitsangaben (profileForAi),
 * die Antworten als Text und Messwerte (Zahlen), Namen ersetzt. Bild und Ton werden nicht gespeichert.
 */

type AppRow = { id: string; title: string; employer: string; location: string; job_text: string; ad_text: string | null; letter_lang: string | null; interview: unknown };

const loadApp = (c: Coachee, appId: string) =>
  one<AppRow>(
    `SELECT id, title, employer, location, job_text, letter->>'adText' AS ad_text, letter_lang,
            COALESCE(interview_sent, CASE WHEN $3 THEN interview END) AS interview
       FROM applications WHERE id = $1 AND coachee_id = $2`,
    [appId, c.id, hasFeature(c, "gespraechsvorbereitung") || hasFeature(c, "gespraechsvorbereitung_selbst")],
  );

/** Sprache des Gesprächs: Türkisch bei Adresse in der Türkei, sonst wie beim Anschreiben gewählt oder bei türkischer Firma */
async function interviewLang(c: Coachee, a: AppRow, turkey: boolean): Promise<TrainingLang> {
  if (turkey) return "tr";
  if (isLetterLang(a.letter_lang)) return a.letter_lang;
  return c.language === "tr" && looksTurkish(a.title, a.employer) ? "tr" : "de";
}

/** Sprache, in der ein neues Training für diese Stelle laufen würde (für die Namen auf der Startseite) */
export async function trainingLangFor(c: Coachee, appId: string): Promise<TrainingLang> {
  const a = await loadApp(c, appId);
  return a ? interviewLang(c, a, await inTurkey(c)) : "de";
}

const LANG_NAME: Record<TrainingLang, string> = { de: "Deutsch", tr: "Türkisch" };

const QUESTIONS_SCHEMA = { type: "object", properties: { questions: { type: "array", items: { type: "string" } } }, required: ["questions"], additionalProperties: false };

async function jobContext(c: Coachee, a: AppRow) {
  const profile = await profileForAi(c);
  const ad = a.job_text.trim() || a.ad_text?.trim() || "";
  return pseudonymize(
    [
      `Stelle: ${a.title}`,
      `Arbeitgeber: ${a.employer || "unbekannt"}`,
      `Ort: ${a.location || "unbekannt"}`,
      ad ? `Stellentext:\n${ad.slice(0, 8000)}` : "Stellentext: liegt nicht vor",
      "",
      "Profil des Bewerbers:",
      profile.empty ? "Keine Angaben." : profile.text,
    ].join("\n"),
    [c.first_name, c.last_name],
  );
}

/** Neues Training anlegen: Fragen bestimmen. Prüfen, ob der Aufruf erlaubt ist, muss der Aufrufer. */
export async function startTraining(c: Coachee, appId: string, userId: string, opts: { count?: number; voice?: TrainingVoice } = {}): Promise<string | null> {
  const count = (QUESTION_COUNTS as readonly number[]).includes(Number(opts.count)) ? Number(opts.count) : DEFAULT_COUNT;
  const voice: TrainingVoice = opts.voice === "m" ? "m" : "f";
  const a = await loadApp(c, appId);
  if (!a) return null;
  const turkey = await inTurkey(c);
  const lang = await interviewLang(c, a, turkey);
  let questions: string[] = [];
  // Deutsche Gesprächsvorbereitung vorhanden: dieselben Fragen üben
  const prep = a.interview ? normalizeInterview(a.interview) : null;
  if (lang === "de" && prep && prep.questions.length >= count) questions = prep.questions.map((q) => q.question).filter(Boolean).slice(0, count);
  if (questions.length < Math.min(count, 4)) {
    const r = await jsonResponse<{ questions: string[] }>({
      coacheeId: c.id,
      userId,
      purpose: "interview_training",
      schemaName: "training_fragen",
      schema: QUESTIONS_SCHEMA,
      maxTokens: 3000,
      instructions: `Du bist Personaler und führst gleich ein Vorstellungsgespräch für genau diese Stelle. Stelle genau ${count} Fragen auf ${LANG_NAME[lang]}, in der Reihenfolge eines echten Gesprächs: kurze Vorstellung, Motivation für Stelle und Firma, Erfahrung und fachliche Fragen zu den Aufgaben der Anzeige (gestützt auf das Profil, auch Lücken oder Wechsel im Lebenslauf), Situationsfragen aus dem Berufsalltag („Was tun Sie, wenn …“), Stärken und Schwächen, Teamarbeit, Arbeitszeiten oder Gehaltsvorstellung, zum Schluss frühester Eintritt oder Fragen des Bewerbers. Bei mehr Fragen mehr fachliche und Situationsfragen.
Jede Frage kurz und gesprochen, höfliche Form (${lang === "tr" ? "„siz“" : "Sie"}). Keine Fragen zu Gesundheit, Familie, Religion, Herkunft oder Alter. Namen sind durch [Name] ersetzt; schreibe [Name] nie.`,
      input: await jobContext(c, a),
    });
    questions = (r.questions ?? []).map((q) => String(q).replace(/\[Name\]\s*/g, "").trim().slice(0, 400)).filter(Boolean).slice(0, count);
  }
  if (!questions.length) return null;
  const row = await one<{ id: string }>(
    "INSERT INTO interview_trainings (coachee_id, application_id, title, interview_lang, feedback_lang, questions, created_by, voice) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [c.id, a.id, [a.title, a.employer].filter(Boolean).join(" · ").slice(0, 300), lang, turkey || c.language === "tr" ? "tr" : "de", JSON.stringify(questions), userId, voice],
  );
  return row?.id ?? null;
}

export async function loadTraining(c: Coachee, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<TrainingRow & { application_id: string | null }>(
    "SELECT id, application_id, voice, title, interview_lang, feedback_lang, questions, answers, report, created_at, finished_at FROM interview_trainings WHERE id = $1 AND coachee_id = $2",
    [id, c.id],
  );
}

export const trainingsFor = (coacheeId: string, appId?: string) =>
  query<TrainingRow & { application_id: string | null }>(
    `SELECT id, application_id, voice, title, interview_lang, feedback_lang, questions, answers, report, created_at, finished_at FROM interview_trainings
      WHERE coachee_id = $1 AND ($2::uuid IS NULL OR application_id = $2) AND finished_at IS NOT NULL ORDER BY created_at DESC LIMIT 30`,
    [coacheeId, appId ?? null],
  );

const clamp01 = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
export function normalizeMetrics(raw: unknown): FaceMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { face: clamp01(r.face), eye: clamp01(r.eye), smile: clamp01(r.smile), motion: clamp01(r.motion), ok: Boolean(r.ok) };
}

/** Eine Antwort in Text umwandeln und speichern. Die Aufnahme bleibt nur im Arbeitsspeicher. */
export async function saveAnswer(c: Coachee, t: TrainingRow, index: number, audio: File | null, seconds: number, metrics: FaceMetrics | null, userId: string) {
  const question = t.questions[index];
  if (question === undefined) throw new Error("Frage fehlt");
  const text = audio && audio.size > 2000 ? (await transcribe(audio, { coacheeId: c.id, userId, purpose: "training_transcribe" }, t.interview_lang)).trim().slice(0, 6000) : "";
  const answers: TrainingAnswer[] = [...(t.answers ?? [])];
  answers[index] = { question, text, seconds: Math.max(0, Math.min(MAX_ANSWER_SECONDS + 10, Math.round(seconds))), metrics };
  for (let i = 0; i < answers.length; i++) answers[i] ??= { question: t.questions[i], text: "", seconds: 0, metrics: null };
  await query("UPDATE interview_trainings SET answers = $3 WHERE id = $1 AND coachee_id = $2", [t.id, c.id, JSON.stringify(answers)]);
  return text;
}

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improve: { type: "array", items: { type: "string" } },
    body: { type: "string" },
    speech: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { score: { type: "number" }, good: { type: "string" }, improve: { type: "string" }, better: { type: "string" } },
        required: ["score", "good", "improve", "better"],
        additionalProperties: false,
      },
    },
  },
  required: ["score", "summary", "strengths", "improve", "body", "speech", "answers"],
  additionalProperties: false,
};

/** Auswertung erstellen und speichern */
export async function evaluateTraining(c: Coachee, t: TrainingRow & { application_id: string | null }, userId: string) {
  const a = t.application_id ? await loadApp(c, t.application_id) : null;
  const answers = t.questions.map((q, i) => t.answers?.[i] ?? { question: q, text: "", seconds: 0, metrics: null });
  const lines = answers.map((x, i) => {
    const s = speechStats(x.text, x.seconds, t.interview_lang);
    return [
      `Frage ${i + 1}: ${x.question}`,
      `Antwort (${x.seconds} s, ${s.words} Wörter, ${s.wpm} Wörter/Min., ${s.fillers} Füllwörter): ${x.text || "(keine Antwort)"}`,
      metricsText(x.metrics),
    ].join("\n");
  });
  const fb = LANG_NAME[t.feedback_lang];
  const r = await jsonResponse<unknown>({
    coacheeId: c.id,
    userId,
    purpose: "interview_training",
    schemaName: "training_auswertung",
    schema: REPORT_SCHEMA,
    maxTokens: 7000,
    instructions: `Du bist erfahrener Jobcoach und wertest ein Probe-Vorstellungsgespräch aus, das dein Coachee vor der Kamera geübt hat. Das Gespräch lief auf ${LANG_NAME[t.interview_lang]}.
Schreibe die ganze Auswertung auf ${fb}, in der Du-Form (${t.feedback_lang === "tr" ? "„sen“, einfaches Alltagstürkisch" : "einfache, klare Sprache"}), ermutigend und ehrlich, konkret statt allgemein. Nur „better“ steht auf ${LANG_NAME[t.interview_lang]}, weil der Coachee diese Antwort im echten Gespräch so sagen kann.
- score: 0–100 für das ganze Gespräch (Inhalt zählt am meisten, dann Sprechweise, dann Auftreten).
- summary: 2–3 Sätze Gesamteindruck.
- strengths: 2–4 Dinge, die gut waren. improve: 2–4 wichtigste Punkte zum Üben, je ein konkreter Tipp.
- body: 2–4 Sätze zu Mimik und Auftreten vor der Kamera, gestützt NUR auf die Messwerte (Blick in die Kamera, Lächeln, Kopfbewegung, Gesicht sichtbar). Richtwerte: Blickkontakt ab etwa 60 % gut, gelegentliches Lächeln wirkt freundlich, ruhige Kopfhaltung wirkt sicher. Fehlt die Messung, sag das kurz und gib allgemeine Tipps.
- speech: 2–4 Sätze zur Sprechweise: Tempo (gut sind etwa 110–160 Wörter/Min.), Länge der Antworten (gut 30–90 Sekunden), Füllwörter.
- answers: genau eine Bewertung je Frage in derselben Reihenfolge: score 0–100, good (was gut war), improve (was fehlte, z. B. konkretes Beispiel, Bezug zur Stelle), better (verbesserte Antwort in der Ich-Form, 3–5 Sätze, gestützt auf die Antwort und das Profil, nichts erfinden). Leere Antwort: score 0 und ein Vorschlag.
Bewerte nie Aussehen, Akzent, Herkunft, Alter, Gesundheit oder Behinderung. Sprachfehler höchstens freundlich mit einer besseren Formulierung. Namen sind durch [Name] ersetzt; schreibe [Name] nie. Kein Hinweis auf Software, Messungen durch ein Programm oder KI: schreib, als hättest du das Gespräch selbst beobachtet.`,
    input: pseudonymize([a ? await jobContext(c, a) : `Stelle: ${t.title}`, "", "Gespräch:", ...lines].join("\n\n"), [c.first_name, c.last_name]),
  });
  const report = normalizeReport(r);
  if (!report) throw new Error("Keine Auswertung");
  report.answers = report.answers.slice(0, t.questions.length);
  await query("UPDATE interview_trainings SET report = $3, finished_at = now() WHERE id = $1 AND coachee_id = $2", [t.id, c.id, JSON.stringify(report)]);
  return report;
}
