// Leitfaden „Finanzierung über Bank und Förderung“ für den Coachee: Ablauf, Voraussetzungen, Unterlagen,
// Förderprogramme bundesweit und im eigenen Bundesland mit Zinsen, die eigenen Zahlen und Fragen fürs Bankgespräch.
import { eigenmittel, ersteRate, kapitaldienst, type BankInfo } from "./bank";
import { calculate, eur, financeIsEmpty, pct, type FinanceInput } from "./finance";
import { BANK_ABLAUF, BANK_UNTERLAGEN, BANK_VORAUSSETZUNGEN, BUNDESWEIT, FOERDER_STAND, landOf, type Programm } from "./foerderung";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

function programmTable(list: Programm[]) {
  return `<table><thead><tr><th style="width:30%">Programm</th><th>Was es bringt</th><th style="width:24%">Wo beantragen</th></tr></thead><tbody>${list
    .map((p) => `<tr><td><b>${esc(p.name)}</b><br><span class="tag">${esc(p.art)}</span>${p.url ? `<br><span class="url">${esc(p.url)}</span>` : ""}</td><td>${esc(p.text)}${p.zins ? `<br><span class="zins">Zins: ${esc(p.zins)}</span>` : ""}</td><td>${esc(p.wo)}</td></tr>`)
    .join("")}</tbody></table>`;
}

export function bankLeitfadenHtml(name: string, f: FinanceInput, b: BankInfo) {
  const land = landOf(b.land);
  const hasFinance = !financeIsEmpty(f);
  const r = calculate(f);
  const kd = kapitaldienst(f, r);
  const loans = f.financing.filter((x) => x.kind === "darlehen" && x.amount > 0);
  const eigen = eigenmittel(f);
  const zahlen = hasFinance
    ? `<h2>Deine Finanzierung in Zahlen</h2><table><tbody>
        <tr><td>Kapitalbedarf</td><td class="n">${esc(eur(r.capitalNeed.total))}</td></tr>
        <tr><td>Eigenmittel</td><td class="n">${esc(eur(eigen))}${r.capitalNeed.total > 0 ? ` (${esc(pct((eigen / r.capitalNeed.total) * 100))})` : ""}</td></tr>
        ${loans.map((l) => `<tr><td>${esc(l.label || "Darlehen")}</td><td class="n">${esc(eur(l.amount))}, ${l.rate.toLocaleString("de-DE")} %, ${l.years} Jahre, Rate ab Tilgungsbeginn ca. ${esc(eur(ersteRate(l)))} im Monat</td></tr>`).join("")}
        ${kd.map((k) => `<tr><td>Jahr ${k.jahr}: verfügbar für Zins und Tilgung</td><td class="n">${esc(eur(k.verfuegbar))} bei ${esc(eur(k.dienst))} Kapitaldienst${k.deckung !== null ? `, Deckungsgrad ${k.deckung.toLocaleString("de-DE", { maximumFractionDigits: 2 })}` : ""}</td></tr>`).join("")}
      </tbody></table>
      ${kd.some((k) => k.deckung !== null && k.deckung < 1.2) ? `<p class="warn">In mindestens einem Jahr liegt der Deckungsgrad unter 1,2. Banken erwarten 20 % Puffer: Entnahme, Kosten, Laufzeit oder tilgungsfreie Zeit mit deinem Coach prüfen.</p>` : ""}`
    : "";
  const fragen = b.fragen.filter((x) => x.antwort.trim());
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt Arial, sans-serif; color: #7a7a7a; } }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.35; color: #1d2433; }
    h1 { font-size: 19pt; color: #0e2841; margin: 0 0 1mm; } h2 { font-size: 13pt; color: #0e2841; border-bottom: 1.2px solid #c9a227; padding-bottom: 1mm; margin: 7mm 0 2.5mm; break-after: avoid; }
    .meta { color: #5b6475; margin-bottom: 4mm; } table { width: 100%; border-collapse: collapse; margin: 1mm 0 3mm; } th { background: #0e2841; color: #fff; text-align: left; font-size: 9pt; padding: 1.5mm 2mm; }
    td { border-bottom: .5pt solid #d9d9d9; padding: 1.5mm 2mm; vertical-align: top; font-size: 9pt; } td.n { text-align: right; } tr { break-inside: avoid; }
    .tag { color: #8a6a1f; font-size: 8pt; } .url { color: #5b6475; font-size: 7.5pt; word-break: break-all; } .zins { color: #0e2841; font-weight: bold; }
    ol.steps { padding-left: 6mm; } ol.steps li { margin-bottom: 2mm; } ul { padding-left: 5mm; } li { margin: 1mm 0; break-inside: avoid; } ul.check { list-style: none; padding-left: 0; } ul.check li::before { content: "☐  "; }
    .warn { background: #fbeec8; padding: 2mm 3mm; } .note { color: #5b6475; font-size: 8.5pt; } .q { font-weight: bold; margin: 3mm 0 1mm; break-after: avoid; } .a { margin: 0 0 2mm; } mark { background: #fbeec8; }
  </style></head><body>
  <h1>Finanzierung über Bank und Förderung</h1>
  <p class="meta">Leitfaden für ${esc(name)} · Programme und Zinsen Stand ${FOERDER_STAND}${land ? ` · Bundesland: ${esc(land.name)}` : ""}</p>
  <p>Dieser Leitfaden zeigt, wie du einen Gründungskredit oder Förderkredit beantragst, welche Unterlagen du brauchst und welche Förderung es für dich gibt. Deinen Businessplan und Finanzplan in der Bankfassung bekommst du von deinem Coach.</p>
  ${zahlen}
  <h2>So läuft es ab</h2>
  <ol class="steps">${BANK_ABLAUF.map((s) => `<li><b>${esc(s.titel)}:</b> ${esc(s.text)}</li>`).join("")}</ol>
  <h2>Voraussetzungen</h2>
  <ul>${BANK_VORAUSSETZUNGEN.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
  <h2>Diese Unterlagen brauchst du</h2>
  <ul class="check">${BANK_UNTERLAGEN.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
  <h2>Förderung bundesweit</h2>
  ${programmTable(BUNDESWEIT)}
  ${land
    ? `<h2>Förderung in ${esc(land.name)}</h2><p>Förderbank: <b>${esc(land.bank)}</b> (${esc(land.url)}) · Bürgschaften: <b>${esc(land.buergschaft)}</b></p>${programmTable(land.programme)}`
    : `<p class="warn">Dein Bundesland ist noch nicht eingetragen. Dein Coach ergänzt es, dann stehen hier die Förderprogramme deines Landes.</p>`}
  <p class="note">Zinsen und Bedingungen ändern sich laufend. Verbindlich ist der Zins am Tag der Zusage; die aktuellen Werte nennt die Hausbank oder die Förderbank. Förderkredite werden immer vor Beginn des Vorhabens über die Hausbank beantragt.</p>
  ${fragen.length ? `<h2>Fragen und Antworten für das Bankgespräch</h2>${fragen.map((x) => `<p class="q">${esc(x.frage)}</p><p class="a">${esc(x.antwort).replace(/\[([^\]\n]{1,80})\]/g, "<mark>[$1]</mark>").replace(/\n/g, "<br>")}</p>`).join("")}` : ""}
  </body></html>`;
}
