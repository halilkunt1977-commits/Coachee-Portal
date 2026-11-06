import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { query } from "../db";
import { categoryLabel } from "../profile";
import { kapitaldienst, normalizeBank, type BankInfo } from "./bank";
import { Budget, loadChats } from "./context";
import { calculate, eur, financeSummary } from "./finance";
import { BUNDESWEIT, landOf } from "./foerderung";
import { SECTIONS } from "./sections";
import { planFor } from "./store";

/*
 * Fragen und Antworten fürs Bankgespräch (nur Coach): Die KI entwirft aus Plan, Finanzplan und Bankangaben Antworten,
 * die der Coachee im Gespräch geben kann. Vom Coach geschriebene Antworten bleiben, nur leere werden gefüllt
 * (mit all = true alle neu).
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: { answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["nr", "antwort"], properties: { nr: { type: "integer" }, antwort: { type: "string" } } } } },
};

export async function saveBank(coacheeId: string, bank: BankInfo) {
  await query("UPDATE business_plans SET bank = $2, updated_at = now() WHERE coachee_id = $1", [coacheeId, JSON.stringify(normalizeBank(bank))]);
}

export async function draftBankAnswers(user: User, c: Coachee, all = false): Promise<BankInfo> {
  const plan = await planFor(c);
  const bank = plan.bank;
  const [items, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY created_at", [c.id]),
    loadChats(c.id),
  ]);
  const r = calculate(plan.finance);
  const kd = kapitaldienst(plan.finance, r);
  const land = landOf(bank.land);
  const b = new Budget(80000);
  b.block("Finanzplan", financeSummary(plan.finance), 8000);
  b.block("Kapitaldienstfähigkeit", kd.map((k) => `Jahr ${k.jahr}: verfügbar ${eur(k.verfuegbar)}, Zins und Tilgung ${eur(k.dienst)}, Deckungsgrad ${k.deckung === null ? "–" : k.deckung.toFixed(2)}`).join("\n"), 2000);
  b.block(
    "Bankangaben",
    [
      bank.hausbank && `Hausbank: ${bank.hausbank}`,
      bank.sicherheiten && `Sicherheiten: ${bank.sicherheiten}`,
      bank.eigenmittel && `Herkunft der Eigenmittel: ${bank.eigenmittel}`,
      bank.vermoegen.length && `Privates Vermögen: ${bank.vermoegen.map((x) => `${x.label} ${eur(x.betrag)}`).join("; ")}`,
      bank.verbindlichkeiten.length ? `Private Verbindlichkeiten: ${bank.verbindlichkeiten.map((x) => `${x.label} ${eur(x.betrag)}, Rate ${eur(x.rate)}`).join("; ")}` : "Private Verbindlichkeiten: keine angegeben",
      land && `Bundesland: ${land.name} (Förderbank ${land.bank})`,
      `Förderprogramme: ${[...BUNDESWEIT.filter((p) => p.art === "Kredit" || p.art === "Bürgschaft").map((p) => p.name), ...(land?.programme.map((p) => p.name) ?? [])].join("; ")}`,
    ].filter(Boolean).join("\n"),
    5000,
  );
  b.block("Bausteine aus den Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 10000);
  b.block("Notizen des Coachs", notes.vorhaben, 5000);
  b.block("Kapitel des Businessplans (gekürzt)", SECTIONS.filter((s) => plan.sections[s.key].text.trim()).map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 1800)}`).join("\n\n"), 35000);
  const todo = bank.fragen.map((f, i) => ({ ...f, nr: i + 1 })).filter((f) => all || !f.antwort.trim());
  if (!todo.length) return bank;
  b.block("Fragen der Bank", todo.map((f) => `[${f.nr}] ${f.frage}`).join("\n"), 6000);
  const out = await jsonResponse<{ answers: { nr: number; antwort: string }[] }>({
    coacheeId: c.id,
    userId: user.id,
    purpose: "businessplan",
    schemaName: "bank_fragen",
    schema: SCHEMA,
    maxTokens: 6000,
    instructions: `Du bereitest eine Gründerin oder einen Gründer auf das Kreditgespräch bei der Hausbank vor (Förderkredit, z. B. KfW StartGeld). Schreibe zu jeder Frage die Antwort, die die Person im Gespräch geben kann: in der Ich-Form, sachlich und überzeugend, 2 bis 5 Sätze, mit den konkreten Zahlen aus dem Finanzplan (Kapitalbedarf, Eigenmittel, Umsatz, Gewinn, Entnahme, Deckungsgrad). Nenne Schwächen ehrlich und sag, wie sie abgefangen werden. Fehlt eine Angabe, schreibe die Antwort trotzdem und setze die fehlende Angabe in eckige Klammern, z. B. [Sicherheiten ergänzen]. Erfinde keine Zahlen. nr genau wie in eckigen Klammern. Namen sind durch [Name] ersetzt; keine Gesundheitsangaben.`,
    input: pseudonymize(b.out.join("\n\n"), [c.first_name, c.last_name]),
  });
  const name = `${c.first_name} ${c.last_name}`.trim();
  const fragen = bank.fragen.map((f, i) => {
    const a = out.answers.find((x) => x.nr === i + 1);
    return a && (all || !f.antwort.trim()) ? { ...f, antwort: a.antwort.replaceAll("[Name]", name).trim().slice(0, 3000) } : f;
  });
  const next = { ...bank, fragen };
  await saveBank(c.id, next);
  return next;
}
