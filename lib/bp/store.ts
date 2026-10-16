import "server-only";
import type { Coachee } from "../access";
import { one, query } from "../db";
import type { FinanceItem } from "../profile";
import { emptyFinance, normalizeFinance, type FinanceInput } from "./finance";
import { normalizeSections, type Sections } from "./sections";

export type PlanRow = { coachee_id: string; title: string; sections: Sections; finance: FinanceInput; finance_version: number; finance_updated_at: string; finance_updated_by_name: string | null; prefilled: boolean };

/** Businessplan laden; beim ersten Öffnen anlegen und den Finanzplan mit den Zahlen aus den Gesprächen vorbelegen. */
export async function planFor(c: Coachee): Promise<PlanRow> {
  let row = await loadPlan(c.id);
  if (!row) {
    const items = await financeItems(c.id);
    const finance = items.length ? financeFromItems(items) : emptyFinance();
    await query("INSERT INTO business_plans (coachee_id, title, finance) VALUES ($1,$2,$3) ON CONFLICT (coachee_id) DO NOTHING", [c.id, c.goal?.slice(0, 120) ?? "", JSON.stringify(finance)]);
    row = (await loadPlan(c.id))!;
    row.prefilled = items.length > 0;
  }
  return row;
}

async function loadPlan(coacheeId: string): Promise<PlanRow | null> {
  const row = await one<{ coachee_id: string; title: string; sections: unknown; finance: unknown; finance_version: number; updated_at: string; finance_updated_by_name: string | null }>(
    "SELECT bp.*, u.name AS finance_updated_by_name FROM business_plans bp LEFT JOIN users u ON u.id = bp.finance_updated_by WHERE bp.coachee_id = $1",
    [coacheeId],
  );
  if (!row) return null;
  return { coachee_id: row.coachee_id, title: row.title, sections: normalizeSections(row.sections), finance: normalizeFinance(row.finance), finance_version: row.finance_version, finance_updated_at: row.updated_at, finance_updated_by_name: row.finance_updated_by_name, prefilled: false };
}

export const financeItems = (coacheeId: string) =>
  query<FinanceItem>("SELECT id, section, label, amount, period, note, source_meeting_id FROM finance_items WHERE coachee_id = $1 ORDER BY created_at", [coacheeId]);

const perMonth = (i: FinanceItem) => (i.period === "jaehrlich" ? i.amount / 12 : i.amount);

/**
 * Zahlen aus den Gesprächen in den Finanzplan übertragen. Annahmen, die man im Editor leicht ändern kann:
 * Anschaffungen über 800 € (GWG-Grenze) werden über 5 Jahre abgeschrieben, Darlehen mit 5 % über 5 Jahre und
 * 6 Monaten tilgungsfrei, monatliche Zuschüsse (Gründungszuschuss) laufen 6 Monate.
 */
export function financeFromItems(items: FinanceItem[]): FinanceInput {
  const f = emptyFinance();
  for (const i of items) {
    const label = i.label.slice(0, 120);
    switch (i.section) {
      case "kapitalbedarf":
        if (i.period === "einmalig") {
          if (/gründung|notar|gewerbe|anmeld|beratung|eintrag|website|logo|eröffnung/i.test(label) && i.amount <= 5000) f.startup.push({ label, amount: i.amount });
          else if (/reserve|puffer|liquidit/i.test(label)) f.reserve += i.amount;
          else f.investments.push({ label, amount: i.amount, month: 0, years: i.amount > 800 ? 5 : 0 });
        } else f.fixed.push({ label, monthly: perMonth(i), from: 0 });
        break;
      case "finanzierung":
        if (i.period !== "einmalig") f.grants.push({ label, monthly: perMonth(i), from: 0, months: 6 });
        else if (/kredit|darlehen|bank|kfw|mikro|sparkasse|volksbank/i.test(label)) f.financing.push({ label, kind: "darlehen", amount: i.amount, month: 0, rate: 5, years: 5, grace: 6 });
        else if (/zuschuss|förder|prämie|stipend/i.test(label)) f.financing.push({ label, kind: "zuschuss", amount: i.amount, month: 0, rate: 0, years: 0, grace: 0 });
        else f.financing.push({ label, kind: "eigen", amount: i.amount, month: 0, rate: 0, years: 0, grace: 0 });
        break;
      case "kosten":
        if (i.period === "einmalig") f.startup.push({ label, amount: i.amount });
        else f.fixed.push({ label, monthly: Math.round(perMonth(i) * 100) / 100, from: 0 });
        break;
      case "umsatz":
        if (i.period === "einmalig") f.revenues.push({ label, price: i.amount, unit: "Auftrag", qtyStart: 1, qtyTarget: 1, ramp: 0, growth2: 0, growth3: 0, material: 0 });
        // Monatsumsatz als Pauschale; im ersten Halbjahr Anlauf von 40 % auf 100 %
        else f.revenues.push({ label, price: Math.round(perMonth(i) * 100) / 100, unit: "Monat", qtyStart: 0.4, qtyTarget: 1, ramp: 6, growth2: 5, growth3: 5, material: 0 });
        break;
      case "privat":
        f.privateMonthly += i.period === "einmalig" ? 0 : perMonth(i);
        break;
    }
  }
  f.privateMonthly = Math.round(f.privateMonthly * 100) / 100;
  return f;
}
