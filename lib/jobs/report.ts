import type { JobAnalysis } from "./analysis";

/* Bericht zur Stelle für den Coachee: Einschätzung des Coachs, ohne Score und ohne interne Hinweise */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
const ul = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");

export function renderJobReportHtml(a: JobAnalysis, meta: { title: string; employer: string; location: string; coachee: string; coach: string; date: string }, fontCss = "") {
  const paragraphs = a.report.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Stelle ${esc(meta.title)}</title><style>
${fontCss}
@page { size: A4; margin: 20mm 20mm 18mm 22mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Source Sans 3", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #16181d; }
.kicker { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #b88a4a; }
h1 { font-family: "Source Serif 4", Georgia, serif; color: #1f3a5f; font-size: 21pt; line-height: 1.2; margin: 2mm 0 1mm; }
.meta { color: #5d6068; margin-bottom: 7mm; padding-bottom: 4mm; border-bottom: 1.2pt solid #1f3a5f; }
h2 { font-family: "Source Serif 4", Georgia, serif; color: #1f3a5f; font-size: 12.5pt; margin: 6mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; }
ul { margin: 0 0 2mm; padding-left: 5mm; } li { margin-bottom: 1mm; }
.foot { margin-top: 10mm; font-size: 9pt; color: #5d6068; }
</style></head><body>
<div class="kicker">Einschätzung zur Stelle</div>
<h1>${esc(meta.title)}</h1>
<div class="meta">${esc([meta.employer, meta.location].filter(Boolean).join(" · "))}<br>Für ${esc(meta.coachee)} · ${esc(meta.date)}</div>
${paragraphs}
${a.strengths.length ? `<h2>Das bringst du mit</h2>${ul(a.strengths)}` : ""}
${a.next_steps.length ? `<h2>Deine nächsten Schritte</h2>${ul(a.next_steps)}` : ""}
${a.letter_tips.length ? `<h2>Das gehört ins Anschreiben</h2>${ul(a.letter_tips)}` : ""}
${a.interview.length ? `<h2>Darauf solltest du im Gespräch vorbereitet sein</h2>${ul(a.interview)}` : ""}
<p class="foot">Dein Coach ${esc(meta.coach)}</p>
</body></html>`;
}
