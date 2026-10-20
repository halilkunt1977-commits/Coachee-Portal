import { lines, paragraphs, type LetterView } from "./types";

/*
 * Anschreiben als A4-HTML nach DIN 5008 (Form B): Briefkopf, Anschriftfeld 45 mm von oben, Ort und Datum rechts,
 * fetter Betreff ohne das Wort „Betreff“, Text im Blocksatz. Dieselbe Funktion liefert Vorschau und PDF.
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

type Opts = { color: string; signature: string | null; fontCss: string };

export function renderLetterHtml(v: LetterView, o: Opts) {
  const c = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#1f3a5f";
  const contact = [v.senderStreet, v.senderCity, v.senderPhone && `Tel. ${v.senderPhone}`, v.senderEmail].filter(Boolean).map(esc).join('<i>·</i>');
  const back = [v.senderName, v.senderStreet, v.senderCity].filter(Boolean).map(esc).join(", ");
  const recipient = lines(v.recipient).map((l) => `<div>${esc(l)}</div>`).join("");
  const body = paragraphs(v.body).map((p) => `<p>${p.map(esc).join("<br>")}</p>`).join("");
  const attachments = lines(v.attachments);
  const sign = v.signature && o.signature ? `<img class="sig" src="${esc(o.signature)}" alt="Unterschrift">` : '<div class="nosig"></div>';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Anschreiben ${esc(v.senderName)}</title><style>
${o.fontCss}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: #fff; }
body { font-family: "Source Sans 3", Arial, sans-serif; font-size: 11pt; line-height: 1.42; color: #1f2329; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 20mm 20mm 20mm 25mm; }
.page { width: 210mm; min-height: 297mm; padding: 20mm 20mm 20mm 25mm; background: #fff; }
@media print { .page { width: auto; min-height: 0; padding: 0; } }
header { height: 25mm; border-bottom: .5mm solid ${c}; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 2.5mm; }
header h1 { font-size: 19pt; line-height: 1.1; font-weight: 700; color: ${c}; letter-spacing: -.01em; }
header .contact { margin-top: 1.5mm; font-size: 9pt; color: #4a5059; }
header .contact i { font-style: normal; margin: 0 1.6mm; color: #9aa0a8; }
.address { height: 45mm; width: 85mm; padding-top: 5mm; }
.address .back { font-size: 7pt; color: #6b717a; text-decoration: underline; text-underline-offset: .6mm; margin-bottom: 2.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.date { text-align: right; margin-top: 2mm; }
.subject { margin-top: 9mm; font-weight: 700; }
.ref { font-size: 10pt; color: #3d424a; }
.salutation { margin-top: 8mm; margin-bottom: 4mm; }
.body p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; margin-bottom: 3.2mm; orphans: 3; widows: 3; }
.closing { margin-top: 5mm; break-inside: avoid; }
.closing .sig { display: block; max-height: 18mm; max-width: 65mm; margin: 2mm 0 1mm; }
.closing .nosig { height: 14mm; }
.attachments { margin-top: 9mm; font-size: 10pt; break-inside: avoid; }
.attachments b { font-weight: 600; display: block; }
</style></head><body><div class="page">
<header><h1>${esc(v.senderName)}</h1><div class="contact">${contact}</div></header>
<div class="address">${back ? `<div class="back">${back}</div>` : ""}${recipient}</div>
<div class="date">${esc([v.place, v.date].filter(Boolean).join(", "))}</div>
<div class="subject">${esc(v.subject)}</div>${v.reference ? `<div class="ref">${esc(v.reference)}</div>` : ""}
<div class="salutation">${esc(v.salutation)}</div>
<div class="body">${body}</div>
<div class="closing"><div>${esc(v.closing)}</div>${sign}<div>${esc(v.senderName)}</div></div>
${attachments.length ? `<div class="attachments"><b>Anlagen</b>${attachments.map((a) => `<div>${esc(a)}</div>`).join("")}</div>` : ""}
</div></body></html>`;
}
