import "server-only";
import { fullName, type Coachee } from "../access";
import { one, query } from "../db";
import type { FinanceItem } from "../profile";
import { emptyFinance, normalizeFinance, type FinanceInput, type Year3 } from "./finance";
import { defaultGlance, normalizeGlance, normalizeSections, type GlanceItem, type Sections } from "./sections";

export type ImportInfo = { document: string | null; name: string; at: string };
export type PlanRow = {
  coachee_id: string;
  title: string;
  sections: Sections;
  glance: GlanceItem[];
  finance: FinanceInput;
  finance_version: number;
  finance_updated_at: string;
  finance_updated_by_name: string | null;
  imports: { plan?: ImportInfo; finance?: ImportInfo };
  prefilled: boolean;
};

/** Businessplan laden; beim ersten Öffnen anlegen und den Finanzplan mit den Zahlen aus den Gesprächen vorbelegen. */
export async function planFor(c: Coachee): Promise<PlanRow> {
  let row = await loadPlan(c.id);
  if (!row) {
    const items = await financeItems(c.id);
    const finance = items.length ? financeFromItems(items) : emptyFinance();
    await query("INSERT INTO business_plans (coachee_id, title, finance, glance) VALUES ($1,$2,$3,$4) ON CONFLICT (coachee_id) DO NOTHING", [
      c.id,
      c.goal?.slice(0, 120) ?? "",
      JSON.stringify(finance),
      JSON.stringify(defaultGlance(fullName(c))),
    ]);
    row = (await loadPlan(c.id))!;
    row.prefilled = items.length > 0;
  }
  // Pläne von vor der Vorlage haben noch kein „Auf einen Blick“: die üblichen Felder anbieten
  if (!row.glance.length) row.glance = defaultGlance(fullName(c));
  return row;
}

async function loadPlan(coacheeId: string): Promise<PlanRow | null> {
  const row = await one<{ coachee_id: string; title: string; sections: unknown; glance: unknown; finance: unknown; finance_version: number; updated_at: string; finance_updated_by_name: string | null; imports: PlanRow["imports"] }>(
    "SELECT bp.*, u.name AS finance_updated_by_name FROM business_plans bp LEFT JOIN users u ON u.id = bp.finance_updated_by WHERE bp.coachee_id = $1",
    [coacheeId],
  );
  if (!row) return null;
  return {
    coachee_id: row.coachee_id,
    title: row.title,
    sections: normalizeSections(row.sections),
    glance: normalizeGlance(row.glance),
    finance: normalizeFinance(row.finance),
    finance_version: row.finance_version,
    finance_updated_at: row.updated_at,
    finance_updated_by_name: row.finance_updated_by_name,
    imports: row.imports ?? {},
    prefilled: false,
  };
}

/** Wurde der Finanzplan schon von jemandem bearbeitet? Version 1 ist der automatisch angelegte Stand. */
export const financeTouched = (p: PlanRow) => p.finance_version > 1;

export const financeItems = (coacheeId: string) =>
  query<FinanceItem>("SELECT id, section, label, amount, period, note, source_meeting_id FROM finance_items WHERE coachee_id = $1 ORDER BY created_at", [coacheeId]);

const perMonth = (i: FinanceItem) => (i.period === "jaehrlich" ? i.amount / 12 : i.amount);
const same = (n: number): Year3 => [n, n, n];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Zahlen aus den Gesprächen in den Finanzplan übertragen. Annahmen, die man im Editor leicht ändern kann:
 * Anschaffungen über 800 € (GWG-Grenze) werden über 60 Monate abgeschrieben, kleinere und Gründungskosten sofort;
 * Darlehen mit 5 % über 5 Jahre und 6 Monaten tilgungsfrei; monatliche Zuschüsse (Gründungszuschuss) laufen 6 Monate.
 * Umsätze werden zu einer Leistungsart mit Menge 1 je Monat, im ersten Halbjahr mit Anlauf von 40 % auf 100 %.
 */
export function financeFromItems(items: FinanceItem[]): FinanceInput {
  const f = emptyFinance();
  let privat = 0;
  for (const i of items) {
    const label = i.label.slice(0, 120);
    const note = i.note?.slice(0, 300) ?? "";
    switch (i.section) {
      case "kapitalbedarf":
        if (i.period === "einmalig") {
          if (/reserve|puffer|liquidit/i.test(label)) f.reserve += i.amount;
          else {
            const startup = /gründung|notar|gewerbe|anmeld|beratung|eintrag|website|logo|eröffnung/i.test(label) && i.amount <= 5000;
            f.investments.push({ label, amount: i.amount, life: startup || i.amount <= 800 ? 0 : 60, month: 0, reason: startup ? "Gründungskosten" : "", note });
          }
        } else f.costs.push({ label, monthly: same(r2(perMonth(i))), category: "Betriebskosten", note, from: 0 });
        break;
      case "finanzierung":
        if (i.period !== "einmalig") f.grants.push({ label, monthly: perMonth(i), from: 0, months: 6 });
        else if (/kredit|darlehen|bank|kfw|mikro|sparkasse|volksbank/i.test(label)) f.financing.push({ label, kind: "darlehen", amount: i.amount, month: 0, rate: 5, years: 5, grace: 6 });
        else if (/zuschuss|förder|prämie|stipend/i.test(label)) f.financing.push({ label, kind: "zuschuss", amount: i.amount, month: 0, rate: 0, years: 0, grace: 0 });
        else f.financing.push({ label, kind: "eigen", amount: i.amount, month: 0, rate: 0, years: 0, grace: 0 });
        break;
      case "kosten":
        if (i.period === "einmalig") f.investments.push({ label, amount: i.amount, life: 0, month: 0, reason: "Startaufwand", note });
        else f.costs.push({ label, monthly: same(r2(perMonth(i))), category: "Betriebskosten", note, from: 0 });
        break;
      case "umsatz": {
        const qty = Array.from({ length: 36 }, (_, m) => (i.period === "einmalig" ? (m === 0 ? 1 : 0) : m < 6 ? Math.round((0.4 + (0.6 * m) / 6) * 100) / 100 : 1));
        f.revenues.push({ label, description: i.period === "einmalig" ? "Einmaliger Auftrag" : "Monatsumsatz als Pauschale", price: r2(perMonth(i)), note, qty });
        break;
      }
      case "privat":
        privat += i.period === "einmalig" ? 0 : perMonth(i);
        break;
    }
  }
  f.privateDraw = same(r2(privat));
  return f;
}
