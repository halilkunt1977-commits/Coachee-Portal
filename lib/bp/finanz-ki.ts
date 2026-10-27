import "server-only";
import type { Coachee } from "../access";
import { jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { one } from "../db";
import { COST_CATEGORIES, MONTHS, NOTE_KEYS, calculate, eur, monthLabel, normalizeFinance, type FinanceInput } from "./finance";
import { VORHABEN, normalizeTurns } from "./notes";

/*
 * KI im Finanzplan (nur Coach): Der Coach schreibt Angaben oder Änderungswünsche in eigenen Worten
 * („Miete 450 € ab dem 2. Monat“, „Stundensatz auf 60 €“), die KI trägt sie in den Finanzplan ein.
 * Zurück kommt der ganze Finanzplan; das Portal prüft ihn mit normalizeFinance und der Editor übernimmt ihn sofort
 * (mit „Rückgängig“).
 */

export type FinanceTurn = { message: string; note: string };

const str = { type: "string" };
const numT = { type: "number" };
const int = { type: "integer" };
const year3 = { type: "array", items: numT, minItems: 3, maxItems: 3 };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const SCHEMA = obj({
  note: str,
  finance: obj({
    start: str,
    materialPct: year3,
    openingCash: numT,
    privateDraw: year3,
    taxPct: numT,
    reserve: numT,
    notes: obj(Object.fromEntries(NOTE_KEYS.map((k) => [k, str]))),
    costs: { type: "array", items: obj({ label: str, monthly: year3, category: str, note: str, from: int }) },
    investments: { type: "array", items: obj({ label: str, amount: numT, life: int, month: int, reason: str, note: str }) },
    staff: { type: "array", items: obj({ label: str, start: int, gross: numT, surcharge: numT, note: str }) },
    revenues: { type: "array", items: obj({ label: str, description: str, price: numT, note: str, qty: { type: "array", items: numT, minItems: MONTHS, maxItems: MONTHS } }) },
    financing: { type: "array", items: obj({ label: str, kind: { type: "string", enum: ["eigen", "darlehen", "zuschuss"] }, amount: numT, month: int, rate: numT, years: int, grace: int }) },
    grants: { type: "array", items: obj({ label: str, monthly: numT, from: int, months: int }) },
  }),
});

const INSTRUCTIONS = `Du pflegst den Finanzplan einer Gründung in Deutschland (Vorlage des Gründungscoachs, 36 Planmonate). Der Coach schreibt dir Angaben oder Änderungswünsche in eigenen Worten. Du trägst sie in den Finanzplan ein und gibst den kompletten Finanzplan zurück.

Aufbau (alle Beträge netto in Euro):
- start: erster Planmonat "JJJJ-MM". Monatsangaben (from, month, start bei Personal, Finanzierung, Zuschüssen) sind Indizes 0 bis 35: 0 ist der erste Planmonat. Die Zuordnung Index → Monat steht im Material.
- materialPct: Materialquote (Wareneinsatz) in Prozent vom Umsatz je Planjahr 1, 2, 3.
- openingCash: Anfangsliquidität. privateDraw: private Entnahme im Monat je Planjahr. taxPct: Steuerrücklage in Prozent vom Gewinn. reserve: Liquiditätsreserve im Kapitalbedarf.
- notes: Herleitungen zu den Annahmen (period, material, opening, private, tax, reserve).
- costs: laufende Kosten, monthly = Betrag im Monat je Planjahr, from = ab Monatsindex, category eine dieser Zuordnungen: ${COST_CATEGORIES.join(", ")}.
- investments: Anschaffungen mit amount, life = Nutzungsdauer in Monaten (0 = sofort Aufwand, z. B. geringwertig oder Gründungskosten), month = Zahlungsmonat.
- staff: Personal mit gross = Monatsbrutto, surcharge = Arbeitgeber-Nebenkosten in Prozent (üblich 21 bis 22), start = ab Monatsindex.
- revenues: Leistungsarten mit price = Ø Netto-Preis je Einheit und qty = Menge in jedem der 36 Monate.
- financing: Eigenkapital, Darlehen (rate = Zins in Prozent im Jahr, years = Laufzeit, grace = tilgungsfreie Monate) oder Zuschuss, month = Auszahlungsmonat.
- grants: laufende Zuschüsse zum Lebensunterhalt (z. B. Gründungszuschuss), monthly ab Monatsindex from für months Monate.

Regeln:
- Ändere nur, was der Coach sagt oder was daraus zwingend folgt. Alles andere gibst du unverändert zurück, Zahl für Zahl und Text für Text, auch Herleitungen und Hinweise.
- Neue Posten bekommen einen kurzen, klaren Namen. Steht im Text eine Begründung oder Quelle, gehört sie in note bzw. reason.
- Mengen über die Zeit: Sagt der Coach z. B. „ab Monat 3 je 80 Stunden, ab Jahr 2 je 100“, setzt du die Monate genau so. Ein Anlauf („steigt in sechs Monaten auf …“) wird gleichmäßig verteilt.
- „Monat 1“ des Coachs ist Index 0. Nennt er ein Datum, rechnest du den Index aus der Monatsliste aus.
- Erfinde keine Zahlen. Fehlt eine Angabe, die du für eine Änderung brauchst, ändere diesen Teil nicht und frag in note danach.
- Ist die Nachricht eine Frage zum Plan, beantworte sie in note und gib den Finanzplan unverändert zurück.
- note: ein bis drei kurze Sätze an den Coach (per du): was du geändert hast, mit den wichtigsten Zahlen, und was noch fehlt.
- Namen sind durch [Name] ersetzt. Angaben zur Gesundheit gehören nicht in den Finanzplan.`;

/** Angaben des Coachs in den Finanzplan eintragen */
export async function changeFinance(user: User, c: Coachee, current: FinanceInput, message: string, earlier: FinanceTurn[]) {
  const vorhaben = await one<{ history: unknown }>("SELECT history FROM bp_notes WHERE coachee_id = $1 AND section = $2", [c.id, VORHABEN]);
  const r = calculate(current);
  const months = Array.from({ length: MONTHS }, (_, i) => `${i}=${monthLabel(current.start, i)}`).join(", ");
  const notes = normalizeTurns(vorhaben?.history ?? []).filter((t) => t.role === "coach").map((t) => `- ${t.text}`).join("\n").slice(0, 4000);
  const names = [c.first_name, c.last_name];
  // Die Zahlen selbst gehen unverändert hinaus, damit Bezeichnungen nicht verfälscht zurückkommen; Freitexte werden pseudonymisiert
  const input = [
    `Monatsindizes: ${months}`,
    `Ergebnis bisher je Jahr: Umsatz ${r.years.map((y) => eur(y.revenue)).join(" / ")}, Ergebnis vor Steuern ${r.years.map((y) => eur(y.profit)).join(" / ")}, Kontostand am Jahresende ${r.years.map((y) => eur(y.balance)).join(" / ")}`,
    notes ? pseudonymize(`Notizen des Coachs zum Vorhaben:\n${notes}`, names) : "",
    earlier.length ? pseudonymize(`Bisher in diesem Gespräch:\n${earlier.slice(-6).map((t) => `Coach: ${t.message}\nDu: ${t.note}`).join("\n")}`, names) : "",
    `Aktueller Finanzplan (JSON):\n${JSON.stringify(current)}`,
    pseudonymize(`Nachricht des Coachs: ${message}`, names),
  ].filter(Boolean).join("\n\n");
  const res = await jsonResponse<{ note: string; finance: unknown }>({
    coacheeId: c.id,
    userId: user.id,
    purpose: "finance_ai",
    instructions: INSTRUCTIONS,
    input,
    schemaName: "finanzplan",
    schema: SCHEMA,
    maxTokens: 16000,
  });
  return { finance: normalizeFinance({ ...(res.finance as object), v: 2 }), note: String(res.note ?? "").trim().slice(0, 1000) };
}
