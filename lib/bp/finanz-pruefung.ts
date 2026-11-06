// Plausibilitätsprüfung des Finanzplans, wie sie fachkundige Stelle und Bank vornehmen, und Vorschläge für Posten,
// die in der gewählten Branche üblich sind, im Plan aber fehlen. Ohne Server-Abhängigkeiten: läuft live im Editor.
import type { Branche } from "./branchen";
import { eur, livingTotal, monthLabel, pct, type FinanceInput, type FinanceResult } from "./finance";

export type Hinweis = { tone: "warn" | "ok"; text: string; vars?: Record<string, string> };

/** abrechenbare Stunden je Person und Monat bei rund 85 % Auslastung */
const MAX_HOURS = 140;
const HOURS = /stunde|std\.?\b|stundensatz/i;

/** Zuschüsse zum Lebensunterhalt im Schnitt je Monat eines Planjahres */
function grantsAvg(f: FinanceInput, y: number) {
  let total = 0;
  for (let m = y * 12; m < y * 12 + 12; m++) for (const g of f.grants) if (m >= g.from && m < g.from + g.months) total += g.monthly;
  return total / 12;
}

export function pruefeFinanzplan(f: FinanceInput, r: FinanceResult, branche?: Branche | null): Hinweis[] {
  const out: Hinweis[] = [];
  if (!f.revenues.length) return out;

  // Lebensunterhalt: Entnahme plus Zuschüsse müssen die privaten Kosten decken
  const living = livingTotal(f);
  if (living > 0) {
    const short = [0, 1].filter((y) => f.privateDraw[y] + grantsAvg(f, y) < living - 1);
    if (short.length) out.push({ tone: "warn", text: "Die private Entnahme im Jahr {jahr} ({entnahme} im Monat, mit Zuschüssen) deckt die Lebenshaltungskosten von {leben} nicht.", vars: { jahr: String(short[0] + 1), entnahme: eur(f.privateDraw[short[0]] + grantsAvg(f, short[0])), leben: eur(living) } });
    else out.push({ tone: "ok", text: "Die private Entnahme deckt die Lebenshaltungskosten von {leben} im Monat.", vars: { leben: eur(living) } });
  } else if (!f.privateDraw.some((x) => x > 0) && !f.grants.length) {
    out.push({ tone: "warn", text: "Es ist keine private Entnahme geplant. Fachstelle und Bank prüfen, wovon der Lebensunterhalt bezahlt wird: Lebenshaltungskosten unter Annahmen eintragen." });
  }

  // Wareneinsatz im Rahmen der Branche
  if (branche?.wareneinsatz && r.years[0].revenue > 0) {
    const [lo, hi] = branche.wareneinsatz;
    const q = f.materialPct[0];
    if (q < lo || q > hi) out.push({ tone: "warn", text: "Die Materialquote von {quote} liegt außerhalb dessen, was in der Branche {branche} üblich ist ({von} bis {bis}). Bitte begründen oder anpassen.", vars: { quote: pct(q), branche: branche.label, von: pct(lo), bis: pct(hi) } });
  }

  // Auslastung: abrechenbare Stunden je Person
  const people = (m: number) => 1 + f.staff.filter((s) => s.gross > 0 && m >= s.start).length;
  for (const rev of f.revenues) {
    if (!HOURS.test(`${rev.label} ${rev.description}`)) continue;
    const m = rev.qty.findIndex((q, i) => q > MAX_HOURS * people(i));
    if (m >= 0) {
      out.push({ tone: "warn", text: "„{leistung}“: Im Monat {monat} sind {stunden} Stunden geplant. Mehr als rund {max} abrechenbare Stunden je Person im Monat (85 % Auslastung) sind kaum zu schaffen.", vars: { leistung: rev.label, monat: monthLabel(f.start, m), stunden: Math.round(rev.qty[m]).toLocaleString("de-DE"), max: String(MAX_HOURS) } });
      break;
    }
  }

  // Sprung im Umsatz
  const [y1, y2] = [r.years[0].revenue, r.years[1].revenue];
  if (y1 > 0 && y2 > y1 * 2.5) out.push({ tone: "warn", text: "Der Umsatz steigt von Jahr 1 auf Jahr 2 auf mehr als das 2,5-Fache ({von} auf {bis}). Das braucht eine gute Begründung im Businessplan.", vars: { von: eur(y1), bis: eur(y2) } });

  // Finanzierung
  if (f.financing.some((x) => x.kind === "darlehen" && x.amount > 0 && x.rate <= 0)) out.push({ tone: "warn", text: "Ein Darlehen ist ohne Zins eingetragen. Bitte den Zinssatz aus dem Angebot der Bank eintragen." });

  // Pflichtposten, die in fast jedem Plan stehen
  const labels = norm(f.costs.map((c) => `${c.label} ${c.category}`).join(" "));
  if (!/steuerber|buchhalt/.test(labels)) out.push({ tone: "warn", text: "Kosten für Steuerberater oder Buchhaltung fehlen." });
  if (!/versicher|haftpflicht/.test(labels)) out.push({ tone: "warn", text: "Kosten für Versicherungen (z. B. Betriebshaftpflicht) fehlen." });
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
const STOP = new Set(["und", "oder", "bzw", "kosten", "system", "erste", "laufende", "fuer", "sowie"]);
const tokens = (s: string) => norm(s).split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
/** Wortstamm für den Vergleich (Versicherungen ~ Versicherung, Werbung online ~ Werbe-) */
const stem = (w: string) => w.slice(0, Math.max(5, Math.min(w.length, 8)));

function present(item: string, have: string[]) {
  const want = tokens(item).map(stem);
  if (!want.length) return true;
  const got = have.flatMap(tokens).map(stem);
  return want.some((w) => got.some((g) => g.startsWith(w) || w.startsWith(g)));
}

/** Branchenübliche Posten, die im Finanzplan noch fehlen */
export function fehlendePosten(f: FinanceInput, branche: Branche | null | undefined) {
  if (!branche) return { kosten: [], investitionen: [] };
  const costs = f.costs.map((c) => `${c.label} ${c.note}`);
  const invest = f.investments.map((i) => `${i.label} ${i.reason}`);
  return {
    kosten: branche.kosten.filter((k) => !present(k, costs)),
    investitionen: branche.investitionen.filter((k) => !present(k, invest)),
  };
}
