import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { one, query } from "../db";
import { categoryLabel } from "../profile";
import { Budget, loadChats, withoutHealth } from "./context";
import { financeSummary } from "./finance";
import { normalizeStand, termine, type LeitfadenStand } from "./leitfaden";
import { SECTIONS } from "./sections";
import { planFor } from "./store";

/*
 * Gesprächsleitfaden abgleichen (nur Coach): Die KI liest Protokolle, Bausteine, Notizen, Kapitel und Finanzplan und
 * erkennt, welche Fragen der fünf Termine schon beantwortet sind, mit kurzer Antwort. Vom Coach abgehakte Fragen bleiben.
 */

export async function leitfadenStand(coacheeId: string): Promise<{ stand: LeitfadenStand; stale: boolean }> {
  const row = await one<{ leitfaden: unknown; latest: Date | null }>(
    `SELECT bp.leitfaden, GREATEST((SELECT max(updated_at) FROM meetings WHERE coachee_id = $1), (SELECT max(created_at) FROM profile_items WHERE coachee_id = $1)) AS latest
       FROM business_plans bp WHERE bp.coachee_id = $1`,
    [coacheeId],
  );
  const stand = normalizeStand(row?.leitfaden);
  const stale = Boolean(row?.latest) && (!stand.checkedAt || new Date(row!.latest!).getTime() > new Date(stand.checkedAt).getTime());
  return { stand, stale };
}

async function save(coacheeId: string, stand: LeitfadenStand) {
  await query("UPDATE business_plans SET leitfaden = $2 WHERE coachee_id = $1", [coacheeId, JSON.stringify(stand)]);
}

/** Frage abhaken oder wieder öffnen */
export async function toggleFrage(coacheeId: string, id: string, done: boolean) {
  const { stand } = await leitfadenStand(coacheeId);
  if (done) stand.answers[id] = { answer: stand.answers[id]?.answer ?? "", by: "coach", at: new Date().toISOString() };
  else delete stand.answers[id];
  await save(coacheeId, stand);
  return stand;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: { answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "answer"], properties: { id: { type: "string" }, answer: { type: "string" } } } } },
};

export async function checkLeitfaden(user: User, c: Coachee): Promise<LeitfadenStand> {
  const plan = await planFor(c);
  const { stand } = await leitfadenStand(c.id);
  const fragen = termine(plan.branche).flatMap((t) => t.fragen);
  const [items, meetings, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY created_at", [c.id]),
    query<{ held_on: string; title: string; notes: string; results: string }>("SELECT held_on, title, notes, results FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC LIMIT 30", [c.id]),
    loadChats(c.id),
  ]);
  const b = new Budget(90000);
  b.block("Protokolle der Coaching-Gespräche (neueste zuerst)", meetings.map((m) => `### ${new Date(m.held_on).toLocaleDateString("de-DE")} ${m.title}\n${withoutHealth([m.notes, m.results].filter(Boolean).join("\n")).slice(0, 3000)}`).join("\n\n"), 40000);
  b.block("Bausteine aus den Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 10000);
  b.block("Notizen des Coachs", notes.vorhaben, 5000);
  b.block("Finanzplan", financeSummary(plan.finance), 5000);
  b.block("Kapitel des Businessplans (gekürzt)", SECTIONS.filter((s) => plan.sections[s.key].text.trim()).map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 1500)}`).join("\n\n"), 25000);
  b.block("Fragen des Leitfadens", fragen.map((f) => `[${f.id}] ${f.text}`).join("\n"), 10000);
  const out = await jsonResponse<{ answers: { id: string; answer: string }[] }>({
    coacheeId: c.id,
    userId: user.id,
    purpose: "businessplan",
    schemaName: "leitfaden",
    schema: SCHEMA,
    maxTokens: 6000,
    instructions: `Du hilfst einem Gründungscoach. Prüfe für jede Frage des Gesprächsleitfadens, ob das Material sie schon konkret beantwortet. Gib nur beantwortete Fragen zurück: id genau wie in eckigen Klammern, answer = die Antwort aus dem Material in höchstens 20 Wörtern mit den konkreten Angaben (Zahlen, Namen, Orte). Eine vage oder halbe Antwort zählt nicht als beantwortet. Erfinde nichts. Namen sind durch [Name] ersetzt; keine Gesundheitsangaben.`,
    input: pseudonymize(b.out.join("\n\n"), [c.first_name, c.last_name]),
  });
  const ids = new Set(fragen.map((f) => f.id));
  const now = new Date().toISOString();
  const name = `${c.first_name} ${c.last_name}`.trim();
  for (const a of out.answers) {
    if (!ids.has(a.id) || !a.answer.trim()) continue;
    if (stand.answers[a.id]?.by === "coach" && !stand.answers[a.id].answer) stand.answers[a.id].answer = a.answer.replaceAll("[Name]", name).slice(0, 300);
    else if (stand.answers[a.id]?.by !== "coach") stand.answers[a.id] = { answer: a.answer.replaceAll("[Name]", name).slice(0, 300), by: "ki", at: now };
  }
  stand.checkedAt = now;
  await save(c.id, stand);
  return stand;
}
