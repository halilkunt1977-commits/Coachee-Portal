import "server-only";
import { createHash } from "node:crypto";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import { one, query } from "../db";
import { hasFeature } from "../features";
import { inTurkey } from "../turkey";
import { normalizeInterview, type Interview } from "./interview-shared";

/*
 * Türkische Fassung der Gesprächsvorbereitung für Coachees mit türkischer Oberfläche. Das Gespräch läuft auf Deutsch,
 * deshalb bleibt der deutsche Text vorn; die Übersetzung steht zum Verstehen darunter. Übersetzt wird genau die Fassung,
 * die der Coachee sieht (geschickt oder freigegeben), im Hintergrund nach Speichern/Schicken oder beim ersten Öffnen.
 * Die Empfehlungen des Coachs gehen nicht an die KI und bleiben deutsch.
 */

export type InterviewTr = Omit<Interview, "coach">;

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

const INSTRUCTIONS = `Übersetze diese Vorbereitung auf ein Vorstellungsgespräch in Deutschland ins Türkische für einen türkischsprachigen Coachee, der in Deutschland lebt.
- Alltagstürkisch, wie man es in Deutschland spricht: einfach, kurze Sätze, „sen“-Form in Tipps und Hinweisen. Keine steife Amtssprache.
- Fragen des Arbeitgebers in der höflichen „siz“-Form, Antwortvorschläge in der Ich-Form wie im Original.
- Deutsche Begriffe, die man so kennt, bleiben deutsch: Jobcenter, Arbeitsagentur, Ausbildung, Bewerbungsmappe, Probezeit, brutto/netto, Firmen- und Berufsnamen.
- Inhalt genau übernehmen: nichts weglassen, nichts hinzufügen, gleiche Reihenfolge und gleiche Anzahl von Einträgen in jeder Liste.
- Platzhalter wie [Spanne] unverändert lassen.`;

const plain = (i: Interview): InterviewTr => ({ focus: i.focus, questions: i.questions, behavior: i.behavior, bring: i.bring, avoid: i.avoid, ask: i.ask });
export const interviewHash = (i: Interview) => createHash("sha256").update(JSON.stringify(plain(i))).digest("hex").slice(0, 16);

/** Gespeicherte Übersetzung zur gezeigten Fassung, wenn sie passt */
export function trFor(stored: unknown, i: Interview): InterviewTr | null {
  const map = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const hit = map[interviewHash(i)];
  if (!hit) return null;
  const n = normalizeInterview(hit);
  return { focus: n.focus, questions: n.questions, behavior: n.behavior, bring: n.bring, avoid: n.avoid, ask: n.ask };
}

const running = new Set<string>();

/**
 * Übersetzt die Fassung, die der Coachee gerade sieht, falls nötig. Fehler werden nur protokolliert:
 * Ohne Übersetzung sieht der Coachee einfach den deutschen Text.
 */
export async function ensureInterviewTr(c: Coachee, appId: string, userId: string) {
  // Bei Adresse in der Türkei ist die Vorbereitung schon türkisch
  if (c.language !== "tr" || (await inTurkey(c))) return;
  const a = await one<{ interview: unknown; interview_tr: unknown }>(
    "SELECT COALESCE(interview_sent, CASE WHEN $3 THEN interview END) AS interview, interview_tr FROM applications WHERE id = $1 AND coachee_id = $2",
    [appId, c.id, hasFeature(c, "gespraechsvorbereitung") || hasFeature(c, "gespraechsvorbereitung_selbst")],
  );
  if (!a?.interview) return;
  const i = normalizeInterview(a.interview);
  const hash = interviewHash(i);
  if (trFor(a.interview_tr, i) || running.has(`${appId}:${hash}`)) return;
  if (!i.focus && !i.questions.length) return;
  running.add(`${appId}:${hash}`);
  try {
    const r = await jsonResponse<InterviewTr>({
      coacheeId: c.id,
      userId,
      purpose: "interview_tr",
      instructions: INSTRUCTIONS,
      input: pseudonymize(JSON.stringify(plain(i)), [c.first_name, c.last_name]),
      schemaName: "gespraechsvorbereitung_tr",
      schema: SCHEMA,
      maxTokens: 9000,
    });
    const tr = normalizeInterview(r);
    // höchstens zwei Fassungen behalten (geschickte und zuletzt gespeicherte)
    const old = a.interview_tr && typeof a.interview_tr === "object" ? Object.entries(a.interview_tr as Record<string, unknown>).slice(-1) : [];
    const next = Object.fromEntries([...old, [hash, { focus: tr.focus, questions: tr.questions, behavior: tr.behavior, bring: tr.bring, avoid: tr.avoid, ask: tr.ask }]]);
    await query("UPDATE applications SET interview_tr = $3 WHERE id = $1 AND coachee_id = $2", [appId, c.id, JSON.stringify(next)]);
  } catch (e) {
    console.error("[ai] gespraechsvorbereitung türkisch", e instanceof Error ? e.message : e);
  } finally {
    running.delete(`${appId}:${hash}`);
  }
}
