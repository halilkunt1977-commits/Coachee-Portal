import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { query } from "../db";
import { categoryLabel } from "../profile";
import { kapitaldienst } from "./bank";
import { BANK_SECTIONS } from "./bank-sections";
import { Budget, loadChats } from "./context";
import { calculate, eur, financeIsEmpty, financeSummary } from "./finance";
import { BUNDESWEIT, landOf } from "./foerderung";
import { SECTIONS, type Sections } from "./sections";
import { planFor } from "./store";

/*
 * Bankfassung des Businessplans: eigene Kapitel. Ausgangspunkt ist der Plan fürs Amt:
 * übernehmen (ohne KI, für alle) oder von der KI für die Bank umschreiben lassen (nur Coach).
 * Geschriebene Kapitel bleiben, nur leere werden gefüllt (all = true schreibt alle neu).
 */

async function write(coacheeId: string, userId: string, texts: Record<string, string>) {
  for (const [key, text] of Object.entries(texts)) {
    if (!BANK_SECTIONS.some((s) => s.key === key) || !text.trim()) continue;
    await query(
      `UPDATE business_plans
          SET bank_sections = jsonb_set(bank_sections, ARRAY[$2::text], jsonb_build_object('text', $3::text, 'sources', COALESCE(bank_sections->($2::text)->>'sources', ''), 'version', COALESCE((bank_sections->($2::text)->>'version')::int, 0) + 1, 'updated_at', now(), 'updated_by', $4::text)),
              updated_at = now()
        WHERE coachee_id = $1`,
      [coacheeId, key, text.slice(0, 60000), userId],
    );
  }
}

const todo = (bank: Sections, all: boolean) => BANK_SECTIONS.filter((s) => all || !bank[s.key]?.text.trim());

/** Kapitel aus dem Plan fürs Amt als Ausgangspunkt übernehmen (Zahlenkapitel bleiben leer, die Tabellen kommen aus dem Finanzplan) */
export async function copyFromAmt(user: User, c: Coachee, all = false) {
  const plan = await planFor(c);
  const texts: Record<string, string> = {};
  for (const def of todo(plan.bankSections, all)) {
    const parts = def.amt.map((k) => ({ k, text: plan.sections[k]?.text.trim() ?? "" })).filter((x) => x.text);
    if (!parts.length) continue;
    texts[def.key] = parts.length === 1 ? parts[0].text : parts.map((x) => `### ${SECTIONS.find((s) => s.key === x.k)?.title ?? x.k}\n\n${x.text}`).join("\n\n");
  }
  await write(c.id, user.id, texts);
  return (await planFor(c)).bankSections;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: { chapters: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "text"], properties: { key: { type: "string" }, text: { type: "string" } } } } },
};

/** Bankfassung von der KI schreiben lassen (nur Coach): in drei Gruppen gleichzeitig */
export async function draftBankPlan(user: User, c: Coachee, all = false) {
  const plan = await planFor(c);
  const defs = todo(plan.bankSections, all);
  if (!defs.length) return plan.bankSections;
  const [items, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY created_at", [c.id]),
    loadChats(c.id),
  ]);
  const b = new Budget(90000);
  const bank = plan.bank;
  const land = landOf(bank.land);
  if (!financeIsEmpty(plan.finance)) {
    const r = calculate(plan.finance);
    b.block("Finanzplan", financeSummary(plan.finance), 9000);
    b.block("Kapitaldienstfähigkeit", kapitaldienst(plan.finance, r).map((k) => `Jahr ${k.jahr}: verfügbar ${eur(k.verfuegbar)}, Zins und Tilgung ${eur(k.dienst)}, Deckungsgrad ${k.deckung === null ? "–" : k.deckung.toFixed(2)}`).join("\n"), 2000);
  }
  b.block(
    "Angaben für die Bank",
    [
      bank.hausbank && `Hausbank: ${bank.hausbank}`,
      bank.sicherheiten && `Sicherheiten: ${bank.sicherheiten}`,
      bank.eigenmittel && `Herkunft der Eigenmittel: ${bank.eigenmittel}`,
      bank.vermoegen.length ? `Privates Vermögen: ${bank.vermoegen.map((x) => `${x.label} ${eur(x.betrag)}`).join("; ")}` : "",
      bank.verbindlichkeiten.length ? `Private Verbindlichkeiten: ${bank.verbindlichkeiten.map((x) => `${x.label} ${eur(x.betrag)}, Rate ${eur(x.rate)}`).join("; ")}` : "",
      land && `Bundesland: ${land.name} (Förderbank ${land.bank}, Bürgschaften ${land.buergschaft})`,
      `Förderkredite: ${[...BUNDESWEIT, ...(land?.programme ?? [])].filter((p) => p.art === "Kredit" || p.art === "Bürgschaft").map((p) => `${p.name}${p.zins ? ` (${p.zins})` : ""}`).join("; ")}`,
    ].filter(Boolean).join("\n"),
    5000,
  );
  b.block("Bausteine aus den Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 10000);
  b.block("Notizen des Coachs", notes.vorhaben, 5000);
  b.block("Plan fürs Amt", SECTIONS.filter((s) => plan.sections[s.key].text.trim()).map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 3000)}`).join("\n\n"), 45000);
  const context = pseudonymize(b.out.join("\n\n"), [c.first_name, c.last_name]);
  const groups = [defs.slice(0, 4), defs.slice(4, 8), defs.slice(8)].filter((g) => g.length);
  const results = await Promise.all(
    groups.map((g) =>
      jsonResponse<{ chapters: { key: string; text: string }[] }>({
        coacheeId: c.id,
        userId: user.id,
        purpose: "businessplan",
        schemaName: "bank_plan",
        schema: SCHEMA,
        maxTokens: 9000,
        instructions: `Du schreibst die Bankfassung eines Businessplans für einen Kreditantrag bei der Hausbank (Förderkredit, z. B. KfW StartGeld). Leser ist die Firmenkundenberatung einer Bank: sachlich, knapp, zahlenorientiert, in der dritten Person. Grundlage sind der Plan fürs Amt, der Finanzplan und die Angaben für die Bank. Schreibe die Kapitel nicht einfach ab, sondern stelle sie auf die Sicht der Bank um: Kreditwürdigkeit, Rückzahlbarkeit, Sicherheiten, Risiken. Nutze die konkreten Zahlen aus dem Finanzplan, erfinde keine Zahlen; fehlt etwas, setze es in eckige Klammern, z. B. [Angebot ergänzen]. Markdown: Absätze, „### “ für Zwischenüberschriften, „- “ für Aufzählungen, Tabellen nur wenn nötig. key genau wie in eckigen Klammern angegeben. Namen sind durch [Name] ersetzt; keine Gesundheitsangaben.`,
        input: `${context}\n\n== Zu schreibende Kapitel ==\n${g.map((d) => `[kapitel:${d.key}] ${d.title}: ${d.hint} Pflichtangaben: ${d.must.join("; ")}. Umfang etwa ${d.words[0]} bis ${d.words[1]} Wörter.`).join("\n")}`,
      }),
    ),
  );
  const name = `${c.first_name} ${c.last_name}`.trim();
  const texts: Record<string, string> = {};
  for (const r of results) for (const ch of r.chapters) if (defs.some((d) => d.key === ch.key)) texts[ch.key] = ch.text.replaceAll("[Name]", name).trim();
  await write(c.id, user.id, texts);
  return (await planFor(c)).bankSections;
}
