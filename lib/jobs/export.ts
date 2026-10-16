import "server-only";
import ExcelJS from "exceljs";
import { APPLIED, channelLabel, statusLabel, type Application } from "./shared";

/*
 * Nachweis der Eigenbemühungen: alle Bewerbungen mit Datum, Arbeitgeber, Stelle, Art der Bewerbung und Ergebnis,
 * so wie Jobcenter und Arbeitsagentur ihn erwarten. Vorschläge und gemerkte Stellen gehören nicht hinein.
 */
type Meta = { name: string; coach: string; date: string };

const deDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
const RESULT: Record<string, string> = { beworben: "offen", gespraech: "Vorstellungsgespräch", zusage: "Zusage", absage: "Absage" };

export const appliedOnly = (apps: Application[]) =>
  apps.filter((a) => APPLIED.includes(a.status)).sort((a, b) => (a.applied_on ?? "9999").localeCompare(b.applied_on ?? "9999"));

export async function applicationsWorkbook(apps: Application[], meta: Meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "gründarium Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet("Bewerbungen", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  ws.columns = [{ width: 6 }, { width: 13 }, { width: 34 }, { width: 38 }, { width: 22 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 50 }];
  ws.getCell("A1").value = "Nachweis der Eigenbemühungen";
  ws.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF1F3A5F" } };
  ws.getCell("A2").value = `${meta.name} · Coach: ${meta.coach} · Stand ${meta.date}`;
  ws.getCell("A2").font = { color: { argb: "FF6B6F76" } };
  ws.getRow(4).values = ["Nr.", "Datum", "Arbeitgeber", "Stelle", "Ort", "Art", "Ergebnis", "Referenznummer", "Link"];
  ws.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(4).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }));
  appliedOnly(apps).forEach((a, i) => {
    const row = ws.getRow(5 + i);
    row.values = [i + 1, a.applied_on ? new Date(`${a.applied_on}T12:00:00Z`) : "", a.employer, a.title, a.location, channelLabel(a.channel), RESULT[a.status] ?? statusLabel(a.status), a.refnr ?? "", a.url ? { text: a.url, hyperlink: a.url } : ""];
    row.getCell(2).numFmt = "dd.mm.yyyy";
    row.alignment = { vertical: "top", wrapText: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function applicationsHtml(apps: Application[], meta: Meta, fontCss: string) {
  const list = appliedOnly(apps);
  const rows = list
    .map((a, i) => `<tr><td class="n">${i + 1}</td><td class="d">${esc(deDate(a.applied_on))}</td><td><b>${esc(a.employer || "–")}</b>${a.location ? `<br><span>${esc(a.location)}</span>` : ""}</td><td>${esc(a.title)}${a.refnr ? `<br><span>Ref.-Nr. ${esc(a.refnr)}</span>` : ""}</td><td>${esc(channelLabel(a.channel) || "–")}</td><td>${esc(RESULT[a.status] ?? statusLabel(a.status))}</td></tr>`)
    .join("");
  const counts = { all: list.length, talks: list.filter((a) => a.status === "gespraech" || a.status === "zusage").length };
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${fontCss}
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt "Source Sans 3", sans-serif; color: #6b717a; } @bottom-left { content: "${esc(meta.name).replace(/"/g, "")} · Nachweis der Eigenbemühungen"; font: 8pt "Source Sans 3", sans-serif; color: #6b717a; } }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Source Sans 3", Arial, sans-serif; font-size: 9.5pt; color: #1d2026; line-height: 1.35; }
h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 18pt; color: #1f3a5f; margin: 0 0 1mm; font-weight: 600; }
.meta { color: #5b616b; margin-bottom: 6mm; }
.sum { display: flex; gap: 8mm; margin-bottom: 5mm; }
.sum div { border-left: 1mm solid #1f3a5f; padding-left: 3mm; }
.sum b { display: block; font-size: 14pt; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #fff; background: #1f3a5f; padding: 2mm 2.5mm; }
td { padding: 2mm 2.5mm; border-bottom: .3mm solid #dfe3e8; vertical-align: top; }
tr { break-inside: avoid; }
td span { color: #6b717a; font-size: 8.5pt; }
.n { width: 8mm; color: #6b717a; } .d { width: 22mm; white-space: nowrap; }
.sign { margin-top: 16mm; display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; break-inside: avoid; }
.sign p { border-bottom: .3mm solid #9aa0a8; height: 9mm; margin: 0; }
.sign span { font-size: 8pt; color: #6b717a; }
.empty { padding: 8mm; text-align: center; color: #6b717a; border: .3mm dashed #c5cbd3; }
</style></head><body>
<h1>Nachweis der Eigenbemühungen</h1>
<p class="meta">${esc(meta.name)} · begleitet von ${esc(meta.coach)} · Stand ${esc(meta.date)}</p>
<div class="sum"><div><b>${counts.all}</b>Bewerbungen</div><div><b>${counts.talks}</b>Vorstellungsgespräche</div></div>
${list.length ? `<table><thead><tr><th>Nr.</th><th>Datum</th><th>Arbeitgeber</th><th>Stelle</th><th>Art</th><th>Ergebnis</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Noch keine Bewerbungen eingetragen.</p>`}
<div class="sign"><div><p></p><span>Ort, Datum</span></div><div><p></p><span>Unterschrift</span></div></div>
</body></html>`;
}
