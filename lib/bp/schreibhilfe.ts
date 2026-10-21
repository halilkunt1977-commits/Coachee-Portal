import "server-only";
import { randomUUID } from "node:crypto";
import { fullName, type Coachee } from "../access";
import { AiError, jsonResponse } from "../ai";
import type { User } from "../auth";
import { one, query } from "../db";
import { chapterContext, glanceContext } from "./context";
import { MAX_NOTE, MAX_TURNS, normalizeTurns, type ChatTurn } from "./notes";
import { GLANCE_PRESETS, SECTIONS, type GlanceItem } from "./sections";

/*
 * Schreibhilfe im Businessplan (nur Coach): Der Coach schreibt Notizen, Stichpunkte oder Anweisungen zu einem Kapitel,
 * die KI schreibt oder überarbeitet daraus das Kapitel als Vorschlag. Übernommen wird im Editor über das normale Speichern.
 */

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sources", "note"],
  properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } }, note: { type: "string" } },
};

function instructions(key: string) {
  const def = SECTIONS.find((s) => s.key === key)!;
  const number = SECTIONS.indexOf(def) + 1;
  const summary = key === "summary";
  return `Du schreibst Kapitel ${number} „${def.title}“ eines Businessplans für eine Gründung in Deutschland. Der Plan wird bei der fachkundigen Stelle (Gründungszuschuss der Agentur für Arbeit) und bei Banken eingereicht und folgt der Vorlage des Gründungscoachs. Du arbeitest im Gespräch mit dem Coach: Er gibt dir Notizen, Stichpunkte, Sätze oder Anweisungen, du lieferst das fertige Kapitel als Vorschlag, den er prüft.

Stil der Vorlage:
- Sachlich und nüchtern in der dritten Person: „[Name] plant …“, „Der Gründer verfügt …“, „Das Unternehmen richtet sich …“. Keine Ich-Form, keine Werbesprache, keine Superlative.
- Zusammenhängende Absätze mit jeweils zwei bis vier Sätzen, getrennt durch eine Leerzeile. Konkrete Angaben statt allgemeiner Aussagen.
- Bei längeren Kapiteln Zwischenüberschriften als eigene Zeile mit „### “. Aufzählungen mit „- “ nur, wo sie wirklich helfen. Eine Tabelle im Markdown-Format (| Spalte | Spalte |) nur, wenn sie etwas übersichtlicher macht, z. B. Mitbewerber oder Kundengruppen.
- Umfang etwa ${def.words[0]} bis ${def.words[1]} Wörter, außer der Coach wünscht etwas anderes. Keine Kapitelüberschrift, keine Vorrede, kein Fazit-Absatz mit Floskeln.

Material und Vorrang:
- Die Notizen und Nachrichten des Coachs sind seine eigenen Angaben aus dem Coaching und haben Vorrang vor allem anderen Material. Übernimm ihre Fakten vollständig und mach aus Stichpunkten zusammenhängenden Text.
- Die neue Nachricht des Coachs ist entweder weiteres Material oder eine Anweisung (z. B. „kürzer“, „mehr zum Standort“). Eine Anweisung setzt du am letzten Vorschlag um, sonst am bisherigen Text. Alles, was der Coach nicht ändern wollte, bleibt erhalten.
- Bausteine, Protokolle der Gespräche, Unterlagen und andere Kapitel sind Arbeitsmaterial: Übernimm nur, was zu diesem Kapitel passt, und widersprich den anderen Kapiteln nicht.
- Beantworte diese Leitfragen, soweit das Material es hergibt: ${def.questions.join(" ")}
${summary ? "- Die Executive Summary fasst den ganzen Plan auf einer Seite zusammen: Wer gründet was, ab wann und wo, Leistungen und Kunden, Kundengewinnung, die wichtigsten Zahlen für Jahr 1 bis 3 und erfüllte Voraussetzungen. Schreib sie nur aus den Kapiteln, dem Finanzplan und den Notizen, nichts Neues.\n" : ""}- Nutze nur Fakten aus dem Material. Erfinde keine Zahlen, Namen, Kunden, Statistiken oder Abschlüsse. Wo etwas fehlt, setze einen kurzen Platzhalter in eckigen Klammern, z. B. [Anzahl Betriebe der Branche im Landkreis mit Quelle].
- Zahlen aus dem Finanzplan übernimmst du genau so, wie sie im Material stehen.
- Namen sind durch [Name] ersetzt. Schreib [Name], wo der Name der gründenden Person nötig ist.
- Angaben zur Gesundheit der gründenden Person gehören nicht in den Plan.
- Wenn es schon einen Text gibt, verbessere und ergänze ihn und behalte seine Aussagen, Zahlen und Quellen, außer der Coach will es anders.

Quellen:
- Gib im Feld sources die Quellen für die Fakten im Kapitel an, eine pro Eintrag, z. B. „Handwerkskammer Wiesbaden (2026): Schriftliche Auskunft …“ oder eine Statistik mit Link.
- Nur Quellen, die wörtlich im Material stehen (bisherige Quellen des Kapitels, Notizen des Coachs, genannte Auskünfte, Unterlagen). Erfinde niemals Quellen oder Links. Hast du keine belegbare Quelle, gib eine leere Liste zurück.

Gib den fertigen Kapiteltext im Feld text zurück. Im Feld note sagst du dem Coach in ein bis zwei kurzen Sätzen, was du gemacht hast und welche Angaben noch fehlen (per du, ohne Floskeln).`;
}

/** Einträge an den Verlauf eines Kapitels anhängen; ältere Einträge über MAX_TURNS fallen weg */
export async function appendTurns(coacheeId: string, key: string, userId: string, turns: ChatTurn[]) {
  const row = await one<{ history: unknown }>(
    `INSERT INTO bp_notes (coachee_id, section, history, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (coachee_id, section) DO UPDATE SET history = bp_notes.history || EXCLUDED.history, updated_by = $4, updated_at = now()
     RETURNING history`,
    [coacheeId, key, JSON.stringify(turns), userId],
  );
  const all = normalizeTurns(row?.history ?? []);
  const raw = Array.isArray(row?.history) ? row.history : [];
  if (raw.length > MAX_TURNS) await query("UPDATE bp_notes SET history = $3 WHERE coachee_id = $1 AND section = $2", [coacheeId, key, JSON.stringify(all)]);
  return all;
}

export async function chapterHistory(coacheeId: string, key: string) {
  const row = await one<{ history: unknown }>("SELECT history FROM bp_notes WHERE coachee_id = $1 AND section = $2", [coacheeId, key]);
  return normalizeTurns(row?.history ?? []);
}

/**
 * Nachricht des Coachs (darf leer sein: dann einfach schreiben bzw. überarbeiten) an die KI. Die Nachricht wird immer
 * gespeichert, auch wenn die KI nicht antwortet: Die Notizen sind Material für die übrigen Kapitel und die Summary.
 */
export async function sendChapterMessage(user: User, c: Coachee, key: string, message: string): Promise<{ history: ChatTurn[]; error?: string }> {
  const text = message.trim().slice(0, MAX_NOTE);
  const before = await chapterHistory(c.id, key);
  // erst das Material mit dem Verlauf vor dieser Nachricht, dann die Nachricht speichern
  const input = await chapterContext(c, key, text);
  let history = text ? await appendTurns(c.id, key, user.id, [{ id: randomUUID(), role: "coach", text, at: new Date().toISOString() }]) : before;
  let out: { text: string; sources: string[]; note: string };
  try {
    out = await jsonResponse({ coacheeId: c.id, userId: user.id, purpose: "businessplan", schemaName: "kapitel", schema: DRAFT_SCHEMA, maxTokens: 8000, instructions: instructions(key), input });
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-Schreibhilfe", e);
    return { history, error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
  const name = fullName(c);
  const fill = (s: string) => s.replaceAll("[Name]", name).trim();
  const body = fill(out.text);
  if (!body) return { history, error: "Es kam kein Text zurück. Bitte noch einmal versuchen." };
  // Ein noch offener Vorschlag wird durch den neuen ersetzt
  const open = before.filter((t) => t.role === "ki" && t.status === "offen").map((t) => t.id);
  if (open.length) await setTurnStatus(c.id, key, open, "ersetzt");
  history = await appendTurns(c.id, key, user.id, [
    { id: randomUUID(), role: "ki", text: body.slice(0, 60000), sources: out.sources.map(fill).filter(Boolean).join("\n").slice(0, 8000), note: fill(out.note).slice(0, 1000), status: "offen", at: new Date().toISOString() },
  ]);
  return { history };
}

export async function setTurnStatus(coacheeId: string, key: string, ids: string[], status: "uebernommen" | "verworfen" | "ersetzt") {
  const turns = await chapterHistory(coacheeId, key);
  const next = turns.map((t) => (ids.includes(t.id) && t.role === "ki" ? { ...t, status } : t));
  await query("UPDATE bp_notes SET history = $3, updated_at = now() WHERE coachee_id = $1 AND section = $2", [coacheeId, key, JSON.stringify(next)]);
  return next;
}

const GLANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } } },
  },
};

/** Vorschlag für „Auf einen Blick“ aus Kapiteln, Zahlen und Notizen. Nur Felder mit neuem Inhalt kommen zurück. */
export async function proposeGlance(user: User, c: Coachee): Promise<GlanceItem[]> {
  const { input, plan } = await glanceContext(c);
  const labels = [...new Set([...plan.glance.map((g) => g.label).filter(Boolean), ...GLANCE_PRESETS])].filter((l) => l !== "Gründer");
  const out = await jsonResponse<{ items: GlanceItem[] }>({
    coacheeId: c.id,
    userId: user.id,
    purpose: "businessplan",
    schemaName: "auf_einen_blick",
    schema: GLANCE_SCHEMA,
    maxTokens: 3000,
    instructions: `Du füllst die Seite „Auf einen Blick“ eines Businessplans für eine Gründung in Deutschland aus: kurze Stichworte, keine ganzen Absätze, höchstens etwa 25 Wörter pro Feld.
Felder (genau diese Bezeichnungen): ${labels.join(", ")}.
- Nur Angaben, die im Material stehen. Erfinde nichts; steht zu einem Feld nichts im Material, gib einen leeren Wert zurück.
- Zahlen (Startinvestitionen, Finanzierung, Personal) genau so, wie sie im Finanzplan stehen.
- Bisherige Angaben behältst du, wenn das Material ihnen nicht widerspricht.
- Namen sind durch [Name] ersetzt; schreib [Name], wo der Name nötig ist.
- Keine Angaben zur Gesundheit.`,
    input,
  });
  const name = fullName(c);
  const current = new Map(plan.glance.map((g) => [g.label, g.value.trim()]));
  return out.items
    .filter((g) => labels.includes(g.label))
    .map((g) => ({ label: g.label, value: g.value.replaceAll("[Name]", name).trim().slice(0, 2000) }))
    .filter((g) => g.value && g.value !== current.get(g.label));
}
