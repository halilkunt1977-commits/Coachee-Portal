import { MONTHS, calculate, eur, financeIsEmpty, keyFigures, liquidityRows, livingTotal, monthLabel, overviewRows, pct, rentaRows, staffCost, yearRange, type FinanceInput } from "./finance";
import { eigenmittel, ersteRate, kapitaldienst, schuldenSumme, tilgungsplan, vermoegenSumme, type BankInfo } from "./bank";
import { landOf } from "./foerderung";
import { parseInline, parseMarkdown, type Run } from "./markdown";
import { BANK_SECTIONS } from "./bank-sections";
import { SECTIONS, sourceList, type GlanceItem, type Sections } from "./sections";

/*
 * Der ganze Businessplan als druckfertiges HTML für das PDF, aufgebaut wie Halils Vorlage: Deckblatt,
 * Titel mit Inhaltsverzeichnis, „Auf einen Blick“ mit Kennzahlen, Kapitel 1 bis 14 im Blocksatz mit Quellen.
 * Dahinter folgt als Anhang der Finanzplan; die Liquidität steht auf Querformat-Seiten.
 * Platzhalter in [eckigen Klammern] werden markiert, damit nichts Unfertiges unbemerkt eingereicht wird.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
const mark = (s: string) => s.replace(/\[([^\]\n]{1,80})\]/g, "<mark>[$1]</mark>");

function runs(rs: Run[]) {
  return rs
    .map((r) => {
      let t = mark(esc(r.text));
      if (r.link) t = `<a href="${esc(r.link)}">${t}</a>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      if (r.italic) t = `<em>${t}</em>`;
      return t;
    })
    .join("");
}

/** Kapiteltext (Markdown) als HTML */
export function mdToHtml(text: string) {
  return parseMarkdown(text)
    .map((b) => {
      if (b.type === "heading") return `<h4>${runs(b.runs)}</h4>`;
      if (b.type === "para") return `<p>${b.lines.map(runs).join("<br>")}</p>`;
      if (b.type === "list") return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${runs(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
      const [first, ...rest] = b.rows;
      return `<table class="tbl"><thead><tr>${first.map((c) => `<th>${runs(c)}</th>`).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${runs(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    })
    .join("\n");
}

const plainTable = (rows: string[][], cls = "tbl") =>
  `<table class="${cls}"><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

type Meta = { title: string; name: string; email: string; phone: string | null; coach: string; date: string };

/** Ziele im Inhaltsverzeichnis: Schlüssel und Überschrift, wie sie im PDF steht (zum Suchen der Seitenzahl) */
export function tocTargets(hasFinance: boolean, bank = false) {
  return [
    { key: "blick", label: "Auf einen Blick", heading: "Auf einen Blick" },
    ...(bank && hasFinance ? [{ key: "finanzierung", label: "Finanzierung und Kapitaldienst", heading: "Finanzierung und Kapitaldienst" }] : []),
    ...(bank ? BANK_SECTIONS : SECTIONS).map((s, i) => ({ key: s.key, label: `${i + 1}. ${s.title}`, heading: `${i + 1}. ${s.title}` })),
    ...(hasFinance ? [{ key: "anhang", label: "Anhang: Finanzplan", heading: "Anhang: Finanzplan" }] : []),
  ];
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

/** pages: Seitenzahlen fürs Inhaltsverzeichnis (aus einem ersten Durchgang), sonst ohne Zahlen */
/** opts.bank: Bankfassung für Kreditantrag und Förderkredit (Finanzierungsübersicht, Kapitaldienst, Tilgungsplan, Vermögen) */
export function renderPlanHtml(sections: Sections, glance: GlanceItem[], finance: FinanceInput, meta: Meta, fontCss: string, pages: Record<string, number> = {}, opts: { bank?: BankInfo } = {}) {
  const bank = opts.bank ?? null;
  const r = calculate(finance);
  const hasFinance = !financeIsEmpty(finance);
  const figures = hasFinance ? plainTable(keyFigures(finance, r), "tbl figures") : "";

  const toc = tocTargets(hasFinance, Boolean(bank)).map((x) => `<li${x.key === "blick" || x.key === "anhang" || x.key === "finanzierung" ? ' class="plain"' : ""}><span class="t">${esc(x.label)}</span><span class="dots"></span><span class="p">${pages[x.key] ?? ""}</span></li>`).join("");
  const running = cssString(`Businessplan · ${meta.name}${meta.title ? ` · ${meta.title}` : ""}`.slice(0, 110));
  const glanceHtml = glance
    .filter((g) => g.label.trim() && g.value.trim())
    .map((g) => `<p class="glance"><strong>${esc(g.label)}:</strong><br>${mark(esc(g.value)).replace(/\n/g, "<br>")}</p>`)
    .join("");

  // Bankfassung: eigene Kapitel (sections sind dann die Bank-Kapitel)
  const chapters = (bank ? BANK_SECTIONS : SECTIONS).map((s, i) => {
    const sec = sections[s.key];
    const t = sec?.text.trim();
    const src = sourceList(sec?.sources ?? "");
    return `<section class="chapter"><h2>${i + 1}. ${esc(s.title)}</h2>${t ? mdToHtml(t) : `<p class="missing">Dieses Kapitel ist noch nicht geschrieben.</p>`}${s.key === "finanzen" || s.key === "rentabilitaet" ? figures : ""}${
      src.length ? `<h4 class="src">Quellen</h4>${src.map((q) => `<p class="source">${runs(parseInline(q))}</p>`).join("")}` : ""
    }</section>`;
  }).join("\n");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Businessplan</title><style>
${fontCss}
@page { size: A4; margin: 25mm 25mm 22mm 25mm;
  @top-left { content: ${running}; font: 8.5pt "Source Sans 3", Arial, sans-serif; color: #0e2841; vertical-align: bottom; padding-bottom: 3mm; border-bottom: .6pt solid #c9a227; }
  @top-right { content: ""; border-bottom: .6pt solid #c9a227; vertical-align: bottom; padding-bottom: 3mm; }
  @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8.5pt "Source Sans 3", Arial, sans-serif; color: #7a7a7a; } }
@page :first { margin: 0; @top-left { content: none; border: none; } @top-right { content: none; border: none; } @bottom-right { content: none; } }
@page wide { size: A4 landscape; margin: 16mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Source Sans 3", Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.32; color: #000; }
h1, h2, h3, h4 { font-size: 11pt; font-weight: 700; margin: 0; break-after: avoid; }
p { margin: 0 0 3.6mm; orphans: 3; widows: 3; }
/* Fließtext im Blocksatz mit Silbentrennung, wie in der Vorlage */
.chapter p, .chapter li, .glance { text-align: justify; hyphens: auto; }
a { color: #0000ff; text-decoration: underline; word-break: break-all; }
ul, ol { margin: 0 0 3.6mm; padding-left: 7mm; }
li { margin-bottom: 1mm; }
mark { background: #fbeec8; color: inherit; padding: 0 .5mm; }
.missing { color: #8a8d94; font-style: italic; }
/* Deckblatt nach der Vorlage: blauer Verlauf, weiße Karte mit dunkelblauem Titelfeld und Akzentbalken */
.cover { height: 297mm; position: relative; background: linear-gradient(180deg, #c7e6f6 0%, #8fcdeb 45%, #47b0e0 100%); break-after: page; }
.card { position: absolute; left: 45.5%; width: 36%; top: 9mm; height: 196mm; background: #fff; border: .6pt solid #7f7f7f; padding: 3mm; display: flex; flex-direction: column; }
.card .navy { background: #0e2841; height: 80mm; display: flex; align-items: flex-end; padding: 0 6mm 9mm; }
.card .navy span { color: #fff; font-size: 25pt; line-height: 1.1; }
.card .who { padding: 21mm 4mm 0; color: #0e2841; font-size: 14pt; line-height: 1.35; }
.card .who small { display: block; font-size: 10.5pt; margin-top: 3mm; color: #156082; }
.card .bar { margin-top: auto; margin-bottom: 7mm; height: 3.4mm; background: #156082; }
.card .date { position: absolute; bottom: 2.5mm; left: 4mm; right: 4mm; font-size: 8.5pt; color: #595959; }
.front { break-after: page; }
.front .t1 { margin-bottom: 4mm; }
.front .t3 { margin: 9mm 0 5mm; color: #0e2841; }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; align-items: baseline; gap: 2mm; margin: 0 0 2.6mm; }
.toc li.plain { font-weight: 700; color: #0e2841; }
.toc li.plain:last-child { margin-top: 4mm; }
.toc .dots { flex: 1; border-bottom: .8pt dotted #9a9a9a; transform: translateY(-1mm); }
.toc .p { min-width: 7mm; text-align: right; font-variant-numeric: tabular-nums; }
.blick { break-after: page; }
.blick h2, .chapter h2, .annex h2 { color: #0e2841; padding-bottom: 1.6mm; border-bottom: .8pt solid #c9a227; }
.blick h2 { margin-bottom: 8mm; }
.glance { margin-bottom: 5.5mm; }
.chapter h2 { margin: 8mm 0 4mm; }
.chapter:first-of-type h2 { margin-top: 0; }
.chapter h4 { margin: 5mm 0 2.6mm; }
.chapter h4.src { margin-top: 6mm; }
.source { text-align: left !important; margin-bottom: 2.6mm; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 5mm; break-inside: avoid; }
.tbl th, .tbl td { border: .5pt solid #b7b7b7; padding: 1.4mm 2mm; font-size: 9pt; text-align: left; vertical-align: middle; }
.tbl th { font-weight: 700; }
.figures td:not(:first-child), .figures th:not(:first-child) { text-align: right; }
.annex { break-before: page; }
.annex h2 { font-size: 13pt; margin-bottom: 1mm; }
.annex h3 { font-size: 11pt; margin: 6mm 0 2mm; color: #0e2841; }
.lead { color: #595959; font-size: 9.5pt; }
.fin th, .fin td { font-size: 8.6pt; padding: 1.1mm 1.6mm; border-bottom: .5pt solid #d9d9d9; text-align: left; vertical-align: top; }
.fin th { background: #0e2841; color: #fff; font-weight: 600; }
.fin td.n, .fin th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fin tr.sum td { background: #e2f0d9; font-weight: 700; }
.fin tr.sub td { background: #e7e6e6; font-weight: 700; }
.fin tr.grp td { font-weight: 700; padding-top: 2mm; border-bottom: none; }
.fin td.neg { color: #c00000; }
.wide { page: wide; break-before: page; }
.liq { table-layout: fixed; }
.liq th, .liq td { font-size: 7.2pt; padding: .8mm 1mm; }
.liq td:first-child, .liq th:first-child { width: 52mm; }
.liq th.m { background: #d9eaf7; color: #000; }
</style></head><body>
<div class="cover">
  <div class="card">
    <div class="navy"><span>Businessplan</span></div>
    <div class="who">${esc(meta.name)}${meta.title ? `<small>${esc(meta.title)}</small>` : ""}${bank ? `<small>Unterlage zum Finanzierungsantrag</small>` : ""}</div>
    <div class="bar"></div>
    <div class="date">Stand ${esc(meta.date)}</div>
  </div>
</div>
<div class="front">
  <h1 class="t1">BUSINESSPLAN – ${esc(meta.name)}</h1>
  ${meta.title ? `<h1>${esc(meta.title)}</h1>` : ""}
  ${bank ? `<p class="lead" style="margin-top:3mm">Unterlage zum Finanzierungsantrag${bank.hausbank ? ` bei der ${esc(bank.hausbank)}` : ""}</p>` : ""}
  <h1 class="t3">Inhaltsverzeichnis</h1>
  <ol class="toc">${toc}</ol>
</div>
<div class="blick">
  <h2>Auf einen Blick</h2>
  ${glanceHtml || `<p class="missing">Noch keine Angaben.</p>`}
  ${figures}
</div>
${bank && hasFinance ? bankOverview(finance, r, bank) : ""}
${chapters}
${hasFinance ? financeAnnex(finance, r, bank) : ""}
</body></html>`;
}

// ---------- Anhang Finanzplan ----------

const money = (v: number) => `<td class="n${v < -0.005 ? " neg" : ""}">${esc(Math.abs(v) < 0.005 ? "–" : eur(v))}</td>`;

/** Finanzierung und Kapitaldienst: die Seite, die Bank und Förderbank zuerst lesen */
function bankOverview(f: FinanceInput, r: ReturnType<typeof calculate>, b: BankInfo) {
  const loans = f.financing.filter((x) => x.kind === "darlehen" && x.amount > 0);
  const zuschuesse = f.financing.filter((x) => x.kind === "zuschuss" && x.amount > 0);
  const eigen = eigenmittel(f);
  const total = r.capitalNeed.total;
  const kd = kapitaldienst(f, r);
  const land = landOf(b.land);
  const bedarf = `<table class="fin"><thead><tr><th>Kapitalbedarf</th><th class="n">Betrag</th></tr></thead><tbody>
    ${f.investments.map((i) => `<tr><td>${esc(i.label)}</td>${money(i.amount)}</tr>`).join("")}
    ${r.capitalNeed.reserve ? `<tr><td>Liquiditätsreserve / Anlaufkosten</td>${money(r.capitalNeed.reserve)}</tr>` : ""}
    <tr class="sum"><td>Kapitalbedarf gesamt</td>${money(total)}</tr></tbody></table>`;
  const finanzierung = `<table class="fin"><thead><tr><th>Finanzierung</th><th>Bedingungen</th><th class="n">Betrag</th></tr></thead><tbody>
    <tr><td>Eigenmittel</td><td>${esc(b.eigenmittel || "Anfangsliquidität und eingebrachtes Eigenkapital")}</td>${money(eigen)}</tr>
    ${loans.map((l) => `<tr><td>${esc(l.label || "Darlehen")}</td><td>${l.rate.toLocaleString("de-DE")} % Zins, ${l.years} Jahre Laufzeit, ${l.grace} Monate tilgungsfrei, danach ca. ${esc(eur(ersteRate(l)))} im Monat; Auszahlung ${monthLabel(f.start, l.month)}</td>${money(l.amount)}</tr>`).join("")}
    ${zuschuesse.map((z) => `<tr><td>${esc(z.label || "Zuschuss")}</td><td>Zuschuss, ${monthLabel(f.start, z.month)}</td>${money(z.amount)}</tr>`).join("")}
    <tr class="sum"><td>Finanzierung gesamt</td><td>${total > 0 ? `Eigenmittelanteil ${pct((eigen / total) * 100)}` : ""}</td>${money(r.financingTotal)}</tr>
    ${r.gap < 0 ? `<tr><td colspan="2">Noch nicht gedeckt</td>${money(r.gap)}</tr>` : ""}
  </tbody></table>`;
  const head = `<tr><th></th>${kd.map((k) => `<th class="n">Jahr ${k.jahr}</th>`).join("")}</tr>`;
  const row = (label: string, fn: (k: (typeof kd)[number]) => number, cls = "") => `<tr class="${cls}"><td>${label}</td>${kd.map((k) => money(fn(k))).join("")}</tr>`;
  const dienst = `<table class="fin"><thead>${head}</thead><tbody>
    ${row("Ergebnis vor Steuern", (k) => k.profit)}
    ${row("+ Abschreibungen", (k) => k.afa)}
    ${row("+ Zinsaufwand", (k) => k.zins)}
    ${row("− Steuern (Rücklage)", (k) => -k.steuer)}
    ${row("− Private Entnahmen", (k) => -k.entnahme)}
    ${kd.some((k) => k.zuschuss) ? row("+ Zuschüsse zum Lebensunterhalt", (k) => k.zuschuss) : ""}
    ${row("= Verfügbar für den Kapitaldienst", (k) => k.verfuegbar, "sub")}
    ${row("Kapitaldienst (Zins und Tilgung)", (k) => k.dienst)}
    ${row("Über- bzw. Unterdeckung", (k) => k.ueberdeckung, "sum")}
    <tr><td>Deckungsgrad</td>${kd.map((k) => `<td class="n">${k.deckung === null ? "–" : `${k.deckung.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`}</td>`).join("")}</tr>
  </tbody></table>
  <p class="lead">Deckungsgrad = verfügbarer Betrag geteilt durch Zins und Tilgung. Banken erwarten mindestens 1,2, also 20 % Puffer.</p>`;
  return `<section class="chapter"><h2>Finanzierung und Kapitaldienst</h2>
    ${bedarf}${finanzierung}
    ${b.hausbank || b.sicherheiten ? `<h4>Hausbank und Sicherheiten</h4>${b.hausbank ? `<p>Hausbank: ${esc(b.hausbank)}</p>` : ""}${b.sicherheiten ? `<p>${mark(esc(b.sicherheiten)).replace(/\n/g, "<br>")}</p>` : ""}` : ""}
    ${land ? `<p class="lead">Sitz im Bundesland ${esc(land.name)}; Förderbank: ${esc(land.bank)}, Bürgschaften: ${esc(land.buergschaft)}.</p>` : ""}
    <h4>Kapitaldienstfähigkeit</h4>${dienst}
  </section>`;
}

function financeAnnex(f: FinanceInput, r: ReturnType<typeof calculate>, bank: BankInfo | null = null) {
  const n = (v: number) => `<td class="n${v < -0.005 ? " neg" : ""}">${esc(Math.abs(v) < 0.005 ? "–" : eur(v))}</td>`;
  const yearsHead = `<tr><th></th>${[0, 1, 2].map((y) => `<th class="n">Jahr ${y + 1}</th>`).join("")}</tr>`;
  const over = `<table class="fin"><thead>${yearsHead}</thead><tbody>${overviewRows(f).map((row) => `<tr class="${row.tone ?? ""}"><td>${esc(row.label)}</td>${r.years.map((y) => n(row.value(y))).join("")}</tr>`).join("")}</tbody></table>`;
  const assumptions = `<table class="fin"><thead><tr><th>Annahme</th>${[0, 1, 2].map((y) => `<th class="n">Jahr ${y + 1}</th>`).join("")}<th>Herleitung / Hinweis</th></tr></thead><tbody>
    <tr><td>Planungszeitraum</td>${[0, 1, 2].map((y) => `<td class="n">${yearRange(f.start, y)}</td>`).join("")}<td>${esc(f.notes.period)}</td></tr>
    <tr><td>Materialquote</td>${f.materialPct.map((p) => `<td class="n">${pct(p)}</td>`).join("")}<td>${esc(f.notes.material)}</td></tr>
    <tr><td>Anfangsliquidität</td>${n(f.openingCash)}<td></td><td></td><td>${esc(f.notes.opening)}</td></tr>
    <tr><td>Private Entnahmen im Monat</td>${f.privateDraw.map(n).join("")}<td>${esc(f.notes.private)}</td></tr>
    ${f.taxPct ? `<tr><td>Steuerrücklage</td><td class="n">${pct(f.taxPct)}</td><td></td><td></td><td>${esc(f.notes.tax)}</td></tr>` : ""}
  </tbody></table>`;
  const costs = f.costs.length
    ? `<h3>Kostenherleitung (€ im Monat)</h3><table class="fin"><thead><tr><th>Kostenart</th>${[1, 2, 3].map((y) => `<th class="n">Jahr ${y}</th>`).join("")}<th>Zuordnung</th><th>Herleitung</th></tr></thead><tbody>${f.costs
        .map((c) => `<tr><td>${esc(c.label)}${c.from ? ` <span class="lead">(ab ${monthLabel(f.start, c.from)})</span>` : ""}</td>${c.monthly.map(n).join("")}<td>${esc(c.category)}</td><td>${esc(c.note)}</td></tr>`)
        .join("")}<tr class="sum"><td>Summe laufende Kosten</td>${[0, 1, 2].map((y) => n(f.costs.reduce((a, c) => a + c.monthly[y], 0))).join("")}<td></td><td></td></tr></tbody></table>`
    : "";
  const inv = f.investments.length
    ? `<h3>Investitionsplan</h3><table class="fin"><thead><tr><th>Investition</th><th class="n">Betrag</th><th class="n">Nutzung</th><th class="n">AfA/Monat</th><th class="n">Zahlung</th><th>Begründung</th></tr></thead><tbody>${f.investments
        .map((i) => `<tr><td>${esc(i.label)}</td>${n(i.amount)}<td class="n">${i.life ? `${i.life} Mon.` : "sofort"}</td>${n(i.life ? i.amount / i.life : 0)}<td class="n">${monthLabel(f.start, i.month)}</td><td>${esc([i.reason, i.note].filter(Boolean).join(" · "))}</td></tr>`)
        .join("")}<tr class="sum"><td>Gesamtinvestition</td>${n(r.capitalNeed.investments)}<td></td>${n(f.investments.reduce((a, i) => a + (i.life ? i.amount / i.life : 0), 0))}<td></td><td></td></tr></tbody></table>`
    : "";
  const staff = f.staff.length
    ? `<h3>Personalplan</h3><table class="fin"><thead><tr><th>Position</th><th class="n">Start</th><th class="n">Brutto</th><th class="n">AG-Anteil</th><th class="n">Gesamt/Monat</th><th>Herleitung</th></tr></thead><tbody>${f.staff
        .map((s) => `<tr><td>${esc(s.label)}</td><td class="n">${monthLabel(f.start, s.start)}</td>${n(s.gross)}<td class="n">${pct(s.surcharge)}</td>${n(staffCost(s))}<td>${esc(s.note)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const fin = f.financing.length + f.grants.length
    ? `<h3>Finanzierung</h3><table class="fin"><tbody>${f.financing.map((x) => `<tr><td>${esc(x.label)} <span class="lead">(${x.kind === "darlehen" ? `Darlehen, ${x.rate.toLocaleString("de-DE")} % Zins, ${x.years} Jahre, ${x.grace} Monate tilgungsfrei` : x.kind === "zuschuss" ? "Zuschuss" : "Eigenkapital"}, ${monthLabel(f.start, x.month)})</span></td>${n(x.amount)}</tr>`).join("")}${f.grants
        .map((g) => `<tr><td>${esc(g.label)} <span class="lead">(${eur(g.monthly)} im Monat ab ${monthLabel(f.start, g.from)} für ${g.months} Monate)</span></td>${n(g.monthly * g.months)}</tr>`)
        .join("")}</tbody></table>`
    : "";
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const revenue = f.revenues.length
    ? `<h3>Umsatzherleitung</h3><table class="fin"><thead><tr><th>Leistungsart</th><th class="n">Ø Preis netto</th>${[1, 2, 3].map((y) => `<th class="n">Menge J${y}</th><th class="n">Umsatz J${y}</th>`).join("")}</tr></thead><tbody>${f.revenues
        .map((x) => `<tr><td>${esc(x.label)}${x.description ? `<br><span class="lead">${esc(x.description)}</span>` : ""}</td>${n(x.price)}${[0, 1, 2].map((y) => {
          const q = sum(x.qty.slice(y * 12, y * 12 + 12));
          return `<td class="n">${q.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td>${n(q * x.price)}`;
        }).join("")}</tr>`)
        .join("")}<tr class="sum"><td>Jahresumsatz</td><td></td>${r.years.map((y) => `<td></td>${n(y.revenue)}`).join("")}</tr></tbody></table>`
    : "";
  const renta = rentaRows(r, f);
  const yearTables = (title: string, rows: { label: string; value: (m: (typeof r.months)[number]) => number; tone?: string; group?: string }[], opening: boolean) =>
    [0, 1, 2]
      .map((y) => {
        const ms = r.months.slice(y * 12, y * 12 + 12);
        return `<h3>${title} Jahr ${y + 1} (${yearRange(f.start, y)})</h3><table class="fin liq"><thead><tr><th class="m">${opening ? `Anfangsbestand ${esc(eur(ms[0].opening))}` : "Position"}</th>${ms.map((_, i) => `<th class="n m">${monthLabel(f.start, y * 12 + i)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((row) => `${row.group ? `<tr class="grp"><td colspan="13">${esc(row.group)}</td></tr>` : ""}<tr class="${row.tone ?? ""}"><td>${esc(row.label)}</td>${ms.map((m) => n(row.value(m))).join("")}</tr>`)
          .join("")}</tbody></table>`;
      })
      .join("");
  const living = f.living.length
    ? `<h3>Private Lebenshaltungskosten (€ im Monat)</h3><table class="fin"><tbody>${f.living.map((x) => `<tr><td>${esc(x.label)}</td>${n(x.monthly)}</tr>`).join("")}<tr class="sum"><td>Summe Lebenshaltungskosten</td>${n(livingTotal(f))}</tr><tr><td>Private Entnahme im Monat (Jahr 1)</td>${n(f.privateDraw[0])}</tr></tbody></table>`
    : "";
  return `<section class="annex">
  <h2>Anhang: Finanzplan</h2>
  <p class="lead">Alle Beträge netto in Euro. Planungszeitraum ${yearRange(f.start, 0).split("–")[0]} bis ${monthLabel(f.start, MONTHS - 1)}, Betrachtung über 36 Monate.</p>
  <h3>Annahmen</h3>${assumptions}
  <h3>Rentabilität Übersicht</h3>${over}
  ${revenue}${costs}${inv}${staff}${fin}${living}${bank ? bankAnnex(f, bank) : ""}
</section>
<section class="wide">${yearTables("Rentabilitätsvorschau", renta, false)}</section>
<section class="wide">${yearTables("Liquiditätsplanung", liquidityRows(f), true)}</section>`;
}

/** Tilgungsplan je Darlehen und private Vermögensübersicht (Selbstauskunft in Kurzform) */
function bankAnnex(f: FinanceInput, b: BankInfo) {
  const loans = f.financing.filter((x) => x.kind === "darlehen" && x.amount > 0);
  const plans = loans
    .map((l) => {
      const t = tilgungsplan(l);
      return `<h3>Tilgungsplan: ${esc(l.label || "Darlehen")} (${esc(eur(l.amount))}, ${l.rate.toLocaleString("de-DE")} %)</h3><table class="fin"><thead><tr><th>Planjahr</th><th class="n">Zinsen</th><th class="n">Tilgung</th><th class="n">Restschuld Jahresende</th></tr></thead><tbody>${t
        .map((y) => `<tr><td>Jahr ${y.jahr}</td>${money(y.zins)}${money(y.tilgung)}${money(y.rest)}</tr>`)
        .join("")}<tr class="sum"><td>Summe</td>${money(t.reduce((s, y) => s + y.zins, 0))}${money(t.reduce((s, y) => s + y.tilgung, 0))}<td></td></tr></tbody></table>`;
    })
    .join("");
  const vermoegen = b.vermoegen.length || b.verbindlichkeiten.length
    ? `<h3>Private Vermögensübersicht</h3><table class="fin"><thead><tr><th>Vermögen</th><th class="n">Betrag</th></tr></thead><tbody>${b.vermoegen.map((x) => `<tr><td>${esc(x.label)}</td>${money(x.betrag)}</tr>`).join("")}<tr class="sum"><td>Summe Vermögen</td>${money(vermoegenSumme(b))}</tr></tbody></table>
      <table class="fin"><thead><tr><th>Verbindlichkeiten</th><th class="n">Restschuld</th><th class="n">Rate im Monat</th></tr></thead><tbody>${b.verbindlichkeiten.map((x) => `<tr><td>${esc(x.label)}</td>${money(x.betrag)}${money(x.rate)}</tr>`).join("") || `<tr><td>Keine</td><td></td><td></td></tr>`}<tr class="sum"><td>Summe Verbindlichkeiten</td>${money(schuldenSumme(b))}${money(b.verbindlichkeiten.reduce((s, x) => s + x.rate, 0))}</tr></tbody></table>`
    : "";
  return plans + vermoegen;
}
