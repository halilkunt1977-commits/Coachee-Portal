import { inline, type Block, type Handbook } from "./content";

/*
 * Das Handbuch als Büchlein im Format A5: Einband in Nachtblau und Gold mit der Gründarium-Marke,
 * Widmung mit Inhaltsverzeichnis, jedes Kapitel auf neuer Seite, Fließtext im Blocksatz mit Silbentrennung,
 * Checkboxen zum Abhaken auf Papier (erledigte Schritte sind schon angekreuzt), am Ende Platz für Notizen.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
const rich = (t: string) => inline(t).map((p) => (p.bold ? `<strong>${esc(p.text)}</strong>` : esc(p.text))).join("");
const two = (n: number) => String(n).padStart(2, "0");

function block(b: Block, done: Set<string>, portal: string): string {
  switch (b.kind) {
    case "text":
      return `<p>${rich(b.text)}</p>`;
    case "quote":
      return `<div class="quote"><span>${esc(b.label)}</span><p>${esc(b.text).replace(/\n/g, "<br>")}</p></div>`;
    case "check":
      return `${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<ul class="checks">${b.items
        .map((i) => `<li class="${done.has(i.key) ? "on" : ""}"><span class="box">${done.has(i.key) ? "✓" : ""}</span><div><p class="t">${rich(i.text)}</p>${i.hint ? `<p class="h">${esc(i.hint)}</p>` : ""}</div></li>`)
        .join("")}</ul>`;
    case "list":
      return `${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<ul class="dots">${b.items.map((i) => `<li>${rich(i)}</li>`).join("")}</ul>`;
    case "facts":
      return `<table class="facts"><tr>${b.items.map((f) => `<td><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong>${f.hint ? `<em>${esc(f.hint)}</em>` : ""}</td>`).join("")}</tr></table>`;
    case "dates":
      return `${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<table class="dates">${b.items.map((d) => `<tr><th>${esc(d.when)}</th><td>${esc(d.what)}</td></tr>`).join("")}</table>`;
    case "contacts":
      return `<div class="contacts">${b.items
        .map((c) => `<div class="contact"><strong>${esc(c.name)}</strong><p>${esc(c.what)}</p><p class="h">${esc(c.how)}${c.url ? ` · ${esc(c.url.replace(/^https:\/\/(www\.)?/, ""))}` : ""}</p></div>`)
        .join("")}</div>`;
    case "tools":
      return `<ul class="tools">${b.items.map((t) => `<li><strong>${esc(t.label)}</strong> – ${esc(t.text)}<br><span class="h">${esc(portal + t.href)}</span></li>`).join("")}</ul>`;
    case "tip":
      return `<div class="tip"><strong>${esc(b.title)}</strong><p>${rich(b.text)}</p></div>`;
  }
}

export function renderHandbookHtml(book: Handbook, meta: { name: string; coach: string; date: string; portal: string; done: string[] }, fontCss: string) {
  const done = new Set(meta.done);
  const toc = book.chapters.map((c, i) => `<li><span class="n">${two(i + 1)}</span><span class="tt">${esc(c.title)}</span></li>`).join("");
  const chapters = book.chapters
    .map(
      (c, i) => `<section class="chapter">
  <header><span class="num">${two(i + 1)}</span><h2>${esc(c.title)}</h2><p class="lead">${esc(c.lead)}</p></header>
  ${c.blocks.map((b) => block(b, done, meta.portal)).join("\n")}
</section>`,
    )
    .join("\n");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>
${fontCss}
@page { size: 148mm 210mm; margin: 17mm 15mm 19mm 15mm;
  @bottom-center { content: counter(page); font: 8pt "Source Sans 3", Arial, sans-serif; color: #8a7a5c; }
  @bottom-left { content: "Mein Handbuch"; font: 7pt "Source Sans 3", Arial, sans-serif; color: #b0a58f; letter-spacing: .08em; } }
@page :first { margin: 0; @bottom-center { content: none; } @bottom-left { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Source Serif 4", Georgia, serif; font-size: 9.6pt; line-height: 1.45; color: #1b2433; }
h2, h3, strong { font-family: "Source Sans 3", Arial, sans-serif; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
strong { font-weight: 700; }
h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: #1d3a66; margin: 4.5mm 0 2mm; break-after: avoid; }
.h { color: #6b6f7a; font-size: 8pt; line-height: 1.35; }

/* Einband */
.cover { position: relative; width: 148mm; height: 210mm; overflow: hidden; break-after: page; color: #fff;
  background: radial-gradient(120% 80% at 85% 0%, #23477a 0%, rgba(35,71,122,0) 60%), linear-gradient(160deg, #12284a 0%, #0a1628 70%); }
.cover .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 9mm 9mm; }
.cover .frame { position: absolute; inset: 9mm; border: .5pt solid rgba(226,189,125,.55); }
.cover .brand { position: absolute; top: 19mm; left: 19mm; display: flex; align-items: center; gap: 3mm; font-family: "Source Sans 3", Arial, sans-serif; }
.cover .mark { width: 11mm; height: 11mm; border-radius: 3mm; background: linear-gradient(135deg, #e9c88c, #b8863f); color: #0a1628; font-weight: 700; font-size: 16pt; display: flex; align-items: center; justify-content: center; }
.cover .word { font-size: 13pt; font-weight: 700; letter-spacing: -.01em; }
.cover .word small { display: block; font-size: 6.5pt; letter-spacing: .25em; text-transform: uppercase; color: rgba(255,255,255,.55); font-weight: 600; }
.cover .title { position: absolute; left: 19mm; right: 19mm; top: 74mm; }
.cover .eyebrow { font-family: "Source Sans 3", Arial, sans-serif; font-size: 7.5pt; letter-spacing: .28em; text-transform: uppercase; color: #e2bd7d; font-weight: 600; }
.cover h1 { font-family: "Source Sans 3", Arial, sans-serif; font-size: 30pt; line-height: 1.02; margin: 4mm 0 0; font-weight: 700; letter-spacing: -.02em; }
.cover .sub { font-size: 12.5pt; color: #f3d9a6; margin-top: 4mm; text-align: left; font-style: italic; }
.cover .rule { width: 22mm; height: 1.2mm; background: linear-gradient(90deg, #e9c88c, #b8863f); margin: 9mm 0 6mm; border-radius: 1mm; }
.cover .who { font-family: "Source Sans 3", Arial, sans-serif; font-size: 11pt; text-align: left; }
.cover .who span { display: block; font-size: 7.5pt; color: rgba(255,255,255,.55); letter-spacing: .12em; text-transform: uppercase; margin-bottom: 1mm; }
.cover .foot { position: absolute; left: 19mm; right: 19mm; bottom: 18mm; display: flex; justify-content: space-between; font-family: "Source Sans 3", Arial, sans-serif; font-size: 7pt; color: rgba(255,255,255,.55); letter-spacing: .06em; }
.cover .badge { border: .5pt solid rgba(226,189,125,.6); color: #e2bd7d; border-radius: 10mm; padding: .8mm 3mm; }

/* Widmung und Inhalt */
.front { break-after: page; }
.front .dear { margin-top: 6mm; font-size: 13pt; font-style: italic; color: #1d3a66; text-align: left; }
.front .intro { margin-bottom: 9mm; }
.front h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .18em; color: #b8863f; margin: 0 0 4mm; }
.toc { list-style: none; margin: 0; padding: 0; }
.toc li { display: flex; gap: 4mm; align-items: baseline; padding: 2.2mm 0; border-bottom: .4pt solid #e4ddcf; font-family: "Source Sans 3", Arial, sans-serif; font-size: 10pt; }
.toc .n { color: #b8863f; font-weight: 700; width: 7mm; }

/* Kurze Zeilen in Listen und Kästen linksbündig, damit keine großen Lücken entstehen; Fließtext im Blocksatz */
.tip p { text-align: left; }
/* Kapitel */
.chapter { break-before: page; }
.chapter header { margin-bottom: 6mm; padding-bottom: 4mm; border-bottom: .6pt solid #e2bd7d; }
.chapter .num { display: block; font-family: "Source Sans 3", Arial, sans-serif; font-size: 26pt; line-height: 1; font-weight: 700; color: #e2bd7d; }
.chapter h2 { font-size: 17pt; line-height: 1.1; margin: 2mm 0 1.5mm; color: #0a1628; letter-spacing: -.01em; }
.chapter .lead { font-style: italic; color: #5b6070; margin: 0; text-align: left; }
.checks, .dots, .tools { list-style: none; margin: 0 0 3mm; padding: 0; }
.checks li { display: flex; gap: 2.6mm; padding: 1.6mm 0; border-bottom: .3pt dotted #d8d0c0; break-inside: avoid; }
.checks .box { flex: none; width: 3.6mm; height: 3.6mm; margin-top: .6mm; border: .8pt solid #1d3a66; border-radius: .8mm; font: 700 7pt/3.2mm "Source Sans 3", Arial, sans-serif; text-align: center; color: #fff; }
.checks li.on .box { background: #24764a; border-color: #24764a; }
.checks .t, .checks .h { margin: 0; text-align: left; }
.checks .h { margin: .6mm 0 0; }
.dots li { position: relative; padding-left: 4mm; margin-bottom: 1.6mm; text-align: left; hyphens: auto; }
.dots li::before { content: ""; position: absolute; left: .4mm; top: 1.9mm; width: 1.4mm; height: 1.4mm; border-radius: 50%; background: #b8863f; }
.tools li { margin-bottom: 2mm; break-inside: avoid; }
.facts { width: 100%; border-collapse: separate; border-spacing: 1.6mm 0; margin: 0 -1.6mm 4mm; table-layout: fixed; }
.facts td { background: #eef2f8; border-radius: 2mm; padding: 2.4mm; vertical-align: top; }
.facts span { display: block; font: 600 6.4pt "Source Sans 3", Arial, sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #1d3a66; }
.facts strong { display: block; font-size: 11pt; margin: .6mm 0; color: #0a1628; }
.facts em { display: block; font-size: 7pt; line-height: 1.3; color: #5b6070; font-style: normal; }
.dates { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
.dates th { text-align: left; vertical-align: top; width: 34%; padding: 1.8mm 3mm 1.8mm 0; font: 700 8.4pt "Source Sans 3", Arial, sans-serif; color: #1d3a66; border-top: .4pt solid #e4ddcf; }
.dates td { padding: 1.8mm 0; border-top: .4pt solid #e4ddcf; }
.contact { padding: 2mm 0; border-bottom: .3pt solid #e4ddcf; break-inside: avoid; }
.contact p { margin: .4mm 0 0; text-align: left; }
.tip { background: #f6ead6; border-left: 1.2mm solid #b8863f; border-radius: 0 2mm 2mm 0; padding: 2.6mm 3.2mm; margin: 3mm 0 4mm; break-inside: avoid; }
.tip strong { display: block; color: #6e4f22; margin-bottom: .8mm; }
.tip p { margin: 0; }
.quote { border-left: 1.2mm solid #e2bd7d; padding: 1mm 0 1mm 3.5mm; margin: 2mm 0 4mm; }
.quote span { font: 600 6.6pt "Source Sans 3", Arial, sans-serif; text-transform: uppercase; letter-spacing: .14em; color: #b8863f; }
.quote p { font-size: 11.5pt; font-style: italic; text-align: left; margin: 1mm 0 0; }

/* Notizen */
.notes { break-before: page; }
.notes h2 { font: 700 17pt "Source Sans 3", Arial, sans-serif; margin: 0 0 6mm; }
.notes .line { height: 8.4mm; border-bottom: .4pt solid #d8d0c0; }
.colophon { margin-top: 8mm; font: 7.4pt "Source Sans 3", Arial, sans-serif; color: #8a8d94; text-align: left; }
</style></head><body>
<div class="cover">
  <div class="grid"></div>
  <div class="frame"></div>
  <div class="brand"><div class="mark">G</div><div class="word">gründarium<small>Coaching mit Plan</small></div></div>
  <div class="title">
    <div class="eyebrow">${esc(book.title)}</div>
    <h1>${esc(book.subtitle)}</h1>
    <div class="rule"></div>
    <div class="who"><span>Persönliches Exemplar für</span>${esc(meta.name)}</div>
  </div>
  <div class="foot"><span class="badge">${esc(book.badge)}</span><span>Stand ${esc(book.stand)}</span></div>
</div>
<div class="front">
  <p class="dear">Für ${esc(meta.name)}</p>
  <p class="intro">Dieses Büchlein ist für die Zeit während und nach dem Coaching gedacht: zum Nachschlagen, Abhaken und Mitnehmen. Die aktuelle Fassung findest du immer in deinem Portal unter „Mein Handbuch“.<br><em>${esc(meta.coach)}</em></p>
  <h2>Inhalt</h2>
  <ol class="toc">${toc}</ol>
</div>
${chapters}
<section class="notes">
  <h2>Notizen</h2>
  ${Array.from({ length: 16 }, () => `<div class="line"></div>`).join("")}
  <p class="colophon">Erstellt am ${esc(meta.date)} im gründarium Portal (${esc(meta.portal)}). Allgemeine Informationen, Stand ${esc(book.stand)}, keine Rechts- oder Steuerberatung. Verbindlich ist immer dein Bescheid.</p>
</section>
</body></html>`;
}
