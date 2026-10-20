import "server-only";
import ExcelJS from "exceljs";
import { MONTHS, calculate, hasLiving, investmentDepreciation, monthLabel, staffCost, yearRange, type FinanceInput } from "./finance";

/*
 * Finanzplan als Excel-Datei mit denselben acht Arbeitsblättern wie Halils Vorlage. Eingaben stehen als Werte in
 * Annahmen, Kostenherleitung, Investitionsplan, Personalplan und Umsatzherleitung; Rentabilität und Liquidität
 * sind Formeln darauf, damit Fachstelle, Bank oder Steuerbüro nachrechnen und weiterarbeiten können.
 * Anders als in der Vorlage wird der Umsatz in der Liquidität nur einmal gezählt.
 * Zinsen und Tilgung von Darlehen sowie Zuschüsse rechnet das Portal und trägt sie als Werte ein.
 */
const EUR = '#,##0\\ [$€-407];[Red]\\(#,##0\\ [$€-407]\\);\\-';
const EUR_OPEN = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-';
const QTY = "0;[Red]\\(0\\);\\-";
const QTY2 = "#,##0.0#;[Red]\\(#,##0.0#\\);\\-";
const PCT = "0.0%";
const NAVY = "FF1F4E78";
const LIGHT = "FFD9EAF7";
const GREEN = "FFE2F0D9";
const GREY = "FFE7E6E6";
const NOTE = "FFEEF5FA";

const col = (n: number) => {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const monthDate = (start: string, i: number) => {
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + i, 1));
};
const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Opts = { results?: boolean };

export async function financeWorkbook(f: FinanceInput, meta: { name: string; title: string }, opts: Opts = {}) {
  const r = calculate(f);
  const withResults = opts.results !== false;
  // Formel mit dem Ergebnis des Portals als zwischengespeichertem Wert (Excel rechnet beim Öffnen ohnehin neu)
  const F = (formula: string, result: number | string) => (withResults ? { formula, result: typeof result === "number" ? round(result) : result } : { formula });

  const wb = new ExcelJS.Workbook();
  wb.creator = "gründarium Portal";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const title = (ws: ExcelJS.Worksheet, text: string, lastCol: number, size = 14) => {
    ws.mergeCells(1, 1, 1, lastCol);
    const c = ws.getCell("A1");
    c.value = text;
    c.font = { bold: true, size, color: { argb: "FFFFFFFF" } };
    c.fill = fill(NAVY);
    c.alignment = { vertical: "middle" };
    ws.getRow(1).height = 26;
  };
  const head = (ws: ExcelJS.Worksheet, row: number, values: (string | Date)[], argb = NAVY, white = true) => {
    const r = ws.getRow(row);
    values.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v;
      c.font = { bold: true, color: { argb: white ? "FFFFFFFF" : "FF000000" } };
      c.fill = fill(argb);
      c.alignment = { vertical: "middle", wrapText: true };
      if (v instanceof Date) {
        c.numFmt = "mmm yyyy";
        c.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
  };
  const band = (ws: ExcelJS.Worksheet, row: number, last: number, argb: string) => {
    for (let i = 1; i <= last; i++) {
      const c = ws.getRow(row).getCell(i);
      c.fill = fill(argb);
      c.font = { ...(c.font ?? {}), bold: true };
    }
  };
  const fmt = (ws: ExcelJS.Worksheet, row: number, from: number, to: number, numFmt: string) => {
    for (let i = from; i <= to; i++) ws.getRow(row).getCell(i).numFmt = numFmt;
  };
  const wrap = (ws: ExcelJS.Worksheet, ...cols: number[]) => cols.forEach((c) => (ws.getColumn(c).alignment = { wrapText: true, vertical: "top" }));
  const yearCol = (y: number) => col(2 + y); // B, C, D in Annahmen und Kostenherleitung

  // Blätter in der Reihenfolge der Vorlage anlegen; gefüllt werden sie in der Reihenfolge, in der Formeln Zeilen brauchen
  const grid = { showGridLines: false };
  const an = wb.addWorksheet("Annahmen", { views: [grid] });
  const ko = wb.addWorksheet("Kostenherleitung", { views: [grid] });
  const iv = wb.addWorksheet("Investitionsplan", { views: [grid] });
  const pe = wb.addWorksheet("Personalplan", { views: [grid] });
  const re = wb.addWorksheet("Rentabilitätsvorschau", { views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }] });
  const ov = wb.addWorksheet("Rentabilität Übersicht", { views: [grid] });
  const li = wb.addWorksheet("Liquiditätsplanung", { views: [{ state: "frozen", xSplit: 1, showGridLines: false }] });
  const um = wb.addWorksheet("Umsatzherleitung", { views: [grid] });

  // ---------- Annahmen ----------
    an.columns = [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 62 }];
  title(an, `Finanzplanung ${meta.name} – Annahmen`, 5);
  head(an, 3, ["Annahme", "Jahr 1", "Jahr 2", "Jahr 3", "Herleitung / Hinweis"]);
  const [sy, sm] = f.start.split("-").map(Number);
  const A = { period: 4, material: 5, opening: 6, private: 7, tax: 8, reserve: 9, revenue: 10, profit: 11 };
  an.getRow(A.period).values = ["Planungszeitraum", ...[0, 1, 2].map((y) => yearRange(f.start, y)), f.notes.period || `Geschäftsjahre jeweils 12 Monate ab Gründungsstart 01.${String(sm).padStart(2, "0")}.${sy}`];
  an.getRow(A.material).values = ["Materialquote", ...f.materialPct.map((p) => p / 100), f.notes.material || "Material- und Wareneinsatz in % vom Netto-Umsatz"];
  fmt(an, A.material, 2, 4, PCT);
  an.getRow(A.opening).values = ["Anfangsliquidität", f.openingCash, null, null, f.notes.opening || "Kontostand bzw. Eigenmittel zum Start"];
  an.getRow(A.private).values = ["Private Entnahmen €/Monat", ...f.privateDraw, f.notes.private || "Entnahmen für den Lebensunterhalt je Monat"];
  an.getRow(A.tax).values = ["Steuerrücklage", f.taxPct / 100, null, null, f.notes.tax || "Vereinfacht in % vom positiven Ergebnis vor Steuern"];
  an.getCell(`B${A.tax}`).numFmt = PCT;
  an.getRow(A.reserve).values = ["Liquiditätsreserve", f.reserve, null, null, f.notes.reserve || "Teil des Kapitalbedarfs, keine Zahlung"];
  fmt(an, A.opening, 2, 4, EUR);
  fmt(an, A.private, 2, 4, EUR);
  fmt(an, A.reserve, 2, 4, EUR);
  wrap(an, 5);

  // ---------- Kostenherleitung ----------
    ko.columns = [{ width: 34 }, { width: 17 }, { width: 17 }, { width: 17 }, { width: 28 }, { width: 58 }, { width: 12 }];
  title(ko, "Monatliche Betriebskosten – Herleitung", 7);
  head(ko, 3, ["Kostenart", "Jahr 1 €/Monat", "Jahr 2 €/Monat", "Jahr 3 €/Monat", "Zuordnung", "Herleitung", "ab Monat Nr."]);
  const K0 = 4;
  f.costs.forEach((c, i) => {
    ko.getRow(K0 + i).values = [c.label, ...c.monthly, c.category || "Betriebskosten", c.note, c.from + 1];
    fmt(ko, K0 + i, 2, 4, EUR);
  });
  const K1 = Math.max(K0, K0 + f.costs.length - 1); // letzte Kostenzeile (mindestens eine leere, damit die Formeln gültig bleiben)
  const kSum = K1 + 2;
  ko.getRow(kSum).values = ["SUMME laufende Kosten", ...[0, 1, 2].map((y) => F(`SUM(${yearCol(y)}${K0}:${yearCol(y)}${K1})`, f.costs.reduce((a, c) => a + c.monthly[y], 0)))];
  fmt(ko, kSum, 2, 4, EUR);
  band(ko, kSum, 7, GREEN);
  ko.getCell(`A${kSum + 2}`).value = `Monat Nr. 1 = ${monthLabel(f.start, 0)}. Die Zuordnung bestimmt die Zeile in der Rentabilitätsvorschau.`;
  ko.getCell(`A${kSum + 2}`).font = { italic: true, color: { argb: "FF595959" } };
  wrap(ko, 6);

  // ---------- Investitionsplan ----------
    iv.columns = [{ width: 34 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 48 }, { width: 40 }, { width: 12 }];
  title(iv, "Investitions- und Abschreibungsplan", 8);
  head(iv, 3, ["Investition", "Betrag €", "Nutzungsdauer Monate", "Abschreibung €/Monat", "Zahlung", "Begründung", "Hinweis", "Monat Nr."]);
  const I0 = 4;
  f.investments.forEach((x, i) => {
    const n = I0 + i;
    iv.getRow(n).values = [x.label, x.amount, x.life, F(`IF(C${n}>0,B${n}/C${n},0)`, investmentDepreciation(x)), monthLabel(f.start, x.month), x.reason, x.note || (x.life ? "" : "Sofort als Aufwand (geringwertig bzw. Startaufwand)"), x.month + 1];
    fmt(iv, n, 2, 2, EUR);
    fmt(iv, n, 4, 4, EUR);
  });
  const I1 = Math.max(I0, I0 + f.investments.length - 1);
  const iSum = I1 + 2;
  iv.getRow(iSum).values = ["Gesamtinvestition", F(`SUM(B${I0}:B${I1})`, r.capitalNeed.investments), null, F(`SUM(D${I0}:D${I1})`, f.investments.reduce((a, x) => a + investmentDepreciation(x), 0))];
  fmt(iv, iSum, 2, 4, EUR);
  band(iv, iSum, 8, GREEN);
  wrap(iv, 6, 7);

  // ---------- Personalplan ----------
    pe.columns = [{ width: 28 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 58 }, { width: 12 }];
  title(pe, "Personalplanung", 7);
  head(pe, 3, ["Position", "Start", "Brutto €/Monat", "AG-Nebenkosten", "AG-Gesamtkosten €/Monat", "Herleitung", "Monat Nr."]);
  const P0 = 4;
  f.staff.forEach((s, i) => {
    const n = P0 + i;
    pe.getRow(n).values = [s.label, monthLabel(f.start, s.start), s.gross, s.surcharge / 100, F(`C${n}*(1+D${n})`, staffCost(s)), s.note, s.start + 1];
    fmt(pe, n, 3, 3, EUR);
    fmt(pe, n, 4, 4, PCT);
    fmt(pe, n, 5, 5, EUR);
  });
  const P1 = Math.max(P0, P0 + f.staff.length - 1);
  wrap(pe, 6);

  // ---------- Umsatzherleitung ----------
    um.columns = [{ width: 46.8 }, { width: 58.9 }, { width: 10 }, { width: 48 }, ...Array.from({ length: 10 }, () => ({ width: 10 })), { width: 15 }, { width: 15 }];
  title(um, `Umsatzherleitung – ${meta.name}${meta.title ? ` ${meta.title}` : ""}`, 16, 16);
  um.mergeCells(2, 1, 2, 16);
  um.getCell("A2").value = "Planwerte netto. Die Preise sind durchschnittliche Kalkulationswerte je Leistungsart; die Mengen je Monat ergeben den Umsatz.";
  um.getCell("A2").fill = fill(NOTE);
  um.getCell("A2").font = { color: { argb: "FF404040" } };
  um.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  um.getRow(2).height = 34;
  head(um, 4, ["Leistungsart", "Typischer Leistungsumfang", "Ø Netto-Auftragswert", "Herleitung / Hinweis"]);
  const U0 = 5;
  const n = Math.max(1, f.revenues.length);
  f.revenues.forEach((x, i) => {
    um.getRow(U0 + i).values = [x.label, x.description, x.price, x.note];
    um.getCell(`C${U0 + i}`).numFmt = EUR;
    um.getRow(U0 + i).alignment = { wrapText: true, vertical: "top" };
  });
  const fractional = f.revenues.some((x) => x.qty.some((q) => q % 1 !== 0));
  const blockTitle = U0 + n + 2; // Jahr 1 beginnt zwei Zeilen unter der Liste
  const stride = n + 5; // Titel, Kopf, n Zeilen, Summe, zwei Leerzeilen
  const umSum: number[] = []; // Zeile „Monats-/Jahresumsatz“ je Jahr
  for (let y = 0; y < 3; y++) {
    const t = blockTitle + y * stride;
    um.mergeCells(t, 1, t, 16);
    um.getCell(`A${t}`).value = `Jahr ${y + 1} – ${monthLabel(f.start, y * 12)} bis ${monthLabel(f.start, y * 12 + 11)}`;
    um.getCell(`A${t}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    um.getCell(`A${t}`).fill = fill(NAVY);
    head(um, t + 1, ["Leistungsart", "Ø Preis netto", ...Array.from({ length: 12 }, (_, k) => monthDate(f.start, y * 12 + k)), "Menge gesamt", "Umsatz gesamt"], LIGHT, false);
    for (let k = 0; k < 12; k++) um.getRow(t + 1).getCell(3 + k).numFmt = "mmm-yy";
    const first = t + 2;
    const last = first + n - 1;
    for (let i = 0; i < n; i++) {
      const row = first + i;
      const x = f.revenues[i];
      const qty = x ? x.qty.slice(y * 12, y * 12 + 12) : Array(12).fill(0);
      const total = qty.reduce((a, q) => a + q, 0);
      um.getRow(row).values = [x ? F(`$A$${U0 + i}`, x.label) : "", x ? F(`$C$${U0 + i}`, x.price) : 0, ...qty, F(`SUM(C${row}:N${row})`, total), F(`B${row}*O${row}`, (x?.price ?? 0) * total)];
      um.getCell(`B${row}`).numFmt = EUR;
      fmt(um, row, 3, 15, fractional ? QTY2 : QTY);
      um.getCell(`P${row}`).numFmt = EUR;
    }
    const s = last + 1;
    um.getRow(s).values = [
      "Monats-/Jahresumsatz",
      null,
      ...Array.from({ length: 12 }, (_, k) => F(`SUMPRODUCT($B$${first}:$B$${last},${col(3 + k)}${first}:${col(3 + k)}${last})`, r.months[y * 12 + k].revenue)),
      F(`SUM(O${first}:O${last})`, f.revenues.reduce((a, x) => a + x.qty.slice(y * 12, y * 12 + 12).reduce((b, q) => b + q, 0), 0)),
      F(`SUM(P${first}:P${last})`, r.years[y].revenue),
    ];
    fmt(um, s, 3, 14, EUR);
    um.getCell(`O${s}`).numFmt = fractional ? QTY2 : QTY;
    um.getCell(`P${s}`).numFmt = EUR;
    band(um, s, 16, GREEN);
    umSum.push(s);
  }
  // Umsatz und Ergebnis je Jahr zusätzlich in den Annahmen, wie in der Vorlage
  an.getRow(A.revenue).values = ["Umsatz Jahr gesamt", ...[0, 1, 2].map((y) => F(`Umsatzherleitung!P${umSum[y]}`, r.years[y].revenue)), "Wird vollständig aus dem Tabellenblatt „Umsatzherleitung“ berechnet"];
  fmt(an, A.revenue, 2, 4, EUR);

  // ---------- Rentabilitätsvorschau ----------
    re.columns = [{ width: 34 }, ...Array.from({ length: MONTHS }, () => ({ width: 12 }))];
  title(re, "Rentabilitätsvorschau – 36 Monate", MONTHS + 1);
  head(re, 2, ["Position", ...Array.from({ length: MONTHS }, (_, m) => monthDate(f.start, m))], LIGHT, false);
  const mc = (m: number) => col(m + 2); // Spalte des Monats m (0 = B)
  const umCol = (m: number) => col(3 + (m % 12)); // Monatsspalte in der Umsatzherleitung (C bis N)
  const R: Record<string, number> = {};
  let row = 3;
  const rRow = (key: string, label: string, formula: (m: number) => string, value: (m: number) => number, tone?: string, gap = false) => {
    R[key] = row;
    re.getCell(`A${row}`).value = label;
    for (let m = 0; m < MONTHS; m++) {
      const c = re.getCell(`${mc(m)}${row}`);
      c.value = F(formula(m), value(m));
      c.numFmt = EUR;
    }
    if (tone) band(re, row, MONTHS + 1, tone);
    row += gap ? 2 : 1;
  };
  const M = r.months;
  rRow("revenue", "Umsatz", (m) => `Umsatzherleitung!${umCol(m)}${umSum[Math.floor(m / 12)]}`, (m) => M[m].revenue, undefined, true);
  rRow("total", "Gesamtleistung", (m) => `${mc(m)}${R.revenue}`, (m) => M[m].revenue, GREY, true);
  rRow("material", "Material-/Wareneinsatz", (m) => `${mc(m)}${R.revenue}*Annahmen!$${yearCol(Math.floor(m / 12))}$${A.material}`, (m) => M[m].material, undefined, true);
  rRow("gross", "Rohertrag", (m) => `${mc(m)}${R.total}-${mc(m)}${R.material}`, (m) => M[m].grossProfit, GREEN);
  const costFirst = row;
  rRow("personnel", "Personalkosten", (m) => `SUMIFS(Personalplan!$E$${P0}:$E$${P1},Personalplan!$G$${P0}:$G$${P1},"<="&${m + 1})`, (m) => M[m].personnel);
  const catRows: number[] = [];
  r.categories.forEach((cat, i) => {
    catRows.push(row);
    rRow(`cat${i}`, cat, (m) => {
      const y = yearCol(Math.floor(m / 12));
      return `SUMIFS(Kostenherleitung!$${y}$${K0}:$${y}$${K1},Kostenherleitung!$E$${K0}:$E$${K1},$A${row},Kostenherleitung!$G$${K0}:$G$${K1},"<="&${m + 1})`;
    }, (m) => M[m].byCategory[i]);
  });
  rRow(
    "depreciation",
    f.investments.some((i) => i.life === 0) ? "Abschreibungen und Sofortaufwand" : "Abschreibungen",
    (m) => `SUMPRODUCT((Investitionsplan!$H$${I0}:$H$${I1}<=${m + 1})*(Investitionsplan!$H$${I0}:$H$${I1}+Investitionsplan!$C$${I0}:$C$${I1}>${m + 1})*Investitionsplan!$D$${I0}:$D$${I1})+SUMIFS(Investitionsplan!$B$${I0}:$B$${I1},Investitionsplan!$C$${I0}:$C$${I1},0,Investitionsplan!$H$${I0}:$H$${I1},${m + 1})`,
    (m) => M[m].depreciation,
    undefined,
    true,
  );
  const costLast = row - 2;
  rRow("costs", "Gesamtkosten", (m) => `SUM(${mc(m)}${costFirst}:${mc(m)}${costLast})`, (m) => M[m].totalCosts, GREY, true);
  rRow("ebit", "Betriebsergebnis", (m) => `${mc(m)}${R.gross}-${mc(m)}${R.costs}`, (m) => M[m].ebit, GREEN, true);
  R.interest = row;
  re.getCell(`A${row}`).value = "Zinsaufwand";
  for (let m = 0; m < MONTHS; m++) {
    re.getCell(`${mc(m)}${row}`).value = round(M[m].interest);
    re.getCell(`${mc(m)}${row}`).numFmt = EUR;
  }
  row += 2;
  rRow("profit", "Ergebnis vor Steuern", (m) => `${mc(m)}${R.ebit}-${mc(m)}${R.interest}`, (m) => M[m].profit, GREEN);

  // ---------- Rentabilität Übersicht ----------
    ov.columns = [{ width: 40 }, { width: 20 }, { width: 20 }, { width: 20 }];
  title(ov, "Rentabilität – Jahresübersicht", 4);
  head(ov, 3, ["Position", "Jahr 1", "Jahr 2", "Jahr 3"]);
  const range = (y: number, r0: number) => `Rentabilitätsvorschau!${mc(y * 12)}${r0}:${mc(y * 12 + 11)}${r0}`;
  const Y = r.years;
  const ovRows: [string, (y: number) => string, (y: number) => number, boolean?][] = [
    ["Umsatz", (y) => `SUM(${range(y, R.revenue)})`, (y) => Y[y].revenue],
    ["Material-/Wareneinsatz", (y) => `SUM(${range(y, R.material)})`, (y) => Y[y].material],
    ["Rohertrag", (y) => `SUM(${range(y, R.gross)})`, (y) => Y[y].grossProfit, true],
    ["Personalkosten", (y) => `SUM(${range(y, R.personnel)})`, (y) => Y[y].personnel],
    ["Gesamtkosten", (y) => `SUM(${range(y, R.costs)})`, (y) => Y[y].totalCosts],
    ["Ergebnis vor Steuern", (y) => `SUM(${range(y, R.profit)})`, (y) => Y[y].profit, true],
  ];
  const O: Record<string, number> = {};
  if (hasLiving(f)) {
    ovRows.push(
      ["Steuerrücklage", (y) => `SUMPRODUCT((${range(y, R.profit)}>0)*${range(y, R.profit)})*Annahmen!$B$${A.tax}`, (y) => Y[y].tax],
      ["Private Entnahmen", (y) => `Annahmen!${yearCol(y)}${A.private}*12`, (y) => Y[y].privateDraw],
    );
  }
  ovRows.forEach(([label, formula, value, strong], i) => {
    const n = 4 + i;
    O[label] = n;
    ov.getRow(n).values = [label, ...[0, 1, 2].map((y) => F(formula(y), value(y)))];
    fmt(ov, n, 2, 4, EUR);
    if (strong) band(ov, n, 4, GREEN);
  });
  if (hasLiving(f)) {
    const g = 4 + ovRows.length;
    ov.getRow(g).values = ["Zuschüsse zum Lebensunterhalt", ...Y.map((y) => round(y.grants))];
    fmt(ov, g, 2, 4, EUR);
    ov.getRow(g + 1).values = ["Überschuss nach Steuern und Entnahmen", ...[0, 1, 2].map((y) => F(`${yearCol(y)}${O["Ergebnis vor Steuern"]}-${yearCol(y)}${O.Steuerrücklage}-${yearCol(y)}${O["Private Entnahmen"]}+${yearCol(y)}${g}`, Y[y].profit - Y[y].tax - Y[y].privateDraw + Y[y].grants))];
    fmt(ov, g + 1, 2, 4, EUR);
    band(ov, g + 1, 4, GREEN);
  }
  an.getRow(A.profit).values = ["Ergebnis vor Steuern", ...[0, 1, 2].map((y) => F(`'Rentabilität Übersicht'!${yearCol(y)}${O["Ergebnis vor Steuern"]}`, Y[y].profit)), "Aus dem Tabellenblatt „Rentabilität Übersicht“"];
  fmt(an, A.profit, 2, 4, EUR);

  // ---------- Liquiditätsplanung: drei Jahresblöcke, Übertrag des Kontostands ----------
    li.columns = [{ width: 40 }, ...Array.from({ length: 12 }, () => ({ width: 13 }))];
  title(li, "Liquiditätsplanung – 36 Monate", 13);
  const loans = f.financing.some((x) => x.kind === "darlehen");
  let start = 3;
  let prevBalance = "";
  for (let y = 0; y < 3; y++) {
    const ms = Array.from({ length: 12 }, (_, k) => y * 12 + k);
    const lc = (k: number) => col(k + 2); // B bis M
    const rc = (k: number) => mc(y * 12 + k); // Spalte in der Rentabilitätsvorschau
    li.getCell(`A${start}`).value = `Jahr ${y + 1}`;
    li.getCell(`A${start}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    li.getCell(`A${start}`).fill = fill(NAVY);
    const open = start + 1;
    li.getCell(`A${open}`).value = "Anfangsbestand Liquidität";
    li.getCell(`B${open}`).value = F(y === 0 ? `Annahmen!B${A.opening}` : prevBalance, M[y * 12].opening);
    li.getCell(`B${open}`).numFmt = EUR_OPEN;
    head(li, open + 1, ["Monat", ...ms.map((m) => monthDate(f.start, m))], LIGHT, false);
    let n = open + 3;
    const L: Record<string, number> = {};
    const lRow = (key: string, label: string, formula: ((k: number) => string) | null, value: (m: number) => number, tone?: string) => {
      L[key] = n;
      li.getCell(`A${n}`).value = label;
      ms.forEach((m, k) => {
        const c = li.getCell(`${lc(k)}${n}`);
        c.value = formula ? F(formula(k), value(m)) : round(value(m));
        c.numFmt = EUR;
      });
      if (tone) band(li, n, 13, tone);
      n++;
    };
    li.getCell(`A${n++}`).value = "Einzahlungen";
    li.getCell(`A${n - 1}`).font = { bold: true };
    lRow("revenue", "Umsatz", (k) => `Rentabilitätsvorschau!${rc(k)}${R.revenue}`, (m) => M[m].revenue);
    lRow("other", "Sonstige Einzahlungen (Eigenkapital, Darlehen, Zuschüsse)", null, (m) => M[m].inflowFinancing + M[m].grants);
    lRow("inflow", "Summe Einzahlungen", (k) => `SUM(${lc(k)}${L.revenue}:${lc(k)}${L.other})`, (m) => M[m].inflow, GREY);
    n++;
    li.getCell(`A${n++}`).value = "Auszahlungen";
    li.getCell(`A${n - 1}`).font = { bold: true };
    const outFirst = n;
    lRow("material", "Material-/Wareneinsatz", (k) => `Rentabilitätsvorschau!${rc(k)}${R.material}`, (m) => M[m].material);
    lRow("personnel", "Personalkosten", (k) => `Rentabilitätsvorschau!${rc(k)}${R.personnel}`, (m) => M[m].personnel);
    lRow("operating", "Laufende Betriebskosten", (k) => (catRows.length ? `SUM(Rentabilitätsvorschau!${rc(k)}${catRows[0]}:${rc(k)}${catRows[catRows.length - 1]})` : "0"), (m) => M[m].operating);
    lRow("invest", "Investitionen", (k) => `SUMIFS(Investitionsplan!$B$${I0}:$B$${I1},Investitionsplan!$H$${I0}:$H$${I1},${y * 12 + k + 1})`, (m) => M[m].investPaid);
    if (loans) {
      lRow("interest", "Zinsen", (k) => `Rentabilitätsvorschau!${rc(k)}${R.interest}`, (m) => M[m].interest);
      lRow("repayment", "Tilgung", null, (m) => M[m].repayment);
    }
    if (f.taxPct > 0) lRow("tax", "Steuerrücklage", (k) => `MAX(0,Rentabilitätsvorschau!${rc(k)}${R.profit})*Annahmen!$B$${A.tax}`, (m) => M[m].tax);
    lRow("private", "Private Entnahmen", () => `Annahmen!$${yearCol(y)}$${A.private}`, (m) => M[m].privateDraw);
    const outLast = n - 1;
    lRow("outflow", "Summe Auszahlungen", (k) => `SUM(${lc(k)}${outFirst}:${lc(k)}${outLast})`, (m) => M[m].outflow, GREY);
    n++;
    lRow("cashflow", "Monatlicher Saldo", (k) => `${lc(k)}${L.inflow}-${lc(k)}${L.outflow}`, (m) => M[m].cashflow, GREEN);
    n++;
    lRow("balance", "Kontostand Monatsende", (k) => (k === 0 ? `$B$${open}+B${L.cashflow}` : `${lc(k - 1)}${n}+${lc(k)}${L.cashflow}`), (m) => M[m].balance, GREEN);
    prevBalance = `M${L.balance}`;
    start = n + 3;
  }

  for (const ws of wb.worksheets) ws.pageSetup = { orientation: ws.columnCount > 8 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
