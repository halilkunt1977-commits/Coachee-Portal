import "server-only";
import ExcelJS from "exceljs";
import { MONTHS, canonicalCategory, emptyFinance, type FinanceInput, type Year3 } from "./finance";
import { makeEvaluator } from "./xlsx-formula";

/*
 * Finanzplan aus einer Excel-Datei im Aufbau der Vorlage übernehmen (Blätter Annahmen, Kostenherleitung,
 * Investitionsplan, Personalplan, Umsatzherleitung). Gelesen werden die Werte, nicht die Formeln; die Blätter
 * und Spalten werden an ihren Namen und Kopfzeilen erkannt, nicht an festen Zellen.
 * Rentabilität und Liquidität rechnet das Portal selbst; deren Summen aus der Datei dienen nur zum Abgleich.
 * Daneben wird ein freierer Aufbau erkannt: Umsatz als Euro-Zeilen je Monat („Feb 2027“ …), Preise im Blatt Annahmen.
 * Zeilen, in denen nur 0 steht, werden nicht übernommen.
 */

type Val = string | number | Date | null;
export type FileTotals = { revenue: number[]; totalCosts: number[]; profit: number[]; balance: number[] };
export type XlsxImport = { finance: FinanceInput; warnings: string[]; fileTotals: Partial<FileTotals> };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

type Calc = (c: ExcelJS.Cell) => number | null;

function value(c: ExcelJS.Cell, calc?: Calc): Val {
  const v = c.value as unknown;
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string" || v instanceof Date) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
    if ("result" in o) return o.result == null || typeof o.result === "object" && !(o.result instanceof Date) ? null : (o.result as Val);
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if (calc && c.formula) return calc(c);
  }
  return null;
}
const text = (v: Val) => (v == null ? "" : v instanceof Date ? `${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}` : String(v).trim());
const number = (v: Val) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.replace(/[€%\s]/g, "");
    const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
/** Anteil als Prozentzahl: 0,3 → 30; 30 bleibt 30 */
const percent = (v: Val) => {
  const n = number(v);
  return Math.abs(n) <= 1 ? Math.round(n * 10000) / 100 : n;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

const MONTH_NAMES: Record<string, number> = { jan: 1, feb: 2, mar: 3, mrz: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
/** "Feb 2027", "März 2027", "Jan. 28" → [Jahr, Monat] */
function namedMonth(s: string): [number, number] | null {
  const m = /^([a-z]{3})[a-z]*\.?\s*(\d{4}|\d{2})$/.exec(norm(s));
  const mon = m ? MONTH_NAMES[m[1]] : undefined;
  if (!m || !mon) return null;
  return [m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), mon];
}

/** "02/2027", "2027-02", "Feb 2027", ein Datum oder eine Excel-Seriennummer → [Jahr, Monat] */
function yearMonth(v: Val): [number, number] | null {
  if (v instanceof Date) return [v.getUTCFullYear(), v.getUTCMonth() + 1];
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1];
  }
  const s = text(v);
  let m = /(\d{1,2})\s*[./]\s*(\d{4})/.exec(s);
  if (m) return [Number(m[2]), Number(m[1])];
  m = /(\d{4})-(\d{2})/.exec(s);
  if (m) return [Number(m[1]), Number(m[2])];
  return namedMonth(s);
}

function sheet(wb: ExcelJS.Workbook, ...names: string[]) {
  return wb.worksheets.find((ws) => names.some((n) => norm(ws.name) === norm(n))) ?? wb.worksheets.find((ws) => names.some((n) => norm(ws.name).startsWith(norm(n))));
}

/** Zeilen als Wertelisten (Index 1 = Spalte A) */
function readRows(ws: ExcelJS.Worksheet, calc?: Calc): Val[][] {
  const out: Val[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const r: Val[] = [];
    row.eachCell({ includeEmpty: true }, (c, i) => (r[i] = value(c, calc)));
    out[n] = r;
  });
  for (let i = 0; i < out.length; i++) out[i] ??= [];
  return out;
}

/** Kopfzeile finden, deren erste Spalte einen der Namen trägt; liefert Zeilennummer und Spalten nach Kopftext */
function header(data: Val[][], first: string[], from = 1) {
  for (let i = from; i < data.length; i++) {
    const a = norm(text(data[i]?.[1] ?? null));
    if (first.some((f) => a === norm(f))) {
      const cols = new Map<string, number>();
      data[i].forEach((v, j) => v != null && cols.set(norm(text(v)), j));
      return { row: i, cols };
    }
  }
  return null;
}
const findCol = (cols: Map<string, number>, ...starts: string[]) => {
  for (const s of starts) for (const [k, j] of cols) if (k.startsWith(norm(s))) return j;
  return -1;
};
const at = (r: Val[] | undefined, j: number) => (j > 0 && r ? (r[j] ?? null) : null);
const isEnd = (label: string) => !label || /^(summe|gesamt|monats)/i.test(label);

/**
 * Preis zu einer Umsatzzeile in Euro: ein Preis aus den Annahmen, von dem jeder Monatswert ein ganzes Vielfaches ist.
 * Bei mehreren passenden gewinnt der, dessen Name am meisten Wörter mit der Zeile teilt.
 */
function matchPrice(label: string, euros: number[], prices: { label: string; price: number }[]) {
  const words = norm(label).split(" ");
  const shared = (p: string) => norm(p).split(" ").filter((w) => w.length > 2 && words.some((x) => x.startsWith(w) || w.startsWith(x))).length;
  const fits = prices.filter((p) => euros.every((v) => Math.abs(v / p.price - Math.round(v / p.price)) < 1e-6));
  const best = fits.map((p) => ({ p, s: shared(p.label) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0 ? best.p : null;
}

export async function importFinanceXlsx(buffer: Buffer): Promise<XlsxImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const calc = makeEvaluator(wb);
  const rows = (ws: ExcelJS.Worksheet) => readRows(ws, calc);
  const warnings: string[] = [];
  const f = emptyFinance();
  f.taxPct = 0; // die Vorlage rechnet ohne Steuerrücklage; kann im Portal ergänzt werden

  // ---------- Annahmen ----------
  const annahmen = sheet(wb, "Annahmen");
  let start: [number, number] | null = null;
  /** Preise aus dem Blatt Annahmen, z. B. „Webseite Verkauf (€)“, für Umsatzzeilen in Euro */
  const prices: { label: string; price: number }[] = [];
  if (annahmen) {
    const d = rows(annahmen);
    const h = header(d, ["Annahme"]);
    const noteCol = h ? findCol(h.cols, "Herleitung", "Hinweis") : 5;
    for (const r of d) {
      const label = norm(text(at(r, 1)));
      const note = text(at(r, noteCol)).slice(0, 500);
      const y3 = (fn: (v: Val) => number): Year3 => [fn(at(r, 2)), fn(at(r, 3)), fn(at(r, 4))];
      if (label.startsWith("planungszeitraum") || label.startsWith("beginn") || label.startsWith("planbeginn") || label.startsWith("geschaftsbeginn")) {
        start = yearMonth(at(r, 2));
        f.notes.period = note;
      } else if (label.startsWith("materialquote") || label.startsWith("wareneinsatz")) {
        f.materialPct = y3(percent);
        f.notes.material = note;
      } else if (label.startsWith("anfangsliquiditat") || label.startsWith("anfangsbestand")) {
        f.openingCash = number(at(r, 2));
        f.notes.opening = note;
      } else if (label.includes("private entnahme") || label.includes("privatentnahme")) {
        f.privateDraw = y3(number);
        f.notes.private = note;
      } else if (label.startsWith("steuerrucklage")) {
        f.taxPct = percent(at(r, 2));
        f.notes.tax = note;
      } else if (/€|eur/i.test(text(at(r, 1))) && number(at(r, 2)) > 0) {
        prices.push({ label: text(at(r, 1)).replace(/\s*\(.*$/, "").trim(), price: number(at(r, 2)) });
      }
    }
  } else warnings.push("Das Blatt „Annahmen“ fehlt. Start, Materialquote und Anfangsliquidität bitte im Portal prüfen.");

  // ---------- Umsatzherleitung: Leistungsarten oben, darunter je Jahr ein Block mit Monaten ----------
  const umsatz = sheet(wb, "Umsatzherleitung", "Umsatzplanung", "Umsatz");
  type Rev = FinanceInput["revenues"][number];
  const revenues = new Map<string, Rev>();
  const blocks: { row: number; months: { col: number; ym: [number, number] }[]; priceCol: number }[] = [];
  const euroBlocks: { row: number; months: { col: number; ym: [number, number] }[] }[] = [];
  let data: Val[][] = [];
  if (umsatz) {
    data = rows(umsatz);
    for (let i = 1; i < data.length; i++) {
      if (norm(text(at(data[i], 1))) !== "leistungsart") {
        // freierer Aufbau: eine Kopfzeile mit Monaten (Datum oder „Feb 2027“), darunter Zeilen mit Euro je Monat
        const months = data[i].map((v, col) => ({ col, ym: col > 1 && v != null ? yearMonth(v) : null })).filter((x): x is { col: number; ym: [number, number] } => x.ym !== null);
        if (months.length >= 6) euroBlocks.push({ row: i, months });
        continue;
      }
      const months = data[i].map((v, col) => ({ col, ym: v instanceof Date || (typeof v === "number" && v > 20000) ? yearMonth(v) : null })).filter((x): x is { col: number; ym: [number, number] } => x.ym !== null);
      if (months.length >= 6) {
        const cols = new Map<string, number>();
        data[i].forEach((v, j) => v != null && !(v instanceof Date) && cols.set(norm(text(v)), j));
        blocks.push({ row: i, months, priceCol: findCol(cols, "o preis", "preis", "netto") });
      } else {
        // Liste der Leistungsarten mit Beschreibung, Preis und Hinweis
        const cols = new Map<string, number>();
        data[i].forEach((v, j) => v != null && cols.set(norm(text(v)), j));
        const [desc, price, note] = [findCol(cols, "typisch", "beschreibung", "leistungsumfang"), findCol(cols, "o netto", "o preis", "preis", "netto"), findCol(cols, "herleitung", "hinweis")];
        for (let k = i + 1; k < data.length; k++) {
          const label = text(at(data[k], 1));
          if (isEnd(label) || norm(label) === "leistungsart") break;
          revenues.set(norm(label), { label: label.slice(0, 120), description: text(at(data[k], desc)).slice(0, 500), price: round2(number(at(data[k], price))), note: text(at(data[k], note)).slice(0, 300), qty: Array(MONTHS).fill(0) });
        }
      }
    }
    if (!start && blocks[0]) start = blocks[0].months[0].ym;
    if (!start && !blocks.length && euroBlocks[0]) start = euroBlocks[0].months[0].ym;
  } else warnings.push("Das Blatt „Umsatzherleitung“ fehlt, es wurden keine Umsätze übernommen.");

  if (!start) {
    const renta = sheet(wb, "Rentabilitätsvorschau");
    const v = renta ? rows(renta).flat().find((x) => x instanceof Date) ?? null : null;
    start = v ? yearMonth(v) : null;
  }
  if (start) f.start = `${start[0]}-${String(start[1]).padStart(2, "0")}`;
  else warnings.push("Der erste Planmonat war nicht zu erkennen; bitte im Portal unter Annahmen eintragen.");
  const [sy, sm] = f.start.split("-").map(Number);
  const monthIndex = (ym: [number, number]) => (ym[0] - sy) * 12 + (ym[1] - sm);

  for (const b of blocks) {
    for (let k = b.row + 1; k < data.length; k++) {
      const label = text(at(data[k], 1));
      if (isEnd(label) || norm(label) === "leistungsart") break;
      let rev = revenues.get(norm(label));
      if (!rev) {
        rev = { label: label.slice(0, 120), description: "", price: round2(number(at(data[k], b.priceCol))), note: "", qty: Array(MONTHS).fill(0) };
        revenues.set(norm(label), rev);
      }
      if (!rev.price) rev.price = round2(number(at(data[k], b.priceCol)));
      for (const m of b.months) {
        const i = monthIndex(m.ym);
        if (i >= 0 && i < MONTHS) rev.qty[i] = number(at(data[k], m.col));
      }
    }
  }
  if (!blocks.length) {
    for (const [n, b] of euroBlocks.entries()) {
      const end = euroBlocks[n + 1]?.row ?? data.length;
      for (let k = b.row + 1; k < end; k++) {
        const label = text(at(data[k], 1));
        const l = norm(label);
        if (!/erlos|umsatz/.test(l) || /gesamt|summe|total/.test(l)) continue;
        const euros = Array<number>(MONTHS).fill(0);
        for (const m of b.months) {
          const i = monthIndex(m.ym);
          if (i >= 0 && i < MONTHS) euros[i] = number(at(data[k], m.col));
        }
        if (!euros.some((v) => v)) continue;
        const p = matchPrice(label, euros, prices);
        const name = p ? p.label : label;
        revenues.set(norm(name), {
          label: name.slice(0, 120),
          description: "",
          price: p ? p.price : 1,
          note: p ? `Aus der Zeile „${label}“; Menge = Umsatz ÷ Preis.`.slice(0, 300) : `Aus der Zeile „${label}“ in Euro (Preis 1 €, Menge = Umsatz).`.slice(0, 300),
          qty: euros.map((v) => (p ? Math.round((v / p.price) * 1000) / 1000 : round2(v))),
        });
      }
    }
  }
  f.revenues = [...revenues.values()];
  if (umsatz && !f.revenues.length) warnings.push("In der Umsatzherleitung wurden keine Monatsmengen oder Umsätze gefunden.");

  // ---------- Kostenherleitung ----------
  const kosten = sheet(wb, "Kostenherleitung", "Kosten");
  let zeroCosts = 0;
  if (kosten) {
    const d = rows(kosten);
    const h = header(d, ["Kostenart", "Kosten", "Position"]);
    if (h) {
      const [y1, y2, y3, cat, note] = [findCol(h.cols, "jahr 1"), findCol(h.cols, "jahr 2"), findCol(h.cols, "jahr 3"), findCol(h.cols, "zuordnung", "kategorie"), findCol(h.cols, "herleitung", "hinweis", "begrundung")];
      for (let k = h.row + 1; k < d.length; k++) {
        const label = text(at(d[k], 1));
        if (!label) continue;
        if (isEnd(label)) break;
        const monthly: Year3 = [round2(number(at(d[k], y1))), round2(number(at(d[k], y2 > 0 ? y2 : y1))), round2(number(at(d[k], y3 > 0 ? y3 : y1)))];
        if (!monthly.some((v) => v)) {
          zeroCosts++;
          continue;
        }
        f.costs.push({ label: label.slice(0, 120), monthly, category: canonicalCategory(text(at(d[k], cat))), note: text(at(d[k], note)).slice(0, 300), from: 0 });
      }
      if (zeroCosts) warnings.push(`${zeroCosts} Kostenarten stehen in der Datei mit 0 € und wurden nicht übernommen.`);
    } else warnings.push("In der Kostenherleitung fehlt die Kopfzeile „Kostenart“.");
  } else warnings.push("Das Blatt „Kostenherleitung“ fehlt, es wurden keine laufenden Kosten übernommen.");

  // ---------- Investitionsplan ----------
  const inv = sheet(wb, "Investitionsplan", "Investitionen");
  if (inv) {
    const d = rows(inv);
    const h = header(d, ["Investition", "Anschaffung", "Position"]);
    if (h) {
      const [amount, life, pay, reason, note] = [findCol(h.cols, "betrag"), findCol(h.cols, "nutzungsdauer"), findCol(h.cols, "zahlung", "monat"), findCol(h.cols, "begrundung"), findCol(h.cols, "hinweis")];
      const years = norm([...h.cols.keys()].find((k) => k.startsWith("nutzungsdauer")) ?? "").includes("jahr");
      // ohne Spalte „Betrag“: Beträge je Planjahr („Jahr 1 (€)“ …), angesetzt im ersten Monat des Jahres
      const yearCols = amount > 0 ? [] : [findCol(h.cols, "jahr 1"), findCol(h.cols, "jahr 2"), findCol(h.cols, "jahr 3")];
      for (let k = h.row + 1; k < d.length; k++) {
        const label = text(at(d[k], 1));
        if (!label) continue;
        if (isEnd(label)) break;
        if (yearCols.length) {
          yearCols.forEach((col, y) => {
            const a = round2(number(at(d[k], col)));
            if (col > 0 && a) f.investments.push({ label: `${label}${yearCols.filter((c) => c > 0 && number(at(d[k], c))).length > 1 ? ` (Jahr ${y + 1})` : ""}`.slice(0, 120), amount: a, life: Math.max(0, Math.round(number(at(d[k], life)) * (years ? 12 : 1))), month: y * 12, reason: text(at(d[k], reason)).slice(0, 300), note: text(at(d[k], note)).slice(0, 300) });
          });
          continue;
        }
        if (!number(at(d[k], amount))) continue;
        const ym = yearMonth(at(d[k], pay));
        const lifeV = Math.round(number(at(d[k], life)) * (years ? 12 : 1));
        f.investments.push({ label: label.slice(0, 120), amount: round2(number(at(d[k], amount))), life: Math.max(0, lifeV), month: ym ? Math.min(MONTHS - 1, Math.max(0, monthIndex(ym))) : 0, reason: text(at(d[k], reason)).slice(0, 300), note: text(at(d[k], note)).slice(0, 300) });
      }
    }
  }

  // ---------- Personalplan ----------
  const pers = sheet(wb, "Personalplan", "Personal");
  if (pers) {
    const d = rows(pers);
    const h = header(d, ["Position", "Mitarbeiter", "Name"]);
    if (h) {
      const [startCol, gross, sur, note] = [findCol(h.cols, "start", "ab"), findCol(h.cols, "brutto"), findCol(h.cols, "ag nebenkosten", "ag anteil", "nebenkosten", "zuschlag"), findCol(h.cols, "herleitung", "hinweis")];
      for (let k = h.row + 1; k < d.length; k++) {
        const label = text(at(d[k], 1));
        if (!label) continue;
        if (isEnd(label)) break;
        if (!number(at(d[k], gross))) continue;
        const ym = yearMonth(at(d[k], startCol));
        f.staff.push({ label: label.slice(0, 120), start: ym ? Math.min(MONTHS - 1, Math.max(0, monthIndex(ym))) : 0, gross: round2(number(at(d[k], gross))), surcharge: percent(at(d[k], sur)), note: text(at(d[k], note)).slice(0, 300) });
      }
    }
  }

  // ---------- Summen der Datei zum Abgleich ----------
  const fileTotals: Partial<FileTotals> = {};
  const over = sheet(wb, "Rentabilität Übersicht", "Rentabilitat Ubersicht");
  if (over) {
    for (const r of rows(over)) {
      const label = norm(text(at(r, 1)));
      const y = [2, 3, 4].map((j) => number(at(r, j)));
      if (label === "umsatz" || label === "gesamtumsatz" || label === "umsatzerlose netto") fileTotals.revenue = y;
      else if (label === "gesamtkosten") fileTotals.totalCosts = y;
      else if (label.startsWith("ergebnis vor steuern")) fileTotals.profit = y;
    }
  }
  const liq = sheet(wb, "Liquiditätsplanung", "Liquiditatsplanung", "Liquidität");
  if (liq) {
    const balances = rows(liq)
      .filter((r) => norm(text(at(r, 1))).startsWith("kontostand"))
      .map((r) => {
        const nums = r.slice(2).filter((v): v is number => typeof v === "number");
        return nums[nums.length - 1] ?? 0;
      });
    if (balances.length) fileTotals.balance = balances.slice(0, 3);
    // Die Vorlage zählte im dritten Jahr den Umsatz zusätzlich als „Sonstige Einzahlungen“; das Portal rechnet ihn einmal
    if (rows(liq).some((r) => norm(text(at(r, 1))).startsWith("sonstige einzahlungen") && r.slice(2).some((v) => typeof v === "number" && v > 0)) && f.revenues.length)
      warnings.push("In der Liquiditätsplanung der Datei stehen „Sonstige Einzahlungen“. Falls dort der Umsatz ein zweites Mal gezählt war, ist der Kontostand im Portal entsprechend niedriger.");
  }
  if (f.investments.some((i) => i.life === 0 && i.amount > 0))
    warnings.push("Anschaffungen ohne Nutzungsdauer zählt das Portal im Zahlungsmonat als Aufwand (Rentabilität). Das kann das Ergebnis gegenüber der Datei verändern.");
  return { finance: f, warnings, fileTotals };
}
