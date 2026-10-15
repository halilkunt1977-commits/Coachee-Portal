import "server-only";
import ExcelJS from "exceljs";
import { FINANCING_KIND, LIQ_ROWS, RENTA_ROWS, calculate, financeHints, monthLabel, type FinanceInput } from "./finance";

/*
 * Finanzplan als Excel-Datei. Einzelposten stehen als Werte drin, Summen und Ergebniszeilen als Formeln,
 * damit Fachstelle, Bank oder Steuerbüro nachrechnen und weiterarbeiten können.
 */
const EUR = '#,##0 "€";[Red]-#,##0 "€"';
const EUR2 = '#,##0.00 "€";[Red]-#,##0.00 "€"';
const ACCENT = "FF1F3A5F";
const TINT = "FFE7EDF4";

const col = (n: number) => {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

function header(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }));
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string) {
  ws.getCell("A1").value = text;
  ws.getCell("A1").font = { bold: true, size: 15, color: { argb: ACCENT } };
  ws.getCell("A2").value = sub;
  ws.getCell("A2").font = { color: { argb: "FF6B6F76" } };
}

export async function financeWorkbook(f: FinanceInput, meta: { name: string; title: string }) {
  const r = calculate(f);
  const wb = new ExcelJS.Workbook();
  wb.creator = "gründarium Portal";
  wb.created = new Date();
  const sub = `${meta.name}${meta.title ? ` · ${meta.title}` : ""} · Start ${monthLabel(f.start, 0)} · alle Beträge netto`;

  // ---------- Übersicht: Kapitalbedarf, Finanzierung, Kennzahlen ----------
  const ov = wb.addWorksheet("Übersicht", { views: [{ showGridLines: false }] });
  ov.columns = [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }];
  title(ov, "Finanzplan", sub);
  let row = 4;
  ov.getRow(row).values = ["Kapitalbedarf", "Betrag", "Monat", "Abschreibung"];
  header(ov, row++);
  const capStart = row;
  for (const i of f.investments) ov.getRow(row++).values = [i.label || "Anschaffung", i.amount, monthLabel(f.start, i.month), i.years ? `${i.years} Jahre` : "sofort"];
  for (const s of f.startup) ov.getRow(row++).values = [s.label || "Gründungskosten", s.amount, monthLabel(f.start, 0), "Gründungskosten"];
  if (f.reserve) ov.getRow(row++).values = ["Liquiditätsreserve", f.reserve, "", ""];
  const capEnd = row - 1;
  ov.getRow(row).values = ["Summe Kapitalbedarf", { formula: capEnd >= capStart ? `SUM(B${capStart}:B${capEnd})` : "0", result: r.capitalNeed.total }];
  ov.getRow(row).font = { bold: true };
  const capSum = row;
  row += 2;

  ov.getRow(row).values = ["Finanzierung", "Betrag", "Monat", "Art", "Zins", "Laufzeit"];
  header(ov, row++);
  const finStart = row;
  for (const x of f.financing)
    ov.getRow(row++).values = [x.label || FINANCING_KIND[x.kind], x.amount, monthLabel(f.start, x.month), FINANCING_KIND[x.kind], x.kind === "darlehen" ? x.rate / 100 : null, x.kind === "darlehen" ? `${x.years} J., ${x.grace} Mon. tilgungsfrei` : ""];
  const finEnd = row - 1;
  for (let i = finStart; i <= finEnd; i++) ov.getCell(`E${i}`).numFmt = "0.0%";
  ov.getRow(row).values = ["Summe Finanzierung", { formula: finEnd >= finStart ? `SUM(B${finStart}:B${finEnd})` : "0", result: r.financingTotal }];
  ov.getRow(row).font = { bold: true };
  const finSum = row++;
  ov.getRow(row).values = ["Über- oder Unterdeckung", { formula: `B${finSum}-B${capSum}`, result: r.gap }];
  ov.getRow(row).font = { bold: true };
  row += 2;

  if (f.grants.length) {
    ov.getRow(row).values = ["Laufende Zuschüsse", "Im Monat", "Ab", "Monate"];
    header(ov, row++);
    for (const g of f.grants) ov.getRow(row++).values = [g.label, g.monthly, monthLabel(f.start, g.from), g.months];
    row++;
  }
  if (f.revenues.length) {
    ov.getRow(row).values = ["Umsatzplanung", "Preis", "je", "Menge Start", "Menge Ziel", "Anlauf (Mon.)"];
    header(ov, row++);
    for (const x of f.revenues) {
      ov.getRow(row).values = [x.label, x.price, x.unit, x.qtyStart, x.qtyTarget, x.ramp];
      ov.getCell(`B${row++}`).numFmt = EUR2;
    }
    row++;
  }
  if (f.fixed.length) {
    ov.getRow(row).values = ["Laufende Kosten", "Im Monat", "Ab"];
    header(ov, row++);
    const s = row;
    for (const x of f.fixed) ov.getRow(row++).values = [x.label, x.monthly, monthLabel(f.start, x.from)];
    ov.getRow(row).values = ["Summe (volle Monate)", { formula: `SUM(B${s}:B${row - 1})`, result: f.fixed.reduce((a, x) => a + x.monthly, 0) }];
    ov.getRow(row++).font = { bold: true };
    row++;
  }
  ov.getRow(row).values = ["Privater Bedarf im Monat", f.privateMonthly];
  ov.getRow(row + 1).values = ["Steuerrücklage vom Gewinn", f.taxPct / 100];
  ov.getCell(`B${row + 1}`).numFmt = "0.0%";
  ov.getRow(row + 2).values = ["Nötiger Monatsumsatz (Kosten und Lebensunterhalt)", Math.round(r.breakEvenRevenue)];
  row += 4;
  for (const h of financeHints(f, r)) {
    ov.getCell(`A${row}`).value = `${h.tone === "warn" ? "Achtung: " : "✓ "}${h.text}`;
    ov.getCell(`A${row++}`).font = { color: { argb: h.tone === "warn" ? "FFB3261E" : "FF2E7D4F" } };
  }
  ov.getColumn(2).numFmt = EUR;

  // ---------- Rentabilität: drei Jahre ----------
  const re = wb.addWorksheet("Rentabilität", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  re.columns = [{ width: 50 }, { width: 16 }, { width: 16 }, { width: 16 }];
  title(re, "Rentabilitätsvorschau", sub);
  re.getRow(4).values = ["", "Jahr 1", "Jahr 2", "Jahr 3"];
  header(re, 4);
  writeRows(re, 5, RENTA_ROWS, r.years);

  // ---------- Liquidität: 36 Monate ----------
  const li = wb.addWorksheet("Liquidität", { views: [{ state: "frozen", xSplit: 1, ySplit: 4, showGridLines: false }] });
  li.columns = [{ width: 46 }, ...r.months.map(() => ({ width: 12 }))];
  title(li, "Liquiditätsplan", sub);
  li.getRow(4).values = ["", ...r.months.map((_, i) => monthLabel(f.start, i))];
  header(li, 4);
  writeRows(li, 5, LIQ_ROWS, r.months);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Zeilen schreiben: Einzelposten als Wert, "="-Zeilen als Formel über die Zeilen seit dem letzten Zwischenergebnis. */
function writeRows<R extends { balance: number }>(ws: ExcelJS.Worksheet, start: number, rows: { label: string; value: (r: R) => number; sign?: string; strong?: boolean; group?: string }[], data: R[]) {
  let blockStart = start;
  let lastTotal: number | null = null;
  rows.forEach((def, i) => {
    const n = start + i;
    const row = ws.getRow(n);
    row.getCell(1).value = `${def.sign && def.sign !== "=" ? `${def.sign} ` : ""}${def.label}`;
    data.forEach((d, j) => {
      const c = col(j + 2);
      const cell = row.getCell(j + 2);
      const result = Math.round(def.value(d) * 100) / 100;
      if (def.sign === "=") {
        const parts: string[] = [];
        if (lastTotal !== null) parts.push(`${c}${lastTotal}`);
        for (let k = blockStart; k < n; k++) {
          const s = rows[k - start].sign;
          parts.push(`${s === "−" ? "-" : "+"}${c}${k}`);
        }
        cell.value = { formula: parts.join("").replace(/^\+/, "") || "0", result };
      } else if (def.label.startsWith("Kontostand")) {
        // Kontostand = Vormonat + Saldo des Monats
        cell.value = { formula: j === 0 ? `${c}${n - 1}` : `${col(j + 1)}${n}+${c}${n - 1}`, result: Math.round(d.balance * 100) / 100 };
      } else cell.value = result;
      cell.numFmt = EUR;
    });
    if (def.sign === "=") {
      lastTotal = n;
      blockStart = n + 1;
    }
    if (def.strong) {
      row.font = { bold: true };
      row.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINT } };
        c.border = { top: { style: "thin", color: { argb: "FFC5D0DD" } } };
      });
    }
    if (def.group) row.getCell(1).note = def.group;
  });
}
