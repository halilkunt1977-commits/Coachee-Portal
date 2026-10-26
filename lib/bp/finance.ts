// Finanzplan einer Gründung nach Halils Vorlage (Arbeitsblätter Annahmen, Kostenherleitung, Investitionsplan,
// Personalplan, Umsatzherleitung, Rentabilitätsvorschau, Rentabilität Übersicht, Liquiditätsplanung).
// Ohne Server-Abhängigkeiten, damit der Editor live rechnen kann und Excel, PDF und Word dieselben Zahlen bekommen.

export const MONTHS = 36;
export type Year3 = [number, number, number];

/** Laufende Kosten: Betrag im Monat je Planjahr, Zuordnung zu einer Zeile der Rentabilitätsvorschau */
export type CostItem = { label: string; monthly: Year3; category: string; note: string; from: number };
/** Anschaffung: Nutzungsdauer in Monaten, 0 = sofort als Aufwand (geringwertig oder Startaufwand) */
export type Investment = { label: string; amount: number; life: number; month: number; reason: string; note: string };
export type Staff = { label: string; start: number; gross: number; surcharge: number; note: string };
/** Leistungsart mit Ø Netto-Preis und Menge je Planmonat (36 Werte) */
export type Revenue = { label: string; description: string; price: number; note: string; qty: number[] };
export type Financing = { label: string; kind: "eigen" | "darlehen" | "zuschuss"; amount: number; month: number; rate: number; years: number; grace: number };
export type Grant = { label: string; monthly: number; from: number; months: number };

export const NOTE_KEYS = ["period", "material", "opening", "private", "tax", "reserve"] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];

export type FinanceInput = {
  v: 2;
  start: string; // erster Monat "JJJJ-MM"
  materialPct: Year3; // Materialquote in % vom Umsatz
  openingCash: number; // Anfangsliquidität
  privateDraw: Year3; // private Entnahmen im Monat je Planjahr
  taxPct: number; // Steuerrücklage, vereinfacht vom Gewinn
  reserve: number; // Liquiditätsreserve im Kapitalbedarf
  notes: Record<NoteKey, string>; // Herleitung / Hinweis im Blatt Annahmen
  costs: CostItem[];
  investments: Investment[];
  staff: Staff[];
  revenues: Revenue[];
  financing: Financing[];
  grants: Grant[];
};

export const FINANCING_KIND = { eigen: "Eigenkapital", darlehen: "Darlehen", zuschuss: "Zuschuss" } as const;

/** Zuordnungen der Kostenherleitung in der Reihenfolge der Vorlage; eigene Zuordnungen kommen danach */
export const COST_CATEGORIES = [
  "Betriebskosten",
  "Raumkosten",
  "Betriebliche Gebühren",
  "Versicherungen/Beiträge",
  "Plattform-/Vermittlungskosten",
  "KFZ-Kosten",
  "Werbe-/Reisekosten",
  "Sonstige Auftragskosten",
  "Reparaturen/Werkzeugersatz",
  "Steuerberater/Buchhaltung",
];

/** Kurzformen aus der Vorlage (Spalte „Zuordnung“) auf die Zeilen der Rentabilitätsvorschau */
const CATEGORY_ALIASES: [RegExp, string][] = [
  [/^betriebskost/, "Betriebskosten"],
  [/^(raum|miete|büro)/, "Raumkosten"],
  [/^(betriebliche )?gebühr|kammer/, "Betriebliche Gebühren"],
  [/^versicher|beitr/, "Versicherungen/Beiträge"],
  [/^plattform|vermittl/, "Plattform-/Vermittlungskosten"],
  [/^(kfz|fahrzeug|auto)/, "KFZ-Kosten"],
  [/^werb|reise|marketing/, "Werbe-/Reisekosten"],
  [/^sonstige auftrag/, "Sonstige Auftragskosten"],
  [/^repara|werkzeug/, "Reparaturen/Werkzeugersatz"],
  [/^steuerber|buchhalt/, "Steuerberater/Buchhaltung"],
];
export function canonicalCategory(raw: string) {
  const t = raw.trim().toLowerCase();
  if (!t) return "Betriebskosten";
  return CATEGORY_ALIASES.find(([re]) => re.test(t))?.[1] ?? raw.trim().slice(0, 60);
}

const DEFAULT_TAX = 15;

export function emptyFinance(start?: string): FinanceInput {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return {
    v: 2,
    start: start ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    materialPct: [0, 0, 0],
    openingCash: 0,
    privateDraw: [0, 0, 0],
    taxPct: DEFAULT_TAX,
    reserve: 0,
    notes: { period: "", material: "", opening: "", private: "", tax: "", reserve: "" },
    costs: [],
    investments: [],
    staff: [],
    revenues: [],
    financing: [],
    grants: [],
  };
}

const num = (v: unknown, min = -1e9, max = 1e9, def = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const list = <T,>(v: unknown, fn: (x: Record<string, unknown>) => T, max = 60): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => fn((x ?? {}) as Record<string, unknown>)) : []);
const month = (v: unknown) => Math.round(num(v, 0, MONTHS - 1, 0));
const year3 = (v: unknown, min = 0, max = 1e9): Year3 => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0], min, max), num(a[1], min, max), num(a[2], min, max)];
};
const qty36 = (v: unknown) => {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: MONTHS }, (_, i) => num(a[i], 0, 1e6));
};

export function normalizeFinance(raw: unknown): FinanceInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.v !== 2 && (Array.isArray(r.fixed) || Array.isArray(r.startup) || "privateMonthly" in r)) return fromV1(r);
  const base = emptyFinance();
  const notes = (r.notes && typeof r.notes === "object" ? r.notes : {}) as Record<string, unknown>;
  return {
    v: 2,
    start: typeof r.start === "string" && /^\d{4}-\d{2}$/.test(r.start) ? r.start : base.start,
    materialPct: year3(r.materialPct, 0, 100),
    openingCash: num(r.openingCash),
    privateDraw: year3(r.privateDraw),
    taxPct: num(r.taxPct, 0, 60, DEFAULT_TAX),
    reserve: num(r.reserve, 0),
    notes: Object.fromEntries(NOTE_KEYS.map((k) => [k, str(notes[k], 500)])) as Record<NoteKey, string>,
    costs: list(r.costs, (x) => ({ label: str(x.label), monthly: year3(x.monthly), category: str(x.category, 60) || "Betriebskosten", note: str(x.note, 300), from: month(x.from) }), 80),
    investments: list(r.investments, (x) => ({ label: str(x.label), amount: num(x.amount, 0), life: Math.round(num(x.life, 0, 600)), month: month(x.month), reason: str(x.reason, 300), note: str(x.note, 300) }), 80),
    staff: list(r.staff, (x) => ({ label: str(x.label), start: month(x.start), gross: num(x.gross, 0), surcharge: num(x.surcharge, 0, 100, 22), note: str(x.note, 300) }), 30),
    revenues: list(r.revenues, (x) => ({ label: str(x.label), description: str(x.description, 500), price: num(x.price, 0), note: str(x.note, 300), qty: qty36(x.qty) }), 40),
    financing: list(r.financing, (x) => ({
      label: str(x.label),
      kind: x.kind === "darlehen" || x.kind === "zuschuss" ? x.kind : "eigen",
      amount: num(x.amount, 0),
      month: month(x.month),
      rate: num(x.rate, 0, 30),
      years: Math.round(num(x.years, 0, 30, 5)),
      grace: Math.round(num(x.grace, 0, 60)),
    })),
    grants: list(r.grants, (x) => ({ label: str(x.label), monthly: num(x.monthly, 0), from: month(x.from), months: Math.round(num(x.months, 0, 36)) })),
  };
}

/**
 * Finanzplan der ersten Fassung (Umsatz mit Start- und Zielmenge, Anlauf und Wachstum je Jahr) in die neue Form:
 * Die Mengen werden Monat für Monat ausgerechnet, der Wareneinsatz wird zur Materialquote je Jahr,
 * Gründungskosten werden Anschaffungen mit sofortigem Aufwand. Die Zahlen bleiben dieselben.
 */
function fromV1(r: Record<string, unknown>): FinanceInput {
  const f = emptyFinance(typeof r.start === "string" && /^\d{4}-\d{2}$/.test(r.start) ? r.start : undefined);
  f.taxPct = num(r.taxPct, 0, 60, DEFAULT_TAX);
  f.reserve = num(r.reserve, 0);
  const p = num(r.privateMonthly, 0);
  f.privateDraw = [p, p, p];
  const matYear: Year3 = [0, 0, 0];
  const revYear: Year3 = [0, 0, 0];
  f.revenues = list(r.revenues, (x) => {
    const price = num(x.price, 0);
    const [qs, qt, ramp, g2, g3, mat] = [num(x.qtyStart, 0), num(x.qtyTarget, 0), Math.round(num(x.ramp, 0, 36)), num(x.growth2, -100, 500), num(x.growth3, -100, 500), num(x.material, 0, 100)];
    const qty = Array.from({ length: MONTHS }, (_, m) => {
      const y = Math.floor(m / 12);
      const q1 = ramp > 0 && m < ramp ? qs + ((qt - qs) * m) / ramp : qt;
      const factor = y === 0 ? 1 : y === 1 ? 1 + g2 / 100 : (1 + g2 / 100) * (1 + g3 / 100);
      const q = q1 * factor;
      revYear[y] += q * price;
      matYear[y] += (q * price * mat) / 100;
      return q;
    });
    return { label: str(x.label), description: str(x.unit, 30) ? `Preis je ${str(x.unit, 30)}` : "", price, note: "", qty };
  });
  f.materialPct = [0, 1, 2].map((y) => (revYear[y] > 0 ? (matYear[y] / revYear[y]) * 100 : 0)) as Year3;
  f.costs = list(r.fixed, (x) => {
    const m = num(x.monthly, 0);
    return { label: str(x.label), monthly: [m, m, m] as Year3, category: "Betriebskosten", note: "", from: month(x.from) };
  });
  f.investments = [
    ...list(r.investments, (x) => ({ label: str(x.label), amount: num(x.amount, 0), life: Math.round(num(x.years, 0, 50)) * 12, month: month(x.month), reason: "", note: "" })),
    ...list(r.startup, (x) => ({ label: str(x.label), amount: num(x.amount, 0), life: 0, month: 0, reason: "Gründungskosten", note: "" })),
  ];
  f.financing = normalizeFinance({ v: 2, financing: r.financing }).financing;
  f.grants = normalizeFinance({ v: 2, grants: r.grants }).grants;
  return f;
}

/** Hat jemand im Finanzplan schon etwas eingetragen? */
export const financeIsEmpty = (f: FinanceInput) => f.revenues.length + f.costs.length + f.investments.length + f.staff.length + f.financing.length + f.grants.length === 0;

/** Name eines Planmonats, z. B. "03/2027" */
export function monthLabel(start: string, i: number) {
  const [y, m] = start.split("-").map(Number);
  const d = new Date(y, m - 1 + i, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
/** Zeitraum eines Planjahres, z. B. "02/2027–01/2028" */
export const yearRange = (start: string, y: number) => `${monthLabel(start, y * 12)}–${monthLabel(start, y * 12 + 11)}`;

export const investmentDepreciation = (i: Investment) => (i.life > 0 ? i.amount / i.life : 0);
export const staffCost = (s: Staff) => s.gross * (1 + s.surcharge / 100);
export const yearOf = (m: number) => Math.min(2, Math.floor(m / 12));

export type MonthRow = {
  revenue: number;
  material: number;
  grossProfit: number; // Rohertrag
  personnel: number;
  byCategory: number[]; // laufende Kosten je Zuordnung, Reihenfolge wie FinanceResult.categories
  operating: number; // Summe laufende Betriebskosten
  depreciation: number; // Abschreibungen inkl. sofort abgeschriebener Anschaffungen
  totalCosts: number; // Personal + Betriebskosten + Abschreibungen
  ebit: number; // Betriebsergebnis
  interest: number;
  profit: number; // Ergebnis vor Steuern
  tax: number;
  privateDraw: number;
  grants: number;
  // Liquidität
  opening: number;
  inflowFinancing: number;
  inflow: number;
  investPaid: number;
  repayment: number;
  outflow: number;
  cashflow: number;
  balance: number;
};
export type YearRow = MonthRow;

export type FinanceResult = {
  months: MonthRow[];
  years: YearRow[];
  categories: string[];
  capitalNeed: { investments: number; reserve: number; total: number };
  financingTotal: number; // Anfangsliquidität plus Finanzierung
  gap: number;
  breakEvenRevenue: number;
  minBalance: { value: number; month: number };
  firstProfitMonth: number | null;
};

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function costCategories(f: FinanceInput) {
  const used = [...new Set(f.costs.map((c) => c.category || "Betriebskosten"))];
  return [...COST_CATEGORIES.filter((c) => used.includes(c)), ...used.filter((c) => !COST_CATEGORIES.includes(c))];
}

export function calculate(f: FinanceInput): FinanceResult {
  const categories = costCategories(f);
  const months: MonthRow[] = [];
  const loans = f.financing.filter((l) => l.kind === "darlehen").map((l) => ({ ...l, balance: 0, rateMonths: Math.max(1, l.years * 12 - l.grace) }));
  let balance = f.openingCash;
  for (let m = 0; m < MONTHS; m++) {
    const y = yearOf(m);
    const revenue = sum(f.revenues.map((r) => r.price * (r.qty[m] ?? 0)));
    const material = (revenue * f.materialPct[y]) / 100;
    const personnel = sum(f.staff.filter((s) => m >= s.start).map(staffCost));
    const byCategory = categories.map((cat) => sum(f.costs.filter((c) => (c.category || "Betriebskosten") === cat && m >= c.from).map((c) => c.monthly[y])));
    const operating = sum(byCategory);
    const depreciation = sum(f.investments.map((i) => (i.life > 0 ? (m >= i.month && m < i.month + i.life ? i.amount / i.life : 0) : m === i.month ? i.amount : 0)));
    let interest = 0;
    let repayment = 0;
    for (const l of loans) {
      if (m === l.month) l.balance += l.amount;
      if (m < l.month || l.balance <= 0) continue;
      interest += (l.balance * l.rate) / 100 / 12;
      if (m >= l.month + l.grace) {
        const rate = Math.min(l.balance, l.amount / l.rateMonths);
        repayment += rate;
        l.balance -= rate;
      }
    }
    const grossProfit = revenue - material;
    const totalCosts = personnel + operating + depreciation;
    const ebit = grossProfit - totalCosts;
    const profit = ebit - interest;
    const tax = (Math.max(0, profit) * f.taxPct) / 100;
    const privateDraw = f.privateDraw[y];
    const grants = sum(f.grants.filter((g) => m >= g.from && m < g.from + g.months).map((g) => g.monthly));
    const inflowFinancing = sum(f.financing.filter((x) => x.month === m).map((x) => x.amount));
    const investPaid = sum(f.investments.filter((i) => i.month === m).map((i) => i.amount));
    // Zahlungen im selben Monat wie Umsatz und Kosten (vereinfacht); Abschreibung ist keine Zahlung
    const inflow = revenue + inflowFinancing + grants;
    const outflow = material + personnel + operating + investPaid + interest + repayment + tax + privateDraw;
    const opening = balance;
    const cashflow = inflow - outflow;
    balance += cashflow;
    months.push({ revenue, material, grossProfit, personnel, byCategory, operating, depreciation, totalCosts, ebit, interest, profit, tax, privateDraw, grants, opening, inflowFinancing, inflow, investPaid, repayment, outflow, cashflow, balance });
  }
  const years: YearRow[] = [0, 1, 2].map((y) => {
    const part = months.slice(y * 12, y * 12 + 12);
    const total = (k: keyof MonthRow) => sum(part.map((p) => p[k] as number));
    return {
      ...(Object.fromEntries((Object.keys(part[0]) as (keyof MonthRow)[]).filter((k) => k !== "byCategory").map((k) => [k, total(k)])) as Omit<MonthRow, "byCategory">),
      byCategory: categories.map((_, i) => sum(part.map((p) => p.byCategory[i]))),
      opening: part[0].opening,
      balance: part[part.length - 1].balance,
    };
  });
  const capitalNeed = { investments: sum(f.investments.map((i) => i.amount)), reserve: f.reserve, total: 0 };
  capitalNeed.total = capitalNeed.investments + capitalNeed.reserve;
  const financingTotal = f.openingCash + sum(f.financing.map((x) => x.amount));
  const steady = months[12];
  const quote = f.materialPct[1] / 100;
  const need = steady.personnel + steady.operating + steady.depreciation + steady.interest + steady.privateDraw - steady.grants;
  const breakEvenRevenue = quote < 1 ? Math.max(0, need / (1 - quote)) : 0;
  let minBalance = { value: Infinity, month: 0 };
  months.forEach((m, i) => {
    if (m.balance < minBalance.value) minBalance = { value: m.balance, month: i };
  });
  const firstProfitMonth = months.findIndex((m) => m.profit - m.privateDraw + m.grants > 0);
  return { months, years, categories, capitalNeed, financingTotal, gap: financingTotal - capitalNeed.total, breakEvenRevenue, minBalance, firstProfitMonth: firstProfitMonth < 0 ? null : firstProfitMonth };
}

export const eur = (n: number, digits = 0) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

// ---------- Zeilen, gleich für Editor, Excel, PDF und Word ----------

/** "ref" sagt der Excel-Datei, wie die Zeile als Formel entsteht */
export type RowDef = { label: string; value: (r: MonthRow) => number; strong?: boolean; tone?: "sub" | "sum"; key: string };

/** Zeilen der Rentabilitätsvorschau wie in der Vorlage; die Kostenzeilen folgen den Zuordnungen der Kostenherleitung */
export function rentaRows(r: FinanceResult, f: FinanceInput): RowDef[] {
  const rows: Omit<RowDef, "strong">[] = [
    { key: "revenue", label: "Umsatz", value: (m) => m.revenue },
    { key: "total", label: "Gesamtleistung", value: (m) => m.revenue, tone: "sub" },
    { key: "material", label: "Material-/Wareneinsatz", value: (m) => m.material },
    { key: "gross", label: "Rohertrag", value: (m) => m.grossProfit, tone: "sum" },
    { key: "personnel", label: "Personalkosten", value: (m) => m.personnel },
    ...r.categories.map((c, i) => ({ key: `cat:${i}`, label: c, value: (m: MonthRow) => m.byCategory[i] })),
    { key: "depreciation", label: f.investments.some((i) => i.life === 0) ? "Abschreibungen und Sofortaufwand" : "Abschreibungen", value: (m) => m.depreciation },
    { key: "costs", label: "Gesamtkosten", value: (m) => m.totalCosts, tone: "sub" },
    { key: "ebit", label: "Betriebsergebnis", value: (m) => m.ebit, tone: "sum" },
    { key: "interest", label: "Zinsaufwand", value: (m) => m.interest },
    { key: "profit", label: "Ergebnis vor Steuern", value: (m) => m.profit, tone: "sum" },
  ];
  return rows.map((x) => ({ ...x, strong: x.tone !== undefined }));
}

/** Hat der Plan Angaben über die Vorlage hinaus (Steuerrücklage, Entnahmen, Zuschüsse)? Dann zeigt die Übersicht sie mit. */
export const hasLiving = (f: FinanceInput) => f.taxPct > 0 || f.privateDraw.some((x) => x > 0) || f.grants.length > 0;

/** Zeilen der Rentabilität Übersicht (Jahr 1 bis 3) */
export function overviewRows(f: FinanceInput): RowDef[] {
  const rows: RowDef[] = [
    { key: "revenue", label: "Umsatz", value: (y) => y.revenue },
    { key: "material", label: "Material-/Wareneinsatz", value: (y) => y.material },
    { key: "gross", label: "Rohertrag", value: (y) => y.grossProfit, strong: true, tone: "sum" },
    { key: "personnel", label: "Personalkosten", value: (y) => y.personnel },
    { key: "costs", label: "Gesamtkosten", value: (y) => y.totalCosts },
    { key: "profit", label: "Ergebnis vor Steuern", value: (y) => y.profit, strong: true, tone: "sum" },
  ];
  if (hasLiving(f))
    rows.push(
      { key: "tax", label: `Steuerrücklage (${pct(f.taxPct)} vom Gewinn)`, value: (y) => y.tax },
      { key: "private", label: "Private Entnahmen", value: (y) => y.privateDraw },
      { key: "grants", label: "Zuschüsse zum Lebensunterhalt", value: (y) => y.grants },
      { key: "surplus", label: "Überschuss nach Steuern und Entnahmen", value: (y) => y.profit - y.tax - y.privateDraw + y.grants, strong: true, tone: "sum" },
    );
  return rows;
}

/** Zeilen der Liquiditätsplanung je Monat */
export function liquidityRows(f: FinanceInput): (RowDef & { group?: string })[] {
  const loans = f.financing.some((x) => x.kind === "darlehen");
  const rows: (RowDef & { group?: string })[] = [
    { key: "revenue", group: "Einzahlungen", label: "Umsatz", value: (m) => m.revenue },
    { key: "other", label: "Sonstige Einzahlungen (Eigenkapital, Darlehen, Zuschüsse)", value: (m) => m.inflowFinancing + m.grants },
    { key: "inflow", label: "Summe Einzahlungen", value: (m) => m.inflow, strong: true, tone: "sub" },
    { key: "material", group: "Auszahlungen", label: "Material-/Wareneinsatz", value: (m) => m.material },
    { key: "personnel", label: "Personalkosten", value: (m) => m.personnel },
    { key: "operating", label: "Laufende Betriebskosten", value: (m) => m.operating },
    { key: "invest", label: "Investitionen", value: (m) => m.investPaid },
  ];
  if (loans) rows.push({ key: "interest", label: "Zinsen", value: (m) => m.interest }, { key: "repayment", label: "Tilgung", value: (m) => m.repayment });
  if (f.taxPct > 0) rows.push({ key: "tax", label: "Steuerrücklage", value: (m) => m.tax });
  rows.push(
    { key: "private", label: "Private Entnahmen", value: (m) => m.privateDraw },
    { key: "outflow", label: "Summe Auszahlungen", value: (m) => m.outflow, strong: true, tone: "sub" },
    { key: "cashflow", label: "Monatlicher Saldo", value: (m) => m.cashflow, strong: true, tone: "sum" },
    { key: "balance", label: "Kontostand Monatsende", value: (m) => m.balance, strong: true, tone: "sum" },
  );
  return rows;
}

// ---------- Kennzahlen für den Businessplan ----------

/** Kennzahlen-Tabelle wie im Kapitel „Finanzwirtschaftliche Planung“ der Vorlage */
export function keyFigures(f: FinanceInput, r = calculate(f)): string[][] {
  const same = f.materialPct.every((p) => p === f.materialPct[0]);
  const paid = f.staff.filter((s) => s.gross > 0).sort((a, b) => a.start - b.start);
  const personnel = [0, 1, 2].map((y) => {
    const starting = paid.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => yearOf(s.start) === y);
    if (starting.length) return starting.map(({ s, n }) => `${n}. Mitarbeiter ab ${monthLabel(f.start, s.start)}`).join(", ");
    const active = paid.filter((s) => s.start < y * 12 + 12).length;
    return active ? `Inhaber + ${active} Mitarbeiter` : "Inhaber";
  });
  const money = (n: number) => eur(Math.round(n));
  return [
    ["Kennzahl", "Jahr 1", "Jahr 2", "Jahr 3"],
    ["Netto-Umsatz", ...r.years.map((y) => money(y.revenue))],
    [`Materialaufwand${same && f.materialPct[0] ? ` (${pct(f.materialPct[0])})` : ""}`, ...r.years.map((y) => money(y.material))],
    ["Rohertrag", ...r.years.map((y) => money(y.grossProfit))],
    ["Ergebnis vor Steuern", ...r.years.map((y) => money(y.profit))],
    ["Personal", ...personnel],
  ];
}

/** Hinweise, die Fachstelle oder Bank sofort sehen würden */
/** text ist die deutsche Vorlage mit {Platzhaltern} aus vars, damit die Oberfläche sie übersetzen kann */
export function financeHints(f: FinanceInput, r: FinanceResult): { tone: "warn" | "ok"; text: string; vars?: Record<string, string> }[] {
  const out: { tone: "warn" | "ok"; text: string; vars?: Record<string, string> }[] = [];
  if (!f.revenues.length) out.push({ tone: "warn", text: "Es sind noch keine Umsätze geplant (Umsatzherleitung)." });
  if (f.revenues.length && !f.materialPct.some((x) => x > 0) && !f.costs.length) out.push({ tone: "warn", text: "Es sind noch keine Kosten eingetragen (Kostenherleitung, Materialquote)." });
  if (r.minBalance.value < 0) out.push({ tone: "warn", text: "Der Kontostand wird im Monat {monat} negativ ({betrag}). Anfangsliquidität, Finanzierung oder Anlauf anpassen.", vars: { monat: monthLabel(f.start, r.minBalance.month), betrag: eur(r.minBalance.value) } });
  else if (r.gap < 0 && r.capitalNeed.total > 0) out.push({ tone: "ok", text: "Anfangsliquidität und Finanzierung decken {gedeckt} des Kapitalbedarfs von {bedarf}, der Rest kommt aus den ersten Umsätzen.", vars: { gedeckt: eur(r.financingTotal), bedarf: eur(r.capitalNeed.total) } });
  const surplus = (y: YearRow) => y.profit - y.tax - y.privateDraw + y.grants;
  if (f.revenues.length && hasLiving(f) && surplus(r.years[0]) < 0 && surplus(r.years[1]) < 0) out.push({ tone: "warn", text: "Auch im zweiten Jahr deckt das Ergebnis Steuern und private Entnahmen nicht." });
  if (f.revenues.length && r.minBalance.value >= 0) out.push({ tone: "ok", text: "Die Liquidität bleibt über alle 36 Monate positiv." });
  return out;
}

/** Kurzfassung der Zahlen als Text für den Entwurf der Kapitel */
export function financeSummary(f: FinanceInput) {
  if (financeIsEmpty(f) && !f.openingCash) return "Finanzplan: noch keine Zahlen.";
  const r = calculate(f);
  const out = [`Zahlen aus dem Finanzplan (Planungszeitraum ${yearRange(f.start, 0)} bis ${yearRange(f.start, 2).split("–")[1]}, alle Beträge netto):`];
  out.push(`- Materialquote: ${f.materialPct.map(pct).join(" / ")} (Jahr 1 / 2 / 3)`);
  if (f.openingCash) out.push(`- Anfangsliquidität: ${eur(f.openingCash)}`);
  if (f.privateDraw.some((x) => x)) out.push(`- Private Entnahmen im Monat: ${f.privateDraw.map((x) => eur(x)).join(" / ")}`);
  for (const x of f.revenues) out.push(`- Leistung: ${x.label} zu Ø ${eur(x.price)} netto, Menge Jahr 1/2/3: ${[0, 1, 2].map((y) => sum(x.qty.slice(y * 12, y * 12 + 12)).toLocaleString("de-DE")).join(" / ")}`);
  for (const c of f.costs) out.push(`- Kosten: ${c.label} (${c.category}) ${c.monthly.map((x) => eur(x)).join(" / ")} im Monat${c.note ? `, ${c.note}` : ""}`);
  if (f.investments.length) out.push(`- Investitionen: ${eur(r.capitalNeed.investments)} gesamt (${f.investments.map((i) => `${i.label} ${eur(i.amount)}${i.life ? `, ${i.life} Monate Nutzung` : ", sofort Aufwand"}`).join("; ")})`);
  for (const s of f.staff) out.push(`- Personal: ${s.label} ab ${monthLabel(f.start, s.start)}${s.gross ? `, ${eur(s.gross)} brutto + ${pct(s.surcharge)} Arbeitgeberanteil = ${eur(staffCost(s))} im Monat` : ", keine Personalkosten"}`);
  for (const x of f.financing) out.push(`- Finanzierung: ${x.label || FINANCING_KIND[x.kind]} ${eur(x.amount)} (${FINANCING_KIND[x.kind]})`);
  for (const g of f.grants) out.push(`- Zuschuss: ${g.label} ${eur(g.monthly)} im Monat für ${g.months} Monate`);
  r.years.forEach((y, i) => out.push(`- Jahr ${i + 1}: Umsatz ${eur(y.revenue)}, Material ${eur(y.material)}, Rohertrag ${eur(y.grossProfit)}, Personal ${eur(y.personnel)}, Gesamtkosten ${eur(y.totalCosts)}, Ergebnis vor Steuern ${eur(y.profit)}, Kontostand am Jahresende ${eur(y.balance)}`));
  return out.join("\n");
}
