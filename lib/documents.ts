/*
 * Dokumente pro Coachee. Kategorien, Erkennung der Art am Dateinamen, Text aus PDF/Word und
 * das Herauslesen von Terminen (Datum, Zeit, UE) aus Anwesenheitsberichten und Tätigkeitsnachweisen.
 */
export const DOC_CATEGORIES = [
  { key: "anwesenheit", label: "Anwesenheitsbericht", hint: "z. B. von AVOCONS", report: true },
  { key: "taetigkeitsnachweis", label: "Tätigkeitsnachweis", hint: "z. B. von Erfolgspfad", report: true },
  { key: "coachbericht", label: "Coachbericht", hint: "Abschluss- oder Zwischenbericht", report: true },
  { key: "dokumentation", label: "Beratungsdokumentation", hint: "für AVOCONS, entsteht aus den Gesprächen", report: false },
  { key: "vertrag", label: "Vertrag", hint: "z. B. Projektvertrag von Erfolgspfad", report: false },
  { key: "businessplan", label: "Businessplan", hint: "", report: false },
  { key: "finanzplan", label: "Finanzplan", hint: "", report: false },
  { key: "lebenslauf", label: "Lebenslauf", hint: "", report: false },
  { key: "bewerbung", label: "Bewerbungsunterlagen", hint: "Anschreiben, Zeugnisse", report: false },
  { key: "gutschein", label: "Gutschein / Bewilligung", hint: "AVGS, Bescheide", report: false },
  { key: "sonstiges", label: "Sonstiges", hint: "", report: false },
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number]["key"];
export const categoryLabel = (k: string) => DOC_CATEGORIES.find((c) => c.key === k)?.label ?? "Sonstiges";
export const isReport = (k: string) => DOC_CATEGORIES.some((c) => c.key === k && c.report);

export const DOC_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
};
export const MAX_DOC_BYTES = 25 * 1024 * 1024;
export const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** Art am Dateinamen erraten, z. B. „Taetigkeitsnachweis_Weise.pdf“ */
export function guessCategory(name: string): DocCategory {
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/tatigkeit|taetigkeit|leistungsnachweis|nachweis/.test(n)) return "taetigkeitsnachweis";
  if (/anwesenheit|teilnahme|stundenzettel|stundennachweis|beratungsdoku|dokumentation.?coach/.test(n)) return "anwesenheit";
  if (/coach.?bericht|abschlussbericht|zwischenbericht|bericht/.test(n)) return "coachbericht";
  if (/finanz|liquiditat|rentabilitat|kapitalbedarf/.test(n)) return "finanzplan";
  if (/businessplan|business.plan|geschaftsplan|konzept/.test(n)) return "businessplan";
  if (/lebenslauf|\bcv\b|vita|resume/.test(n)) return "lebenslauf";
  if (/anschreiben|bewerbung|zeugnis/.test(n)) return "bewerbung";
  if (/avgs|gutschein|bewilligung|bescheid/.test(n)) return "gutschein";
  return "sonstiges";
}

/** Steht am Dateinamen nichts Eindeutiges, hilft der Inhalt (z. B. Kopf des AVOCONS-Formulars) */
export function guessCategoryFromText(text: string): DocCategory | null {
  const head = text.slice(0, 3000);
  if (/Tätigkeitsnachweis/i.test(head)) return "taetigkeitsnachweis";
  if (/Beratungsdokumentation|Anwesenheits(liste|nachweis|bericht)/i.test(head)) return "anwesenheit";
  if (/Coachingbericht|Abschlussbericht|Coachbericht/i.test(head)) return "coachbericht";
  if (/Lebenslauf/i.test(head) && !/Businessplan/i.test(head)) return "lebenslauf";
  return null;
}

export type ReportRow = { held_on: string; starts_at: string | null; ends_at: string | null; units: number | null };

const num = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Termine aus dem Text eines Berichts: jede Zeile mit Datum und UE-Angabe oder Uhrzeit von–bis.
 * Fehlt die UE, wird sie aus der Uhrzeit gerechnet (45 Minuten = 1 UE). Zeilen ohne beides werden übergangen.
 */
export function extractReportRows(text: string): ReportRow[] {
  const rows: ReportRow[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const row = parseLine(lines[i]) ?? (
      // Tabellenzeilen aus PDFs stehen manchmal über zwei Zeilen verteilt: nur dann die Folgezeile dazunehmen
      /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(lines[i + 1] ?? "") ? null : parseLine(`${lines[i]} ${lines[i + 1] ?? ""}`)
    );
    if (row) rows.push(row);
  }
  // Keine Doppelten entfernen: zwei Termine am selben Tag mit gleichen UE sind in Nachweisen üblich
  return rows;
}

function parseLine(raw: string): ReportRow | null {
  const line = raw.replace(/\s+/g, " ");
  const d = line.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
  if (!d) return null;
  const year = d[3].length === 2 ? `20${d[3]}` : d[3];
  const held_on = `${year}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  if (Number(year) < 2015 || Number(year) > 2100 || Number(d[2]) > 12 || Number(d[1]) > 31) return null;
  const rest = line.slice(line.indexOf(d[0]) + d[0].length);
  // Zeiträume wie „10.08.2026 bis 02.10.2026“ sind keine Termine
  if (/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(rest)) return null;
  // Uhrzeit von–bis, auch als zwei Tabellenspalten ohne Strich dazwischen („15:30 16:30“)
  const t = rest.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:Uhr)?(?:\s*(?:-|–|bis)\s*|\s+)(\d{1,2}):(\d{2})/) ?? rest.match(/\b(\d{1,2})\.(\d{2})\s*(?:Uhr)?\s*(?:-|–|bis)\s*(\d{1,2})\.(\d{2})/);
  const starts_at = t ? `${t[1].padStart(2, "0")}:${t[2]}` : null;
  const ends_at = t ? `${t[3].padStart(2, "0")}:${t[4]}` : null;
  const restNoTime = t ? rest.replace(t[0], " ") : rest;
  let units = num(restNoTime.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:UE|Unterrichtseinheit|Einheit)/i)?.[1] ?? "");
  // Mehr als 12 UE an einem Termin ist eine Summe oder ein Kontingent (z. B. „04-ORC (40 UE)“)
  if (units != null && units > 12) units = null;
  if (units == null) {
    // Tabellenspalte „UE“ direkt nach dem Datum, z. B. Erfolgspfad: „24.04.2026 2,00 Businessplan …“
    const first = restNoTime.match(/^\s*(\d{1,2}(?:,\d{1,2})?)(?=\s|$)/)?.[1];
    const n = first ? num(first) : null;
    if (n != null && n > 0 && n <= 12) units = n;
  }
  if (units == null) {
    // Zeitstunden in UE umrechnen (1 Stunde = 60/45 UE)
    const h = num(restNoTime.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:Std|Stunde|h\b)/i)?.[1] ?? "");
    if (h != null) units = Math.round(((h * 60) / 45) * 100) / 100;
  }
  if (units == null) {
    // Letzte Zahl in der Zeile, wenn sie wie eine UE aussieht (z. B. Tabellenspalte „UE“), sonst aus der Uhrzeit
    const last = restNoTime.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*$/)?.[1];
    const n = last ? num(last) : null;
    if (n != null && n > 0 && n <= 12) units = n;
  }
  if (units == null && t) {
    const minutes = Number(t[3]) * 60 + Number(t[4]) - (Number(t[1]) * 60 + Number(t[2]));
    if (minutes > 0) units = Math.round((minutes / 45) * 100) / 100;
  }
  if (units == null && !t) return null;
  return { held_on, starts_at, ends_at, units };
}

/** Summe, die das Dokument selbst angibt, z. B. „Summe UE 100,30“ oder „Gesamtstundenanzahl auf diesem Blatt: 14“ */
export function reportTotal(text: string | null): number | null {
  const m = text?.match(/(?:Summe|Gesamt)[^\n\d]{0,80}?(\d{1,3}(?:,\d{1,2})?)\s*(?:UE)?\s*$/im);
  return m ? num(m[1]) : null;
}

export type Compared = {
  matched: { report: ReportRow; portal: { id: string; held_on: string; units: number } }[];
  differs: { report: ReportRow; portal: { id: string; held_on: string; units: number } }[];
  missing: ReportRow[];
  extra: { id: string; held_on: string; units: number; starts_at: string | null }[];
  reportSum: number;
  portalSum: number;
};

/** Bericht gegen die Anwesenheit im Portal: gleiche Tage paaren, dann UE vergleichen. Nur Termine im Zeitraum des Berichts zählen. */
export function compareWithPortal(report: ReportRow[], portal: { id: string; held_on: string; units: number; starts_at: string | null }[]): Compared {
  const out: Compared = { matched: [], differs: [], missing: [], extra: [], reportSum: 0, portalSum: 0 };
  if (!report.length) return out;
  const from = report.reduce((a, r) => (r.held_on < a ? r.held_on : a), report[0].held_on);
  const to = report.reduce((a, r) => (r.held_on > a ? r.held_on : a), report[0].held_on);
  const pool = portal.filter((p) => p.held_on >= from && p.held_on <= to);
  const used = new Set<string>();
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
  for (const r of [...report].sort((a, b) => a.held_on.localeCompare(b.held_on))) {
    out.reportSum += r.units ?? 0;
    const sameDay = pool.filter((p) => p.held_on === r.held_on && !used.has(p.id));
    const p = sameDay.find((x) => r.starts_at && hhmm(x.starts_at) === r.starts_at) ?? sameDay.find((x) => r.units != null && Math.abs(x.units - r.units) < 0.05) ?? sameDay[0];
    if (!p) {
      out.missing.push(r);
      continue;
    }
    used.add(p.id);
    if (r.units == null || Math.abs(p.units - r.units) < 0.05) out.matched.push({ report: r, portal: p });
    else out.differs.push({ report: r, portal: p });
  }
  out.extra = pool.filter((p) => !used.has(p.id));
  out.portalSum = pool.reduce((a, p) => a + p.units, 0);
  out.reportSum = Math.round(out.reportSum * 100) / 100;
  out.portalSum = Math.round(out.portalSum * 100) / 100;
  return out;
}
