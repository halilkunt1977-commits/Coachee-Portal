import { FINANCING_KIND, LIQ_ROWS, RENTA_ROWS, calculate, eur, financeHints, monthLabel, type FinanceInput } from "./finance";
import { SECTIONS, type Sections } from "./sections";

/*
 * Der ganze Businessplan als druckfertiges HTML für das PDF: Deckblatt, Inhalt, Textabschnitte, Finanzplan.
 * Die Liquidität steht auf Querformat-Seiten. Platzhalter in [eckigen Klammern] werden markiert, damit nichts
 * Unfertiges unbemerkt eingereicht wird.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

const cssText = (s: string) => s.replace(/[\\"]/g, "\\$&").replace(/[<>\n]/g, " ");

function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]{1,80})\]/g, '<mark>[$1]</mark>');
}

/** Kleines Markdown: Absätze, Listen, Zwischenüberschriften, fett, kursiv */
export function mdToHtml(text: string) {
  const out: string[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`);
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`);
    else if (lines.length === 1 && /^#{1,6}\s/.test(lines[0])) out.push(`<h3>${inline(lines[0].replace(/^#+\s*/, ""))}</h3>`);
    else {
      // gemischter Block: Listenzeilen innerhalb eines Absatzes trotzdem als Liste
      let para: string[] = [];
      let list: string[] = [];
      const flush = () => {
        if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
        if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
        para = [];
        list = [];
      };
      for (const l of lines) {
        if (/^\s*[-*•]\s+/.test(l)) {
          if (para.length) flush();
          list.push(l.replace(/^\s*[-*•]\s+/, ""));
        } else if (/^#{1,6}\s/.test(l)) {
          flush();
          out.push(`<h3>${inline(l.replace(/^#+\s*/, ""))}</h3>`);
        } else {
          if (list.length) flush();
          para.push(l);
        }
      }
      flush();
    }
  }
  return out.join("\n");
}

type Meta = { title: string; name: string; email: string; phone: string | null; coach: string; date: string };

export function renderPlanHtml(sections: Sections, finance: FinanceInput, meta: Meta, fontCss: string) {
  const r = calculate(finance);
  const hasFinance = finance.revenues.length + finance.investments.length + finance.financing.length + finance.fixed.length > 0;
  const num = (i: number) => i + 1;
  const fin = SECTIONS.length + 1;

  const sectionHtml = SECTIONS.map((s, i) => {
    const t = sections[s.key]?.text.trim();
    return `<section class="sec"><h2><span>${num(i)}</span>${esc(s.title)}</h2>${t ? mdToHtml(t) : `<p class="missing">Dieser Abschnitt ist noch nicht geschrieben.</p>`}</section>`;
  }).join("\n");

  const money = (n: number) => `<td class="n">${esc(eur(n))}</td>`;
  const capRows = [
    ...finance.investments.map((x) => `<tr><td>${esc(x.label || "Anschaffung")}<small>${x.years ? ` · Abschreibung über ${x.years} Jahre` : " · sofort abgeschrieben"}</small></td>${money(x.amount)}</tr>`),
    ...finance.startup.map((x) => `<tr><td>${esc(x.label || "Gründungskosten")}<small> · Gründungskosten</small></td>${money(x.amount)}</tr>`),
    ...(finance.reserve ? [`<tr><td>Liquiditätsreserve</td>${money(finance.reserve)}</tr>`] : []),
  ].join("");
  const finRows = finance.financing
    .map((x) => `<tr><td>${esc(x.label || FINANCING_KIND[x.kind])}<small> · ${FINANCING_KIND[x.kind]}${x.kind === "darlehen" ? `, ${x.rate.toLocaleString("de-DE")} % Zins, ${x.years} Jahre, ${x.grace} Monate tilgungsfrei` : ""}</small></td>${money(x.amount)}</tr>`)
    .join("");
  const grantRows = finance.grants.map((g) => `<tr><td>${esc(g.label)}<small> · ab ${monthLabel(finance.start, g.from)} für ${g.months} Monate</small></td>${money(g.monthly)}</tr>`).join("");
  const revRows = finance.revenues
    .map((x) => `<tr><td>${esc(x.label)}<small> · ${esc(eur(x.price, 2))} je ${esc(x.unit)}, ${x.qtyStart.toLocaleString("de-DE")} → ${x.qtyTarget.toLocaleString("de-DE")} pro Monat in ${x.ramp} Monaten${x.material ? `, ${x.material.toLocaleString("de-DE")} % Wareneinsatz` : ""}</small></td>${money(x.price * x.qtyTarget)}</tr>`)
    .join("");
  const fixedRows = finance.fixed.map((x) => `<tr><td>${esc(x.label)}${x.from ? `<small> · ab ${monthLabel(finance.start, x.from)}</small>` : ""}</td>${money(x.monthly)}</tr>`).join("");

  const renta = `<table class="grid"><thead><tr><th></th><th class="n">Jahr 1</th><th class="n">Jahr 2</th><th class="n">Jahr 3</th></tr></thead><tbody>${RENTA_ROWS.map(
    (row) => `<tr class="${row.strong ? "sum" : ""}"><td><i>${row.sign ?? ""}</i>${esc(row.label)}</td>${r.years.map((y) => `<td class="n${row.strong && row.value(y) < 0 ? " neg" : ""}">${esc(eur(row.value(y)))}</td>`).join("")}</tr>`,
  ).join("")}</tbody></table>`;

  const liq = [0, 1, 2]
    .map((y) => {
      const ms = r.months.slice(y * 12, y * 12 + 12);
      return `<h3>Liquiditätsplan Jahr ${y + 1}</h3><table class="grid liq"><thead><tr><th></th>${ms.map((_, i) => `<th class="n">${monthLabel(finance.start, y * 12 + i)}</th>`).join("")}</tr></thead><tbody>${LIQ_ROWS.map(
        (row) => `<tr class="${row.strong ? "sum" : ""}${row.group ? " grp" : ""}"><td><i>${row.sign ?? ""}</i>${esc(row.label)}</td>${ms.map((m) => {
          const v = row.value(m);
          return `<td class="n${v < 0 && row.strong ? " neg" : ""}${v === 0 && !row.strong ? " zero" : ""}">${esc(Math.round(v).toLocaleString("de-DE"))}</td>`;
        }).join("")}</tr>`,
      ).join("")}</tbody></table>`;
    })
    .join("");

  const hints = financeHints(finance, r);
  const box = (label: string, value: string, warn = false) => `<div class="kpi${warn ? " warn" : ""}"><span>${label}</span><b>${esc(value)}</b></div>`;

  const financeHtml = hasFinance
    ? `<section class="sec fin">
  <h2><span>${fin}</span>Finanzplan</h2>
  <p class="lead">Alle Beträge netto in Euro. Planungsbeginn ${monthLabel(finance.start, 0)}, Betrachtung über 36 Monate.</p>
  <div class="kpis">
    ${box("Kapitalbedarf", eur(r.capitalNeed.total))}
    ${box("Finanzierung", eur(r.financingTotal), r.gap < 0)}
    ${box("Gewinn Jahr 1", eur(r.years[0].profit), r.years[0].profit < 0)}
    ${box("Gewinn Jahr 3", eur(r.years[2].profit), r.years[2].profit < 0)}
    ${box("Nötiger Monatsumsatz", eur(r.breakEvenRevenue))}
    ${box("Niedrigster Kontostand", eur(r.minBalance.value), r.minBalance.value < 0)}
  </div>
  <h3>${fin}.1 Kapitalbedarf</h3>
  <table class="list"><tbody>${capRows || `<tr><td class="missing">Noch kein Kapitalbedarf eingetragen.</td><td></td></tr>`}<tr class="sum"><td>Summe Kapitalbedarf</td>${money(r.capitalNeed.total)}</tr></tbody></table>
  <h3>${fin}.2 Finanzierung</h3>
  <table class="list"><tbody>${finRows || `<tr><td class="missing">Noch keine Finanzierung eingetragen.</td><td></td></tr>`}<tr class="sum"><td>Summe Finanzierung</td>${money(r.financingTotal)}</tr><tr class="${r.gap < 0 ? "neg" : ""}"><td>${r.gap < 0 ? "Unterdeckung" : "Überdeckung"}</td>${money(r.gap)}</tr></tbody></table>
  ${grantRows ? `<h4>Laufende Zuschüsse im Monat</h4><table class="list"><tbody>${grantRows}</tbody></table>` : ""}
  <h3>${fin}.3 Umsatz- und Kostenplanung</h3>
  ${revRows ? `<h4>Umsatz im Monat nach der Anlaufphase</h4><table class="list"><tbody>${revRows}</tbody></table>` : ""}
  ${fixedRows ? `<h4>Laufende Kosten im Monat</h4><table class="list"><tbody>${fixedRows}<tr class="sum"><td>Summe</td>${money(finance.fixed.reduce((a, x) => a + x.monthly, 0))}</tr></tbody></table>` : ""}
  <table class="list"><tbody><tr><td>Privater Bedarf im Monat<small> · Lebenshaltung, Krankenversicherung, Vorsorge</small></td>${money(finance.privateMonthly)}</tr><tr><td>Steuerrücklage<small> · vereinfacht vom Gewinn</small></td><td class="n">${finance.taxPct.toLocaleString("de-DE")} %</td></tr></tbody></table>
  <h3>${fin}.4 Rentabilitätsvorschau</h3>
  ${renta}
  ${hints.length ? `<ul class="hints">${hints.map((h) => `<li class="${h.tone}">${esc(h.text)}</li>`).join("")}</ul>` : ""}
</section>
<section class="wide">
  <h2 class="cont"><span>${fin}.5</span>Liquiditätsplan</h2>
  <p class="lead">Ein- und Auszahlungen je Monat in Euro, Kontostand am Monatsende.</p>
  ${liq}
</section>`
    : "";

  const toc = [...SECTIONS.map((s, i) => `<li><span>${num(i)}</span>${esc(s.title)}</li>`), ...(hasFinance ? [`<li><span>${fin}</span>Finanzplan</li>`] : [])].join("");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Businessplan</title><style>
${fontCss}
@page { size: A4; margin: 22mm 20mm 20mm 22mm;
  @bottom-left { content: "Businessplan · ${cssText(meta.name)}"; font: 8pt "Source Sans 3", Arial, sans-serif; color: #8a8d94; }
  @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt "Source Sans 3", Arial, sans-serif; color: #8a8d94; } }
@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
@page wide { size: A4 landscape; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Source Sans 3", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #16181d; }
h1, h2, h3 { font-family: "Source Serif 4", Georgia, serif; color: #1f3a5f; break-after: avoid; }
h2 { font-size: 17pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 1.2pt solid #1f3a5f; display: flex; gap: 3mm; align-items: baseline; }
h2 span { color: #b88a4a; font-size: 13pt; }
h3 { font-size: 12pt; margin: 6mm 0 2mm; }
h4 { font-size: 10pt; margin: 4mm 0 1mm; color: #5d6068; text-transform: uppercase; letter-spacing: .04em; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 2.6mm; padding-left: 5mm; }
li { margin-bottom: .8mm; }
mark { background: #fbeec8; color: inherit; padding: 0 .5mm; border-radius: 1mm; }
.missing { color: #8a8d94; font-style: italic; }
.cover { height: 297mm; padding: 34mm 24mm 24mm; display: flex; flex-direction: column; background: #1f3a5f; color: #fff; break-after: page; }
.cover .kicker { font-size: 10pt; letter-spacing: .18em; text-transform: uppercase; color: #d9b98a; }
.cover h1 { color: #fff; font-size: 34pt; line-height: 1.12; margin: 6mm 0 8mm; max-width: 150mm; }
.cover .who { font-size: 13pt; line-height: 1.5; }
.cover .who b { font-size: 16pt; display: block; }
.cover .foot { margin-top: auto; border-top: .6pt solid rgba(255,255,255,.35); padding-top: 5mm; font-size: 9.5pt; color: #c9d3e0; display: flex; justify-content: space-between; }
.toc { break-after: page; }
.toc ol { list-style: none; padding: 0; margin: 6mm 0 0; }
.toc li { display: flex; gap: 4mm; padding: 2.4mm 0; border-bottom: .5pt solid #e8e4dc; font-size: 12pt; }
.toc li span { color: #b88a4a; font-weight: 600; width: 8mm; }
.sec { break-before: page; }
.sec + .sec:not(.fin) { break-before: auto; margin-top: 10mm; }
.fin { break-before: page; }
.lead { color: #5d6068; }
table { border-collapse: collapse; width: 100%; margin-bottom: 3mm; }
td, th { padding: 1.4mm 2mm; vertical-align: top; }
.list td { border-bottom: .5pt solid #e8e4dc; }
.list td small { color: #5d6068; font-size: 8.8pt; }
td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tr.sum td { font-weight: 700; border-top: 1pt solid #1f3a5f; background: #e7edf4; }
.neg, tr.neg td, td.neg { color: #a33a2c; }
.grid th { font-size: 8.8pt; color: #fff; background: #1f3a5f; font-weight: 600; }
.grid td { border-bottom: .5pt solid #e8e4dc; }
.grid td i { display: inline-block; width: 4mm; color: #8a8d94; font-style: normal; }
.liq { font-size: 7.6pt; table-layout: fixed; }
.liq td, .liq th { padding: 1mm 1.2mm; }
.liq td:first-child, .liq th:first-child { width: 58mm; }
.liq tr.grp td { border-top: 1pt solid #c5d0dd; }
.liq td.zero { color: #b3b6bc; }
.liq { break-inside: avoid; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 2mm; }
.kpi { border: .6pt solid #dcd7cd; border-radius: 2mm; padding: 2.6mm 3mm; break-inside: avoid; }
.kpi span { display: block; font-size: 8.5pt; color: #5d6068; }
.kpi b { font-size: 13pt; font-variant-numeric: tabular-nums; }
.kpi.warn b { color: #a33a2c; }
.hints { list-style: none; padding: 0; margin-top: 4mm; }
.hints li { padding-left: 5mm; position: relative; }
.hints li::before { position: absolute; left: 0; content: "✓"; color: #2f6b45; }
.hints li.warn::before { content: "!"; color: #a33a2c; font-weight: 700; }
.wide { page: wide; break-before: page; }
.wide h3 { margin-top: 3mm; }
.wide h3 + table { margin-bottom: 4mm; }
.cont { font-size: 15pt; }
</style></head><body>
<div class="cover">
  <div class="kicker">Businessplan</div>
  <h1>${esc(meta.title || "Mein Gründungsvorhaben")}</h1>
  <div class="who"><b>${esc(meta.name)}</b>${esc(meta.email)}${meta.phone ? `<br>${esc(meta.phone)}` : ""}</div>
  <div class="foot"><span>Stand ${esc(meta.date)}</span><span>Erstellt im Gründungscoaching mit ${esc(meta.coach)} · gründarium</span></div>
</div>
<div class="toc"><h2>Inhalt</h2><ol>${toc}</ol></div>
${sectionHtml}
${financeHtml}
</body></html>`;
}
