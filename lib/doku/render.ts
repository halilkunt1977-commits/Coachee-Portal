/*
 * Beratungsdokumentation im Aufbau des AVOCONS-Formulars 701FO08: Kopf mit Teilnehmer und Bewilligung,
 * vier Termine je Blatt, UE-Summe mit Übertrag aufs nächste Blatt. Unterschriften bleiben leer
 * (Coachee unterschreibt jede Zeile, der Coach unten rechts).
 */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

export const ROWS_PER_SHEET = 4;
/** So viel Text passt in das Feld „Inhalt des Coachings“ einer Zeile */
export const DOC_TEXT_MAX = 340;

export type DokuRow = { held_on: string; units: number; text: string; online: boolean; time?: string };
export type DokuHead = { name: string; customerNo: string; measure: string; from: string | null; to: string | null; coach: string };

const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const ue = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function sheetsOf(rows: DokuRow[]) {
  const sheets: DokuRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) sheets.push(rows.slice(i, i + ROWS_PER_SHEET));
  return sheets.length ? sheets : [[]];
}

export function renderDokuHtml(head: DokuHead, rows: DokuRow[], fontCss = "") {
  const sheets = sheetsOf(rows);
  let carried = 0;
  const pages = sheets.map((sheet, n) => {
    const sum = sheet.reduce((a, r) => a + r.units, 0);
    const before = carried;
    carried += sum;
    const lines = Array.from({ length: ROWS_PER_SHEET }, (_, i) => sheet[i]).map(
      (r) => `<tr>
  <td class="d"><div class="box date">${r ? esc(day(r.held_on)) : ""}</div><div class="box ue">${r ? esc(ue(r.units)) : ""}</div></td>
  <td class="t">${r ? esc(r.text) : ""}</td>
  <td class="c">${r ? esc(head.coach).replace(" ", "<br>") : ""}</td>
  <td class="f"><span class="opt"><i class="${r?.online ? "on" : ""}"></i>online</span><span class="opt"><i class="${r && !r.online ? "on" : ""}"></i>präsenz</span></td>
  <td class="s"><small>Der Coachee bestätigt, dass er aktiv und bewusst, jede Unterschrift individuell geleistet hat.</small></td>
</tr>`,
    );
    return `<section class="sheet">
  <div class="head">
    <div class="line wide"><span>Beratungsdokumentation für:</span><b>${esc(head.name)}</b></div>
    <div class="line"><span>Kunden-Nummer:</span><b>${esc(head.customerNo)}</b></div>
    <div class="line"><span>Maßnahmeart:</span><b>${esc(head.measure)}</b></div>
    <div class="line"><span>Bewilligungszeitraum:</span><b>${esc(day(head.from))}</b><span class="bis">bis</span><b>${esc(day(head.to))}</b></div>
    <div class="line"><span>Hauptcoach:</span><b>${esc(head.coach)}</b></div>
  </div>
  <table class="rows">
    <thead><tr><th>Datum / UE</th><th>Inhalt des Coachings</th><th>Coach</th><th></th><th>Unterschrift Coachee</th></tr></thead>
    <tbody>${lines.join("")}
      <tr class="foot"><td colspan="4"><b class="big">Bitte beachten:</b><br>Nach Unterschrift von Coach und Coachee, bitte umgehend in den Coach-Ordner hochladen, oder per E-Mail an coach@avgs-coaching.de.<br><b>Spätestens alle 14 Tage.</b></td><td class="sig"><b>Unterschrift Coach</b></td></tr>
    </tbody>
  </table>
  <div class="sums">
    <div><span>Gesamt - UE (45 Min) auf diesem Blatt (Übertrag auf neues Blatt)</span><div class="box">${sheet.length ? esc(ue(sum)) : ""}</div></div>
    <div><span>Gesamt - UE Vorgängerblatt</span><div class="box">${n > 0 ? esc(ue(before)) : ""}</div></div>
    <div><span>Gesamt (UE / Unterrichtseinheiten a 45 Minuten)</span><div class="box">${n > 0 ? esc(ue(carried)) : ""}</div></div>
    <div class="nr"><span>Blatt Nr.:</span><div class="box big">${n + 1}</div></div>
  </div>
  <p class="form">Formular <b>701FO08_Beratungsdokumentation</b> Stand 27.01.2026</p>
</section>`;
  });

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Beratungsdokumentation ${esc(head.name)}</title><style>
${fontCss}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: #000; font-size: 9.5pt; }
.sheet { width: 210mm; height: 296mm; overflow: hidden; padding: 12mm 13mm 7mm 13mm; display: flex; flex-direction: column; break-after: page; }
.sheet:last-child { break-after: auto; }
.head { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; margin: 6mm 4mm 6mm 0; }
.line { display: flex; align-items: baseline; gap: 2.5mm; padding: 3mm 0 2mm; border-bottom: .6pt solid #000; font-size: 10.5pt; }
.line.wide { grid-column: 1 / -1; font-size: 13pt; }
.line b { font-weight: 400; font-size: 11.5pt; }
.line .bis { margin-left: 4mm; }
.rows { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rows th { text-align: left; font-size: 10pt; padding: 0 1.5mm 2mm; }
.rows th:nth-child(1) { width: 24mm; } .rows th:nth-child(2) { width: 70mm; } .rows th:nth-child(3) { width: 15mm; } .rows th:nth-child(4) { width: 17mm; }
.rows td { border: .6pt solid #b4c6e7; vertical-align: top; padding: 1.5mm; height: 39mm; }
.rows td.t { font-size: 9.5pt; line-height: 1.3; }
.rows td.c { font-size: 9pt; }
.rows td.f { text-align: center; }
.opt { display: flex; align-items: center; justify-content: center; gap: 1.5mm; margin: 4mm 0 9mm; font-size: 9pt; }
.opt i { flex: none; width: 3.2mm; height: 3.2mm; border: .6pt solid #4472c4; display: inline-block; position: relative; }
.opt i.on::after { content: "✓"; position: absolute; inset: -1.4mm 0 0 .3mm; font-style: normal; font-size: 10pt; }
.rows td.s { display: table-cell; vertical-align: bottom; }
.rows td.s small { display: block; font-size: 6pt; line-height: 1.35; }
.box { border: .7pt solid #4472c4; min-height: 7mm; padding: 1mm 1.5mm; font-size: 10pt; }
.d .date { border: 0; border-bottom: .6pt solid #b4c6e7; padding: 0 0 1.5mm; font-size: 10.5pt; }
.d .ue { width: 15mm; margin: 5mm 0 0 4mm; }
.rows tr.foot td { height: 28mm; font-size: 9pt; line-height: 1.35; padding-top: 6mm; }
.rows tr.foot td.sig { padding-top: 1.5mm; font-size: 9pt; }
.big { font-size: 11pt; }
.sums { margin-top: 3mm; display: grid; grid-template-columns: 1fr; gap: 1.5mm; position: relative; }
.sums > div { display: flex; align-items: center; gap: 4mm; font-size: 8.5pt; }
.sums > div > span { width: 96mm; }
.sums .box { width: 12mm; height: 9mm; }
.sums .nr { position: absolute; right: 0; top: 1mm; }
.sums .nr span { width: auto; color: #333; }
.sums .nr .box.big { font-size: 15pt; padding: 0 2mm; width: 15mm; height: 11mm; }
.form { margin-top: auto; font-size: 8pt; }
</style></head><body>${pages.join("\n")}</body></html>`;
}
