import type { CvData, TemplateKey } from "./types";

/*
 * Erzeugt das komplette HTML eines Lebenslaufs im A4-Format. Dieselbe Funktion liefert die Live-Vorschau im Editor
 * und die Vorlage für das PDF, damit beide exakt gleich aussehen. Flächen, die über mehrere Seiten laufen
 * (Seitenleisten), sind als Hintergrund von <html> gemalt, damit sie auch auf Seite 2 durchgehen.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
const month = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : esc(v));
const range = (start: string, end: string, current = false) => [start && month(start), current ? "heute" : end && month(end)].filter(Boolean).join(" – ");
const lines = (t: string) => t.split("\n").map((l) => l.replace(/^[\s•\-–*]+/, "").trim()).filter(Boolean);
const bullets = (t: string) => (lines(t).length ? `<ul>${lines(t).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "");
const has = (v: string | unknown[]) => (Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim()));
const today = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Farbe aufhellen (amount > 0, Richtung Weiß) oder abdunkeln (amount < 0). Hex rein, Hex raus. */
export function tint(hex: string, amount: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#eef2f7";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

type Opts = { template: TemplateKey; color: string; photo: string | null; fontCss: string; signature?: string | null };
type Ctx = { d: CvData; o: Opts; c: string; p: CvData["personal"]; name: string };

// ---------- Bausteine ----------

function photo(x: Ctx, cls = "photo") {
  if (!x.o.photo) return "";
  const { zoom, x: px, y: py } = x.d.photo;
  return `<div class="${cls}"><img src="${esc(x.o.photo)}" alt="" style="object-position:${px}% ${py}%;transform:scale(${zoom});transform-origin:${px}% ${py}%"></div>`;
}

function contactItems(p: CvData["personal"]) {
  const born = [p.birthDate, p.birthPlace && `in ${p.birthPlace}`].filter(Boolean).join(" ");
  return [
    p.phone && ["Telefon", p.phone],
    p.email && ["E-Mail", p.email],
    (p.street || p.zip || p.city) && ["Adresse", [p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
    born && ["Geboren", born],
    p.nationality && ["Nationalität", p.nationality],
    p.license && ["Führerschein", p.license],
    p.web && ["Web", p.web],
  ].filter(Boolean) as [string, string][];
}

const contactList = (p: CvData["personal"]) => contactItems(p).map(([k, v]) => `<p class="ci"><span>${k}</span>${esc(v)}</p>`).join("");
const contactInline = (p: CvData["personal"], sep = "") => contactItems(p).map(([, v]) => `<span>${esc(v)}</span>`).join(sep);

/** Abschnitt mit Überschrift. Die Überschrift bleibt beim Seitenumbruch immer mit dem ersten Eintrag zusammen. */
function section(title: string, body: string | string[], cls = "") {
  const items = (Array.isArray(body) ? body : [body]).filter((b) => b.trim());
  if (!items.length) return "";
  return `<section class="${cls}"><div class="keep"><h3>${esc(title)}</h3>${items[0]}</div>${items.slice(1).join("")}</section>`;
}

function entries(d: CvData, kind: "experience" | "education") {
  const list =
    kind === "experience"
      ? d.experience.map((e) => ({ when: range(e.start, e.end, e.current), title: e.title, org: [e.company, e.location].filter(Boolean).join(", "), body: bullets(e.bullets) }))
      : d.education.map((e) => ({ when: range(e.start, e.end), title: e.degree, org: [e.school, e.location].filter(Boolean).join(", "), body: e.detail ? `<p>${esc(e.detail)}</p>` : "" }));
  return list.map((e) => `<div class="entry"><div class="when">${e.when}</div><div class="what"><h4>${esc(e.title)}</h4>${e.org ? `<p class="org">${esc(e.org)}</p>` : ""}${e.body}</div></div>`);
}

const certificates = (d: CvData) =>
  d.certificates
    .filter((c) => c.name)
    .map((c) => `<div class="entry"><div class="when">${esc(c.year)}</div><div class="what"><h4 class="light">${esc(c.name)}</h4>${c.institution ? `<p class="org">${esc(c.institution)}</p>` : ""}</div></div>`);

function dots(level: number, on: string, off: string) {
  if (!level) return "";
  return `<span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i style="background:${i <= level ? on : off}"></i>`).join("")}</span>`;
}

const skillName = (d: CvData) => d.skills.filter((s) => s.name);
const skillDots = (d: CvData, on: string, off: string) => skillName(d).map((s) => `<div class="skill"><span>${esc(s.name)}</span>${dots(s.level, on, off)}</div>`).join("");
const skillBars = (d: CvData) => skillName(d).map((s) => `<div class="skill"><span>${esc(s.name)}</span>${s.level ? `<div class="bar"><b style="width:${s.level * 20}%"></b></div>` : ""}</div>`).join("");
const skillTags = (d: CvData) => (skillName(d).length ? `<div class="tags">${skillName(d).map((s) => `<span>${esc(s.name)}</span>`).join("")}</div>` : "");
const languageList = (d: CvData) => d.languages.filter((l) => l.name).map((l) => `<p class="ci"><b>${esc(l.name)}</b>${l.level ? ` · ${esc(l.level)}` : ""}</p>`).join("");
const languageInline = (d: CvData) => (d.languages.some((l) => l.name) ? `<p>${d.languages.filter((l) => l.name).map((l) => `${esc(l.name)}${l.level ? ` (${esc(l.level)})` : ""}`).join(" · ")}</p>` : "");
const interests = (d: CvData) => (has(d.interests) ? `<p>${esc(d.interests)}</p>` : "");
const summary = (d: CvData) => (has(d.summary) ? `<p class="summary">${esc(d.summary)}</p>` : "");

/** Die Hauptspalte: Profil, Erfahrung, Ausbildung, Weiterbildung */
const mainSections = (d: CvData) =>
  [section("Profil", summary(d)), section("Berufserfahrung", entries(d, "experience")), section("Ausbildung", entries(d, "education")), section("Weiterbildung und Zertifikate", certificates(d))].join("");

function signature(x: Ctx) {
  if (!x.d.signature) return "";
  return `<div class="signature"><div><p>${x.d.place ? `${esc(x.d.place)}, ${today()}` : "&nbsp;"}</p><span>Ort, Datum</span></div><div><p>${x.o.signature && x.d.signatureImage ? `<img src="${esc(x.o.signature)}" alt="Unterschrift">` : "&nbsp;"}</p><span>Unterschrift</span></div></div>`;
}

const BASE = (o: Opts) => `
${o.fontCss}
@page { size: A4; margin: 12mm 0 12mm; }
@page :first { margin-top: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Source Sans 3", "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.45; color: #1d2026; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { background: #fff; }
.page { width: 210mm; position: relative; }
@media screen { .page { min-height: 297mm; } }
h1, h2, h3, h4, p { margin: 0; }
ul { margin: 1.5mm 0 0; padding-left: 4.2mm; }
li { margin: 0.6mm 0; }
.entry { display: grid; grid-template-columns: 30mm 1fr; gap: 4mm; margin-bottom: 4mm; break-inside: avoid; }
.when { color: #5b616b; font-size: 9pt; padding-top: 0.6mm; font-variant-numeric: tabular-nums; }
h4 { font-size: 10.5pt; font-weight: 700; }
h4.light { font-weight: 600; }
.org { color: #5b616b; }
section { margin-bottom: 6mm; }
.keep { break-inside: avoid; }
.summary { white-space: pre-line; }
.photo { overflow: hidden; flex: none; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ci { margin-bottom: 1.8mm; word-break: break-word; }
.ci span { display: block; font-size: 8pt; opacity: .72; }
.skill { display: flex; justify-content: space-between; align-items: center; gap: 2mm; margin-bottom: 1.8mm; break-inside: avoid; }
.dots { display: inline-flex; gap: 1.2mm; flex: none; }
.dots i { width: 2.4mm; height: 2.4mm; border-radius: 50%; display: inline-block; }
.tags { display: flex; flex-wrap: wrap; gap: 1.5mm; }
.tags span { padding: .6mm 2.4mm; border-radius: 3mm; font-size: 9pt; }
.signature { margin-top: 10mm; display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; break-inside: avoid; max-width: 140mm; }
.signature p { border-bottom: .3mm solid #9aa0a8; padding-bottom: 1mm; min-height: 9mm; display: flex; align-items: flex-end; }
.signature > div { display: flex; flex-direction: column; justify-content: flex-end; }
.signature p img { display: block; max-height: 16mm; max-width: 62mm; margin-bottom: -1.5mm; }
.signature span { display: block; font-size: 8pt; color: #6b717a; margin-top: 1mm; }
`;

// ---------- 1 Modern: farbige Seitenleiste links ----------
function modern(x: Ctx) {
  const { d, c, p } = x;
  const side = [
    photo(x),
    `<div class="block"><h3>Kontakt</h3>${contactList(p)}</div>`,
    skillName(d).length ? `<div class="block"><h3>Kenntnisse</h3>${skillDots(d, "#fff", "rgba(255,255,255,.28)")}</div>` : "",
    languageList(d) ? `<div class="block"><h3>Sprachen</h3>${languageList(d)}</div>` : "",
    interests(d) ? `<div class="block"><h3>Interessen</h3>${interests(d)}</div>` : "",
  ].join("");
  return `<style>${BASE(x.o)}
  html { background: linear-gradient(to right, ${c} 0 68mm, #fff 68mm); }
  .page { display: grid; grid-template-columns: 68mm 1fr; }
  aside { color: #fff; padding: 16mm 8mm 12mm 10mm; }
  aside h3 { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; opacity: .75; margin-bottom: 2.5mm; font-weight: 600; }
  aside .block { margin-bottom: 8mm; }
  .photo { width: 42mm; height: 42mm; border-radius: 50%; margin: 0 auto 9mm; border: 1.2mm solid rgba(255,255,255,.25); }
  main { padding: 16mm 14mm 12mm 12mm; }
  h1 { font-size: 26pt; line-height: 1.05; color: ${c}; font-weight: 700; letter-spacing: -.01em; }
  h2 { font-size: 12pt; font-weight: 400; color: #5b616b; margin: 2mm 0 9mm; }
  main h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: .1em; color: ${c}; border-bottom: .4mm solid ${tint(c, 0.75)}; padding-bottom: 1.5mm; margin-bottom: 4mm; }
  .entry { grid-template-columns: 26mm 1fr; }
  </style>
  <div class="page"><aside>${side}</aside><main><h1>${esc(p.firstName)}<br>${esc(p.lastName)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : '<div style="height:8mm"></div>'}${mainSections(d)}${signature(x)}</main></div>`;
}

// ---------- 2 Klassisch: eine Spalte, Serifen ----------
function klassisch(x: Ctx) {
  const { d, c, p } = x;
  const extra = [
    section("Kenntnisse", skillName(d).length ? `<div class="grid2">${skillDots(d, c, "#dfe3e8")}</div>` : ""),
    section("Sprachen", d.languages.filter((l) => l.name).map((l) => `<div class="entry"><div class="when">${esc(l.name)}</div><div class="what"><p>${esc(l.level)}</p></div></div>`).join("")),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  .page { padding: 18mm 20mm 14mm; }
  header { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; padding-bottom: 6mm; border-bottom: .6mm solid ${c}; margin-bottom: 8mm; }
  h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 27pt; font-weight: 600; line-height: 1.1; color: #15181d; }
  h2 { font-size: 12pt; color: ${c}; font-weight: 600; margin-top: 1.5mm; }
  .contact { margin-top: 4mm; color: #4a505a; font-size: 9.3pt; display: flex; flex-wrap: wrap; gap: 1mm 5mm; }
  .photo { width: 34mm; height: 44mm; border-radius: 1.5mm; }
  h3 { font-family: "Source Serif 4", Georgia, serif; font-size: 13pt; color: ${c}; font-weight: 600; margin-bottom: 3.5mm; }
  .entry { grid-template-columns: 34mm 1fr; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; }
  </style>
  <div class="page"><header><div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></div>${photo(x)}</header>${mainSections(d)}${extra}${signature(x)}</div>`;
}

// ---------- 3 Kreativ: farbiger Kopf, Seitenleiste rechts ----------
function kreativ(x: Ctx) {
  const { d, c, p } = x;
  const side = [section("Kontakt", contactList(p)), section("Kenntnisse", skillBars(d)), section("Sprachen", languageList(d)), section("Interessen", interests(d))].join("");
  return `<style>${BASE(x.o)}
  html { background: linear-gradient(to left, ${tint(c, 0.9)} 0 62mm, #fff 62mm); }
  .head { background: ${c}; color: #fff; padding: 14mm 16mm 12mm; display: flex; align-items: center; gap: 9mm; }
  .photo { width: 36mm; height: 36mm; border-radius: 6mm; border: 1mm solid rgba(255,255,255,.35); }
  h1 { font-size: 28pt; font-weight: 700; line-height: 1.05; letter-spacing: -.015em; }
  h2 { font-size: 12.5pt; font-weight: 400; opacity: .85; margin-top: 2mm; }
  .cols { display: grid; grid-template-columns: 1fr 62mm; }
  main { padding: 10mm 9mm 12mm 16mm; }
  aside { padding: 10mm 10mm 12mm 8mm; }
  h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .12em; color: ${c}; margin-bottom: 3.5mm; font-weight: 700; }
  main h3::after { content: ""; display: block; width: 12mm; height: .9mm; background: ${c}; margin-top: 1.5mm; border-radius: 1mm; }
  .ci span { color: #5b616b; opacity: 1; }
  .skill { display: block; margin-bottom: 2.4mm; }
  .bar { height: 1.6mm; background: ${tint(c, 0.7)}; border-radius: 1mm; margin-top: .8mm; overflow: hidden; }
  .bar b { display: block; height: 100%; background: ${c}; }
  .entry { grid-template-columns: 24mm 1fr; }
  .signature { grid-template-columns: 1fr; gap: 6mm; }
  </style>
  <div class="page"><div class="head">${photo(x)}<div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}</div></div><div class="cols"><main>${mainSections(d)}${signature(x)}</main><aside>${side}</aside></div></div>`;
}

// ---------- 4 Elegant: zentrierter Kopf, feine Linien ----------
function elegant(x: Ctx) {
  const { d, c, p } = x;
  const extra = [
    section("Kenntnisse", skillName(d).length ? `<div class="grid2">${skillDots(d, c, "#e3e5e9")}</div>` : ""),
    section("Sprachen", languageInline(d)),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  .page { padding: 16mm 22mm 14mm; }
  header { text-align: center; margin-bottom: 9mm; }
  .photo { width: 30mm; height: 30mm; border-radius: 50%; margin: 0 auto 5mm; border: .5mm solid ${c}; padding: 1mm; background: #fff; }
  .photo img { border-radius: 50%; }
  h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 25pt; font-weight: 400; letter-spacing: .14em; text-transform: uppercase; color: #15181d; }
  h2 { font-size: 10.5pt; letter-spacing: .22em; text-transform: uppercase; color: ${c}; margin-top: 2mm; font-weight: 600; }
  .contact { margin-top: 5mm; padding: 2.5mm 0; border-top: .3mm solid #cfd3d9; border-bottom: .3mm solid #cfd3d9; color: #4a505a; font-size: 9pt; display: flex; flex-wrap: wrap; justify-content: center; gap: 1mm 6mm; }
  h3 { font-family: "Source Serif 4", Georgia, serif; font-size: 12pt; font-weight: 400; letter-spacing: .18em; text-transform: uppercase; color: ${c}; display: flex; align-items: center; gap: 4mm; margin-bottom: 4mm; }
  h3::after { content: ""; flex: 1; height: .3mm; background: ${tint(c, 0.7)}; }
  .entry { grid-template-columns: 32mm 1fr; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; }
  .signature { margin-left: auto; margin-right: auto; }
  </style>
  <div class="page"><header>${photo(x)}<h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></header>${mainSections(d)}${extra}${signature(x)}</div>`;
}

// ---------- 5 Zeitstrahl: Stationen als Zeitleiste ----------
function zeitstrahl(x: Ctx) {
  const { d, c, p } = x;
  const side = [
    photo(x),
    section("Kontakt", contactList(p)),
    section("Kenntnisse", skillBars(d)),
    section("Sprachen", languageList(d)),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  html { background: linear-gradient(to right, #f3f4f6 0 64mm, #fff 64mm); }
  .page { display: grid; grid-template-columns: 64mm 1fr; }
  aside { padding: 14mm 8mm 12mm 10mm; }
  .photo { width: 40mm; height: 48mm; border-radius: 2mm; margin: 0 auto 8mm; }
  aside h3 { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: ${c}; margin-bottom: 2.5mm; }
  .bar { height: 1.4mm; background: #dde0e5; border-radius: 1mm; margin-top: .8mm; overflow: hidden; }
  .bar b { display: block; height: 100%; background: ${c}; }
  .skill { display: block; }
  main { padding: 14mm 14mm 12mm 12mm; }
  h1 { font-size: 27pt; font-weight: 700; line-height: 1.05; color: #15181d; }
  h1 b { color: ${c}; }
  h2 { font-size: 12pt; color: #5b616b; font-weight: 400; margin: 2mm 0 8mm; }
  main h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: .1em; color: #15181d; margin-bottom: 4mm; }
  main .entry { display: block; position: relative; padding: 0 0 4mm 7mm; margin: 0; border-left: .5mm solid ${tint(c, 0.6)}; margin-left: 1.6mm; }
  main .entry::before { content: ""; position: absolute; left: -1.85mm; top: 1mm; width: 3.2mm; height: 3.2mm; border-radius: 50%; background: #fff; border: .7mm solid ${c}; }
  main section > .entry:last-child, main .keep:last-child > .entry { border-left-color: transparent; }
  main .when { color: ${c}; font-weight: 600; padding: 0 0 .5mm; }
  </style>
  <div class="page"><aside>${side}</aside><main><h1>${esc(p.firstName)} <b>${esc(p.lastName)}</b></h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : '<div style="height:7mm"></div>'}${mainSections(d)}${signature(x)}</main></div>`;
}

// ---------- 6 Kontrast: dunkler Kopf, Akzentfarbe ----------
function kontrast(x: Ctx) {
  const { d, c, p } = x;
  const side = [section("Kenntnisse", skillDots(d, c, "#dfe2e6")), section("Sprachen", languageList(d)), section("Interessen", interests(d))].join("");
  return `<style>${BASE(x.o)}
  html { background: linear-gradient(to right, #fff 0 calc(210mm - 64mm), #f5f5f4 calc(210mm - 64mm)); }
  .head { background: #1b1e24; color: #fff; padding: 13mm 16mm 11mm; display: flex; gap: 8mm; align-items: center; border-bottom: 2.2mm solid ${c}; }
  .photo { width: 34mm; height: 34mm; border-radius: 50%; border: 1mm solid ${c}; }
  h1 { font-size: 27pt; font-weight: 700; line-height: 1.05; }
  h2 { font-size: 12pt; color: ${tint(c, 0.55)}; font-weight: 600; margin-top: 1.5mm; letter-spacing: .02em; }
  .contact { margin-top: 4mm; display: flex; flex-wrap: wrap; gap: 1mm 5mm; font-size: 9pt; color: #c9ccd2; }
  .cols { display: grid; grid-template-columns: 1fr 64mm; }
  main { padding: 10mm 10mm 12mm 16mm; }
  aside { padding: 10mm 10mm 12mm 8mm; }
  h3 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 3.5mm; color: #1b1e24; display: flex; align-items: center; gap: 2.5mm; }
  h3::before { content: ""; width: 2.4mm; height: 2.4mm; background: ${c}; border-radius: .5mm; }
  .entry { grid-template-columns: 25mm 1fr; }
  .when { color: ${c}; font-weight: 600; }
  .signature { grid-template-columns: 1fr; gap: 6mm; }
  </style>
  <div class="page"><div class="head">${photo(x)}<div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></div></div><div class="cols"><main>${mainSections(d)}${signature(x)}</main><aside>${side}</aside></div></div>`;
}

// ---------- 7 Linie: farbige Kante links, Blöcke mit Balken ----------
function linie(x: Ctx) {
  const { d, c, p } = x;
  const extra = [
    section("Kenntnisse", skillName(d).length ? `<div class="grid2">${skillDots(d, c, "#e0e3e8")}</div>` : ""),
    section("Sprachen", languageInline(d)),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  html { background: linear-gradient(to right, ${c} 0 7mm, #fff 7mm); }
  .page { padding: 16mm 18mm 14mm 24mm; }
  header { display: flex; justify-content: space-between; gap: 8mm; margin-bottom: 9mm; }
  h1 { font-size: 30pt; font-weight: 700; line-height: 1; letter-spacing: -.02em; color: #15181d; }
  h2 { font-size: 12.5pt; color: ${c}; font-weight: 600; margin-top: 2.5mm; }
  .contact { margin-top: 5mm; display: grid; grid-template-columns: 1fr 1fr; gap: .5mm 8mm; font-size: 9.2pt; color: #4a505a; }
  .photo { width: 36mm; height: 42mm; }
  h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: .1em; color: ${c}; border-left: 1.4mm solid ${c}; padding-left: 3mm; margin-bottom: 4mm; line-height: 1.2; }
  .entry { grid-template-columns: 30mm 1fr; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; }
  </style>
  <div class="page"><header><div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></div>${photo(x)}</header>${mainSections(d)}${extra}${signature(x)}</div>`;
}

// ---------- 8 Akzent: Initialen oder Foto, farbige Datumsspalte ----------
function akzent(x: Ctx) {
  const { d, c, p } = x;
  const initials = `${(p.firstName[0] ?? "").toUpperCase()}${(p.lastName[0] ?? "").toUpperCase()}`;
  const badge = x.o.photo ? photo(x) : initials ? `<div class="mono">${esc(initials)}</div>` : "";
  const extra = [
    section("Kenntnisse", skillTags(d)),
    section("Sprachen", languageInline(d)),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  .page { padding: 15mm 18mm 14mm; }
  header { display: flex; gap: 7mm; align-items: center; padding-bottom: 7mm; margin-bottom: 8mm; border-bottom: .3mm solid #d6d9de; }
  .photo, .mono { width: 30mm; height: 30mm; border-radius: 50%; }
  .mono { background: ${c}; color: #fff; display: grid; place-items: center; font-size: 22pt; font-weight: 700; letter-spacing: .04em; flex: none; }
  h1 { font-size: 26pt; font-weight: 700; line-height: 1.05; color: ${c}; }
  h2 { font-size: 12pt; color: #3d424a; margin-top: 1.5mm; font-weight: 600; }
  .contact { margin-top: 3mm; display: flex; flex-wrap: wrap; gap: 1mm 5mm; color: #5b616b; font-size: 9pt; }
  section { display: grid; grid-template-columns: 34mm 1fr; column-gap: 4mm; }
  section > :not(.keep), .keep > :not(h3) { grid-column: 2; }
  .keep { grid-column: 1 / -1; display: grid; grid-template-columns: 34mm 1fr; column-gap: 4mm; }
  h3 { grid-column: 1; grid-row: 1; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .12em; color: ${c}; padding-top: .8mm; }
  .entry { grid-template-columns: 1fr; gap: 0; }
  .when { color: ${c}; font-weight: 600; padding: 0; }
  .tags span { background: ${tint(c, 0.86)}; color: ${tint(c, -0.2)}; }
  </style>
  <div class="page"><header>${badge}<div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></div></header>${mainSections(d)}${extra}${signature(x)}</div>`;
}

// ---------- 9 Kompakt: viel Inhalt, kleinere Schrift ----------
function kompakt(x: Ctx) {
  const { d, c, p } = x;
  const bottom = [section("Kenntnisse", skillDots(d, c, "#e0e3e8")), section("Sprachen", languageList(d)), section("Interessen", interests(d))].filter(Boolean).join("");
  return `<style>${BASE(x.o)}
  body { font-size: 9.2pt; line-height: 1.38; }
  .page { padding: 12mm 15mm 12mm; }
  header { display: flex; gap: 6mm; align-items: center; background: ${tint(c, 0.9)}; border-radius: 2.5mm; padding: 6mm 7mm; margin-bottom: 6mm; }
  .photo { width: 26mm; height: 30mm; border-radius: 1.5mm; }
  h1 { font-size: 21pt; font-weight: 700; line-height: 1.05; color: ${c}; }
  h2 { font-size: 11pt; color: #3d424a; margin-top: 1mm; font-weight: 600; }
  .contact { margin-top: 2.5mm; display: flex; flex-wrap: wrap; gap: .5mm 4.5mm; color: #4a505a; font-size: 8.6pt; }
  h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .1em; color: ${c}; border-bottom: .3mm solid ${tint(c, 0.7)}; padding-bottom: 1mm; margin-bottom: 2.6mm; }
  section { margin-bottom: 4.5mm; }
  .entry { grid-template-columns: 26mm 1fr; margin-bottom: 2.8mm; gap: 3mm; }
  li { margin: .3mm 0; }
  .bottom { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 7mm; }
  .skill { margin-bottom: 1.2mm; }
  .signature { margin-top: 7mm; }
  </style>
  <div class="page"><header>${photo(x)}<div><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<div class="contact">${contactInline(p)}</div></div></header>${mainSections(d)}${bottom ? `<div class="bottom">${bottom}</div>` : ""}${signature(x)}</div>`;
}

// ---------- 10 Schlicht: für Bewerbungsportale (ATS), ohne Grafik und ohne Foto ----------
function schlicht(x: Ctx) {
  const { d, c, p } = x;
  const extra = [
    section("Kenntnisse", skillName(d).length ? `<p>${skillName(d).map((s) => esc(s.name)).join(" · ")}</p>` : ""),
    section("Sprachen", languageInline(d)),
    section("Interessen", interests(d)),
  ].join("");
  return `<style>${BASE(x.o)}
  .page { padding: 16mm 18mm 14mm; }
  h1 { font-size: 22pt; font-weight: 700; }
  h2 { font-size: 11.5pt; font-weight: 400; margin-top: 1mm; }
  .contact { margin: 3mm 0 7mm; color: #3d424a; }
  h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .1em; color: ${c}; border-bottom: .3mm solid #c9ced6; padding-bottom: 1mm; margin-bottom: 3mm; }
  </style>
  <div class="page"><h1>${esc(x.name)}</h1>${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}<p class="contact">${contactItems(p).map(([, v]) => esc(v)).join(" | ")}</p>${mainSections(d)}${extra}${signature(x)}</div>`;
}

const RENDERERS: Record<TemplateKey, (x: Ctx) => string> = { modern, klassisch, kreativ, elegant, zeitstrahl, kontrast, linie, akzent, kompakt, schlicht };

export function renderCvHtml(d: CvData, o: Opts) {
  const opts = o.template === "schlicht" ? { ...o, photo: null } : o;
  const x: Ctx = { d, o: opts, c: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#1f3a5f", p: d.personal, name: [d.personal.firstName, d.personal.lastName].filter(Boolean).join(" ") };
  const body = (RENDERERS[o.template] ?? modern)(x);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Lebenslauf ${esc(x.name)}</title></head><body>${body}</body></html>`;
}
