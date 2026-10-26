import { lines, paragraphs, type LetterView } from "./types";

/*
 * Anschreiben als A4-HTML nach DIN 5008 (Form B): Briefkopf, Anschriftfeld 45 mm von oben, Ort und Datum rechts,
 * fetter Betreff ohne das Wort „Betreff“, Text im Blocksatz. Dieselbe Funktion liefert Vorschau und PDF.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

/** forWord: nur zum Ausmessen für die Word-Datei; Arial läuft etwas breiter als Source Sans und Word setzt etwas anders, daher mit Reserve gemessen */
type Opts = { color: string; signature: string | null; fontCss: string; forWord?: boolean };

/*
 * Stufen für „passt auf eine Seite“ (lib/letter/fit.ts): je Stufe etwas kleinere Schrift, engere Zeilen und Abstände.
 * Stufe 0 ist der normale Satz mit 11 pt.
 */
export const FIT = [
  { fs: 11, lh: 1.42, gap: 3.2, subj: 9, sal: 8, close: 5, sig: 18, nosig: 14, att: 9, head: 25, addr: 45 },
  { fs: 10.75, lh: 1.38, gap: 3, subj: 8, sal: 7, close: 4.5, sig: 17, nosig: 13, att: 8, head: 25, addr: 45 },
  { fs: 10.5, lh: 1.34, gap: 2.8, subj: 7, sal: 6, close: 4, sig: 16, nosig: 12, att: 7, head: 24, addr: 45 },
  { fs: 10.25, lh: 1.3, gap: 2.5, subj: 6, sal: 5, close: 4, sig: 15, nosig: 11, att: 6, head: 23, addr: 45 },
  { fs: 10, lh: 1.27, gap: 2.3, subj: 6, sal: 5, close: 3.5, sig: 14, nosig: 10, att: 5, head: 22, addr: 45 },
  { fs: 9.75, lh: 1.24, gap: 2.1, subj: 5, sal: 4, close: 3, sig: 13, nosig: 10, att: 5, head: 21, addr: 44 },
  { fs: 9.5, lh: 1.22, gap: 2, subj: 5, sal: 4, close: 3, sig: 12, nosig: 9, att: 4, head: 20, addr: 43 },
  { fs: 9.25, lh: 1.2, gap: 1.8, subj: 4, sal: 3.5, close: 2.5, sig: 12, nosig: 8, att: 4, head: 20, addr: 42 },
  { fs: 9, lh: 1.18, gap: 1.6, subj: 4, sal: 3, close: 2.5, sig: 11, nosig: 8, att: 3, head: 19, addr: 41 },
];
const fitCss = FIT.map(
  (f, i) =>
    `html[data-fit="${i}"] { --fs: ${f.fs}pt; --lh: ${f.lh}; --gap: ${f.gap}mm; --subj: ${f.subj}mm; --sal: ${f.sal}mm; --close: ${f.close}mm; --sig: ${f.sig}mm; --nosig: ${f.nosig}mm; --att: ${f.att}mm; --head: ${f.head}mm; --addr: ${f.addr}mm; }`,
).join("\n");

export function renderLetterHtml(v: LetterView, o: Opts) {
  const c = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#1f3a5f";
  const contact = [v.senderStreet, v.senderCity, v.senderPhone && `Tel. ${v.senderPhone}`, v.senderEmail].filter(Boolean).map(esc).join('<i>·</i>');
  const back = [v.senderName, v.senderStreet, v.senderCity].filter(Boolean).map(esc).join(", ");
  const recipient = lines(v.recipient).map((l) => `<div>${esc(l)}</div>`).join("");
  const body = paragraphs(v.body).map((p) => `<p>${p.map(esc).join("<br>")}</p>`).join("");
  const attachments = lines(v.attachments);
  const sign = v.signature && o.signature ? `<img class="sig" src="${esc(o.signature)}" alt="Unterschrift">` : '<div class="nosig"></div>';
  return `<!doctype html><html lang="de" data-fit="0"><head><meta charset="utf-8"><title>Anschreiben ${esc(v.senderName)}</title><style>
${o.fontCss}
* { box-sizing: border-box; margin: 0; padding: 0; }
${fitCss}
html { background: #fff; }${o.forWord ? "\nbody { letter-spacing: .03em; } .content { padding-bottom: 8mm; }" : ""}
body { font-family: "Source Sans 3", Arial, sans-serif; font-size: var(--fs); line-height: var(--lh); color: #1f2329; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 20mm 20mm 20mm 25mm; }
.page { width: 210mm; min-height: 297mm; padding: 20mm 20mm 20mm 25mm; background: #fff; }
@media print { .page { width: auto; min-height: 0; padding: 0; } }
/* Notbremse: was selbst bei 9 pt nicht passt, wird am Seitenende abgeschnitten, damit es nie eine zweite Seite gibt */
html[data-overflow] .content { max-height: 257mm; overflow: hidden; }
header { height: var(--head); border-bottom: .5mm solid ${c}; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 2.5mm; }
header h1 { font-size: 19pt; line-height: 1.1; font-weight: 700; color: ${c}; letter-spacing: -.01em; }
header .contact { margin-top: 1.5mm; font-size: 9pt; color: #4a5059; }
header .contact i { font-style: normal; margin: 0 1.6mm; color: #9aa0a8; }
.address { height: var(--addr); width: 85mm; padding-top: 5mm; }
.address .back { font-size: 7pt; color: #6b717a; text-decoration: underline; text-underline-offset: .6mm; margin-bottom: 2.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.date { text-align: right; margin-top: 2mm; }
.subject { margin-top: var(--subj); font-weight: 700; }
.ref { font-size: 10pt; color: #3d424a; }
.salutation { margin-top: var(--sal); margin-bottom: calc(var(--sal) / 2); }
.body p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; margin-bottom: var(--gap); orphans: 3; widows: 3; }
.closing { margin-top: var(--close); break-inside: avoid; }
.closing .sig { display: block; max-height: var(--sig); max-width: 65mm; margin: 2mm 0 1mm; }
.closing .nosig { height: var(--nosig); }
.attachments { margin-top: var(--att); font-size: 10pt; break-inside: avoid; }
.attachments b { font-weight: 600; display: block; }
</style></head><body><div class="page"><div class="content">
<header><h1>${esc(v.senderName)}</h1><div class="contact">${contact}</div></header>
<div class="address">${back ? `<div class="back">${back}</div>` : ""}${recipient}</div>
<div class="date">${esc([v.place, v.date].filter(Boolean).join(", "))}</div>
<div class="subject">${esc(v.subject)}</div>${v.reference ? `<div class="ref">${esc(v.reference)}</div>` : ""}
<div class="salutation">${esc(v.salutation)}</div>
<div class="body">${body}</div>
<div class="closing"><div>${esc(v.closing)}</div>${sign}<div>${esc(v.senderName)}</div></div>
${attachments.length ? `<div class="attachments"><b>Anlagen</b>${attachments.map((a) => `<div>${esc(a)}</div>`).join("")}</div>` : ""}
</div></div></body></html>`;
}
