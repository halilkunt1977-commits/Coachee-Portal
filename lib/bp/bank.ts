// Angaben für die Bankfassung (Kreditantrag, Förderkredit): Bundesland, Hausbank, Sicherheiten, private Vermögenslage,
// Fragen und Antworten fürs Bankgespräch. Dazu die Rechnungen, die Banken sehen wollen: Kapitaldienstfähigkeit und Tilgungsplan.
// Ohne Server-Abhängigkeiten.
import { BANK_FRAGEN } from "./foerderung";
import { calculate, type FinanceInput, type FinanceResult, type Financing } from "./finance";

export type Posten = { label: string; betrag: number };
export type Verbindlichkeit = { label: string; betrag: number; rate: number };
export type BankFrage = { frage: string; antwort: string };

export type BankInfo = {
  land: string;
  hausbank: string;
  sicherheiten: string;
  /** woher die Eigenmittel stammen */
  eigenmittel: string;
  vermoegen: Posten[];
  verbindlichkeiten: Verbindlichkeit[];
  fragen: BankFrage[];
};

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(1e9, n)) : 0;
};
const rows = <T,>(v: unknown, fn: (x: Record<string, unknown>) => T, max = 30): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => fn((x ?? {}) as Record<string, unknown>)) : []);

export function normalizeBank(raw: unknown): BankInfo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fragen = rows(r.fragen, (x) => ({ frage: str(x.frage, 300), antwort: str(x.antwort, 3000) }), 40).filter((x) => x.frage);
  return {
    land: str(r.land, 4),
    hausbank: str(r.hausbank, 120),
    sicherheiten: str(r.sicherheiten, 1500),
    eigenmittel: str(r.eigenmittel, 800),
    vermoegen: rows(r.vermoegen, (x) => ({ label: str(x.label, 120), betrag: num(x.betrag) })),
    verbindlichkeiten: rows(r.verbindlichkeiten, (x) => ({ label: str(x.label, 120), betrag: num(x.betrag), rate: num(x.rate) })),
    // fehlende Standardfragen ergänzen, eigene Fragen bleiben
    fragen: [...BANK_FRAGEN.map((frage) => fragen.find((x) => x.frage === frage) ?? { frage, antwort: "" }), ...fragen.filter((x) => !BANK_FRAGEN.includes(x.frage))],
  };
}

export const emptyBank = () => normalizeBank({});

/** Zins und Tilgung eines Darlehens über die ganze Laufzeit, je Planjahr (Jahr 1 = erste 12 Monate ab Planstart) */
export function tilgungsplan(l: Financing) {
  const rateMonths = Math.max(1, l.years * 12 - l.grace);
  const out: { jahr: number; zins: number; tilgung: number; rest: number }[] = [];
  let balance = 0;
  const end = l.month + Math.max(1, l.years) * 12;
  for (let m = 0; m < end; m++) {
    const y = Math.floor(m / 12);
    out[y] ??= { jahr: y + 1, zins: 0, tilgung: 0, rest: 0 };
    if (m === l.month) balance += l.amount;
    if (m >= l.month && balance > 0) {
      out[y].zins += (balance * l.rate) / 100 / 12;
      if (m >= l.month + l.grace) {
        const t = Math.min(balance, l.amount / rateMonths);
        out[y].tilgung += t;
        balance -= t;
      }
    }
    out[y].rest = balance;
  }
  return out;
}

/** Monatliche Rate nach der tilgungsfreien Zeit (Zins im ersten Tilgungsmonat plus Tilgung) */
export const ersteRate = (l: Financing) => l.amount / Math.max(1, l.years * 12 - l.grace) + (l.amount * l.rate) / 100 / 12;

/**
 * Kapitaldienstfähigkeit je Planjahr, wie Banken sie rechnen: Ergebnis vor Steuern plus Abschreibungen und Zinsen,
 * minus Steuern und Privatentnahmen, plus Zuschüsse zum Lebensunterhalt = verfügbar für den Kapitaldienst (Zins und Tilgung).
 */
export function kapitaldienst(f: FinanceInput, r: FinanceResult = calculate(f)) {
  return r.years.map((y, i) => {
    const repayment = r.months.slice(i * 12, i * 12 + 12).reduce((s, m) => s + m.repayment, 0);
    const verfuegbar = y.profit + y.depreciation + y.interest - y.tax - y.privateDraw + y.grants;
    const dienst = y.interest + repayment;
    return { jahr: i + 1, profit: y.profit, afa: y.depreciation, zins: y.interest, steuer: y.tax, entnahme: y.privateDraw, zuschuss: y.grants, verfuegbar, tilgung: repayment, dienst, ueberdeckung: verfuegbar - dienst, deckung: dienst > 0 ? verfuegbar / dienst : null };
  });
}

export const vermoegenSumme = (b: BankInfo) => b.vermoegen.reduce((s, x) => s + x.betrag, 0);
export const schuldenSumme = (b: BankInfo) => b.verbindlichkeiten.reduce((s, x) => s + x.betrag, 0);

/** Eigenmittel im Finanzplan: Anfangsliquidität plus eingebrachtes Eigenkapital */
export function eigenmittel(f: FinanceInput) {
  return f.openingCash + f.financing.filter((x) => x.kind === "eigen").reduce((s, x) => s + x.amount, 0);
}
