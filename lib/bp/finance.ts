// Finanzplan einer Gründung: Eingaben, Rechnung über 36 Monate, Rentabilität und Liquidität.
// Ohne Server-Abhängigkeiten, damit der Editor live rechnen kann und Excel/PDF dieselben Zahlen bekommen.

export type Investment = { label: string; amount: number; month: number; years: number };
export type OneOff = { label: string; amount: number };
export type Financing = { label: string; kind: "eigen" | "darlehen" | "zuschuss"; amount: number; month: number; rate: number; years: number; grace: number };
export type Revenue = { label: string; price: number; unit: string; qtyStart: number; qtyTarget: number; ramp: number; growth2: number; growth3: number; material: number };
export type FixedCost = { label: string; monthly: number; from: number };
export type Grant = { label: string; monthly: number; from: number; months: number };

export type FinanceInput = {
  start: string; // erster Monat "JJJJ-MM"
  investments: Investment[];
  startup: OneOff[];
  reserve: number;
  financing: Financing[];
  revenues: Revenue[];
  fixed: FixedCost[];
  privateMonthly: number;
  grants: Grant[];
  taxPct: number;
};

export const FINANCING_KIND = { eigen: "Eigenkapital", darlehen: "Darlehen", zuschuss: "Zuschuss" } as const;
export const MONTHS = 36;

export function emptyFinance(): FinanceInput {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return {
    start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    investments: [],
    startup: [],
    reserve: 0,
    financing: [],
    revenues: [],
    fixed: [],
    privateMonthly: 0,
    grants: [],
    taxPct: 15,
  };
}

const num = (v: unknown, min = -1e9, max = 1e9, def = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const list = <T,>(v: unknown, fn: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.slice(0, 60).map((x) => fn((x ?? {}) as Record<string, unknown>)) : []);
const month = (v: unknown) => Math.round(num(v, 0, MONTHS - 1, 0));

export function normalizeFinance(raw: unknown): FinanceInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptyFinance();
  return {
    start: typeof r.start === "string" && /^\d{4}-\d{2}$/.test(r.start) ? r.start : base.start,
    investments: list(r.investments, (x) => ({ label: str(x.label), amount: num(x.amount, 0), month: month(x.month), years: Math.round(num(x.years, 0, 50)) })),
    startup: list(r.startup, (x) => ({ label: str(x.label), amount: num(x.amount, 0) })),
    reserve: num(r.reserve, 0),
    financing: list(r.financing, (x) => ({
      label: str(x.label),
      kind: x.kind === "darlehen" || x.kind === "zuschuss" ? x.kind : "eigen",
      amount: num(x.amount, 0),
      month: month(x.month),
      rate: num(x.rate, 0, 30),
      years: Math.round(num(x.years, 0, 30, 5)),
      grace: Math.round(num(x.grace, 0, 60)),
    })),
    revenues: list(r.revenues, (x) => ({
      label: str(x.label),
      price: num(x.price, 0),
      unit: str(x.unit, 30) || "Stück",
      qtyStart: num(x.qtyStart, 0),
      qtyTarget: num(x.qtyTarget, 0),
      ramp: Math.round(num(x.ramp, 0, 36)),
      growth2: num(x.growth2, -100, 500),
      growth3: num(x.growth3, -100, 500),
      material: num(x.material, 0, 100),
    })),
    fixed: list(r.fixed, (x) => ({ label: str(x.label), monthly: num(x.monthly, 0), from: month(x.from) })),
    privateMonthly: num(r.privateMonthly, 0),
    grants: list(r.grants, (x) => ({ label: str(x.label), monthly: num(x.monthly, 0), from: month(x.from), months: Math.round(num(x.months, 0, 36)) })),
    taxPct: num(r.taxPct, 0, 60, 15),
  };
}

/** Name eines Planmonats, z. B. "03/2027" */
export function monthLabel(start: string, i: number) {
  const [y, m] = start.split("-").map(Number);
  const d = new Date(y, m - 1 + i, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export type MonthRow = {
  revenue: number;
  material: number;
  fixed: number;
  oneOff: number; // Gründungskosten und sofort abgeschriebene Anschaffungen
  depreciation: number;
  interest: number;
  profit: number; // vor Steuern
  tax: number;
  grants: number;
  privateDraw: number;
  // Liquidität
  inflowFinancing: number;
  outflowInvest: number;
  repayment: number;
  cashflow: number;
  balance: number;
};

export type YearRow = Omit<MonthRow, "balance"> & { balance: number };

export type FinanceResult = {
  months: MonthRow[];
  years: YearRow[];
  capitalNeed: { investments: number; startup: number; reserve: number; total: number };
  financingTotal: number;
  gap: number; // Finanzierung minus Kapitalbedarf
  breakEvenRevenue: number; // nötiger Monatsumsatz, damit Kosten und Lebensunterhalt gedeckt sind
  minBalance: { value: number; month: number };
  firstProfitMonth: number | null;
};

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function calculate(f: FinanceInput): FinanceResult {
  const months: MonthRow[] = [];
  // Darlehen: Restschuld je Darlehen
  const loans = f.financing.filter((l) => l.kind === "darlehen").map((l) => ({ ...l, balance: 0, rateMonths: Math.max(1, l.years * 12 - l.grace) }));
  let balance = 0;
  for (let m = 0; m < MONTHS; m++) {
    const year = Math.floor(m / 12);
    let revenue = 0;
    let material = 0;
    for (const r of f.revenues) {
      const qty1 = r.ramp > 0 && m < r.ramp ? r.qtyStart + ((r.qtyTarget - r.qtyStart) * m) / r.ramp : r.qtyTarget;
      const factor = year === 0 ? 1 : year === 1 ? 1 + r.growth2 / 100 : (1 + r.growth2 / 100) * (1 + r.growth3 / 100);
      const rev = r.price * qty1 * factor;
      revenue += rev;
      material += (rev * r.material) / 100;
    }
    const fixed = sum(f.fixed.filter((c) => m >= c.from).map((c) => c.monthly));
    const oneOff = (m === 0 ? sum(f.startup.map((s) => s.amount)) : 0) + sum(f.investments.filter((i) => i.years === 0 && i.month === m).map((i) => i.amount));
    const depreciation = sum(f.investments.filter((i) => i.years > 0 && m >= i.month && m < i.month + i.years * 12).map((i) => i.amount / (i.years * 12)));
    let interest = 0;
    let repayment = 0;
    for (const l of loans) {
      if (m === l.month) l.balance += l.amount;
      if (m < l.month || l.balance <= 0) continue;
      interest += (l.balance * l.rate) / 100 / 12;
      if (m >= l.month + l.grace) {
        const r = Math.min(l.balance, l.amount / l.rateMonths);
        repayment += r;
        l.balance -= r;
      }
    }
    const profit = revenue - material - fixed - oneOff - depreciation - interest;
    const tax = Math.max(0, profit) * (f.taxPct / 100);
    const grants = sum(f.grants.filter((g) => m >= g.from && m < g.from + g.months).map((g) => g.monthly));
    const privateDraw = f.privateMonthly;
    const inflowFinancing = sum(f.financing.filter((x) => x.month === m).map((x) => x.amount));
    const outflowInvest = sum(f.investments.filter((i) => i.month === m && i.years > 0).map((i) => i.amount));
    // Zahlungen: Umsatz und Kosten im selben Monat (vereinfacht), Abschreibung ist keine Zahlung
    const cashflow = inflowFinancing + grants + revenue - material - fixed - oneOff - interest - tax - privateDraw - outflowInvest - repayment;
    balance += cashflow;
    months.push({ revenue, material, fixed, oneOff, depreciation, interest, profit, tax, grants, privateDraw, inflowFinancing, outflowInvest, repayment, cashflow, balance });
  }
  const years: YearRow[] = [0, 1, 2].map((y) => {
    const part = months.slice(y * 12, y * 12 + 12);
    const total = (k: keyof MonthRow) => sum(part.map((p) => p[k]));
    return {
      revenue: total("revenue"),
      material: total("material"),
      fixed: total("fixed"),
      oneOff: total("oneOff"),
      depreciation: total("depreciation"),
      interest: total("interest"),
      profit: total("profit"),
      tax: total("tax"),
      grants: total("grants"),
      privateDraw: total("privateDraw"),
      inflowFinancing: total("inflowFinancing"),
      outflowInvest: total("outflowInvest"),
      repayment: total("repayment"),
      cashflow: total("cashflow"),
      balance: part[part.length - 1].balance,
    };
  });
  const capitalNeed = { investments: sum(f.investments.map((i) => i.amount)), startup: sum(f.startup.map((s) => s.amount)), reserve: f.reserve, total: 0 };
  capitalNeed.total = capitalNeed.investments + capitalNeed.startup + capitalNeed.reserve;
  const financingTotal = sum(f.financing.map((x) => x.amount));
  const totalRevenue1 = years[0].revenue;
  const materialShare = totalRevenue1 > 0 ? years[0].material / totalRevenue1 : 0;
  const steady = months[Math.min(MONTHS - 1, 12)];
  const fixedNeed = steady.fixed + steady.depreciation + steady.interest + f.privateMonthly - (steady.grants || 0);
  const breakEvenRevenue = materialShare < 1 ? Math.max(0, fixedNeed / (1 - materialShare)) : 0;
  let minBalance = { value: Infinity, month: 0 };
  months.forEach((m, i) => {
    if (m.balance < minBalance.value) minBalance = { value: m.balance, month: i };
  });
  const firstProfitMonth = months.findIndex((m) => m.profit - m.privateDraw + m.grants > 0);
  return { months, years, capitalNeed, financingTotal, gap: financingTotal - capitalNeed.total, breakEvenRevenue, minBalance, firstProfitMonth: firstProfitMonth < 0 ? null : firstProfitMonth };
}

export const eur = (n: number, digits = 0) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits });

// ---------- Tabellenzeilen, gleich für Editor, Excel und PDF ----------

type RowDef<R> = { label: string; value: (r: R) => number; sign?: "+" | "−" | "="; strong?: boolean };

export const RENTA_ROWS: RowDef<YearRow>[] = [
  { label: "Umsatzerlöse", value: (y) => y.revenue },
  { label: "Material und Wareneinsatz", value: (y) => y.material, sign: "−" },
  { label: "Rohertrag", value: (y) => y.revenue - y.material, sign: "=", strong: true },
  { label: "Laufende Kosten", value: (y) => y.fixed, sign: "−" },
  { label: "Gründungskosten und geringwertige Anschaffungen", value: (y) => y.oneOff, sign: "−" },
  { label: "Abschreibungen", value: (y) => y.depreciation, sign: "−" },
  { label: "Zinsen", value: (y) => y.interest, sign: "−" },
  { label: "Gewinn vor Steuern", value: (y) => y.profit, sign: "=", strong: true },
  { label: "Steuerrücklage", value: (y) => y.tax, sign: "−" },
  { label: "Privatentnahmen (Lebensunterhalt)", value: (y) => y.privateDraw, sign: "−" },
  { label: "Zuschüsse (z. B. Gründungszuschuss)", value: (y) => y.grants, sign: "+" },
  { label: "Überschuss nach Lebensunterhalt", value: (y) => y.profit - y.tax - y.privateDraw + y.grants, sign: "=", strong: true },
];

export const LIQ_ROWS: (RowDef<MonthRow> & { group?: string })[] = [
  { group: "Einzahlungen", label: "Eigenkapital, Darlehen, Zuschüsse", value: (m) => m.inflowFinancing, sign: "+" },
  { label: "Laufende Zuschüsse", value: (m) => m.grants, sign: "+" },
  { label: "Umsatz", value: (m) => m.revenue, sign: "+" },
  { group: "Auszahlungen", label: "Anschaffungen", value: (m) => m.outflowInvest, sign: "−" },
  { label: "Gründungskosten und geringwertige Anschaffungen", value: (m) => m.oneOff, sign: "−" },
  { label: "Material und Wareneinsatz", value: (m) => m.material, sign: "−" },
  { label: "Laufende Kosten", value: (m) => m.fixed, sign: "−" },
  { label: "Zinsen", value: (m) => m.interest, sign: "−" },
  { label: "Tilgung", value: (m) => m.repayment, sign: "−" },
  { label: "Steuerrücklage", value: (m) => m.tax, sign: "−" },
  { label: "Privatentnahme", value: (m) => m.privateDraw, sign: "−" },
  { label: "Saldo des Monats", value: (m) => m.cashflow, sign: "=", strong: true },
  { label: "Kontostand am Monatsende", value: (m) => m.balance, strong: true },
];

/** Hinweise, die Fachstelle oder Bank sofort sehen würden */
export function financeHints(f: FinanceInput, r: FinanceResult): { tone: "warn" | "ok"; text: string }[] {
  const out: { tone: "warn" | "ok"; text: string }[] = [];
  if (!f.revenues.length) out.push({ tone: "warn", text: "Es sind noch keine Umsätze geplant." });
  if (!f.privateMonthly) out.push({ tone: "warn", text: "Der private Bedarf (Miete, Krankenversicherung, Lebenshaltung) fehlt. Die Fachstelle prüft, ob die Gründung den Lebensunterhalt trägt." });
  if (r.gap < 0) out.push({ tone: "warn", text: `Die Finanzierung deckt den Kapitalbedarf nicht: Es fehlen ${eur(-r.gap)}.` });
  if (r.minBalance.value < 0) out.push({ tone: "warn", text: `Der Kontostand wird im Monat ${monthLabel(f.start, r.minBalance.month)} negativ (${eur(r.minBalance.value)}). Reserve, Finanzierung oder Anlauf anpassen.` });
  const y1 = r.years[0];
  if (f.revenues.length && y1.profit - y1.tax - y1.privateDraw + y1.grants < 0 && r.years[1].profit - r.years[1].tax - r.years[1].privateDraw + r.years[1].grants < 0)
    out.push({ tone: "warn", text: "Auch im zweiten Jahr deckt der Gewinn den Lebensunterhalt nicht." });
  if (f.revenues.length && r.minBalance.value >= 0 && r.gap >= 0) out.push({ tone: "ok", text: "Die Liquidität bleibt über alle 36 Monate positiv." });
  if (r.firstProfitMonth !== null && f.revenues.length) out.push({ tone: "ok", text: `Ab ${monthLabel(f.start, r.firstProfitMonth)} deckt der Gewinn den Lebensunterhalt (mit Zuschüssen).` });
  return out;
}

/** Kurzfassung der Zahlen als Text für die KI */
export function financeSummary(f: FinanceInput) {
  const r = calculate(f);
  const out = ["Zahlen aus dem Finanzplan:"];
  if (r.capitalNeed.total) out.push(`- Kapitalbedarf: ${eur(r.capitalNeed.total)} (Anschaffungen ${eur(r.capitalNeed.investments)}, Gründungskosten ${eur(r.capitalNeed.startup)}, Reserve ${eur(r.capitalNeed.reserve)})`);
  for (const x of f.financing) out.push(`- Finanzierung: ${x.label || FINANCING_KIND[x.kind]} ${eur(x.amount)} (${FINANCING_KIND[x.kind]})`);
  for (const g of f.grants) out.push(`- Zuschuss: ${g.label} ${eur(g.monthly)} im Monat für ${g.months} Monate`);
  for (const x of f.revenues) out.push(`- Umsatz: ${x.label} zu ${eur(x.price, 2)} je ${x.unit}, Ziel ${x.qtyTarget} im Monat`);
  r.years.forEach((y, i) => y.revenue && out.push(`- Jahr ${i + 1}: Umsatz ${eur(y.revenue)}, Gewinn vor Steuern ${eur(y.profit)}`));
  if (r.breakEvenRevenue) out.push(`- Nötiger Monatsumsatz für Kosten und Lebensunterhalt: ${eur(r.breakEvenRevenue)}`);
  if (f.privateMonthly) out.push(`- Privater Bedarf: ${eur(f.privateMonthly)} im Monat`);
  return out.length > 1 ? out.join("\n") : "Finanzplan: noch keine Zahlen.";
}
