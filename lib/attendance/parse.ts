/*
 * Liest Anwesenheits-Mails von Erfolgspfad. Aufbau (Stand Oktober 2026):
 *   Betreff: „Neue Anwesenheitserfassung Djamal Weise“, Absender info@erfolgspfad.de
 *   „Djamal Weise hat soeben folgenden Termin per Unterschrift bestätigt:
 *    Datum: 15.10.2026 / Start: 15:30:00 / Ende: 16:30:00 / Dauer: 1,33 UE
 *    Die Restdauer des Coachings beträgt 44 UE.“
 * Bewusst tolerant, falls Erfolgspfad Kleinigkeiten an der Formulierung ändert.
 */
export type ParsedAttendance = {
  name: string | null;
  held_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  units: number | null;
  rest_units: number | null;
};

const num = (s: string | undefined) => {
  if (!s) return null;
  // „1,33“ und „1.33“ sind beide 1,33 Stunden, „1.234,5“ ist ein Tausenderpunkt
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

const time = (s: string | undefined) => {
  const m = s?.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};

export function parseAttendanceMail(subject: string, body: string): ParsedAttendance {
  const text = body.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
  const field = (label: string) => text.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"))?.[1]?.trim();

  const date = field("Datum")?.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  const year = date ? (date[3].length === 2 ? `20${date[3]}` : date[3]) : null;
  const held_on = date ? `${year}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}` : null;

  const units = num(field("Dauer")?.match(/(\d+(?:[.,]\d+)?)\s*(?:UE|Unterrichtseinheit)/i)?.[1]) ?? num(text.match(/(\d+(?:[.,]\d+)?)\s*UE\b(?![\s\S]*Rest)/i)?.[1]);
  const rest_units = num(text.match(/Rest(?:dauer|stunden|einheiten|-?UE)?[^\d\n]{0,60}?(\d+(?:[.,]\d+)?)\s*(?:UE|Unterrichtseinheit|Einheit)/i)?.[1]);

  const name =
    subject.match(/Anwesenheitserfassung\s*(?:für|von|:|-)?\s*(.+)$/i)?.[1]?.trim() ||
    text.match(/(?:^|\n)\s*([^\n]{3,80}?)\s+hat soeben/i)?.[1]?.trim() ||
    text.match(/(?:Teilnehmer(?:in)?|Coachee|Name)\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
    null;

  return { name, held_on, starts_at: time(field("Start") ?? field("Beginn")), ends_at: time(field("Ende")), units, rest_units };
}

/** Vergleich von Namen ohne Groß-/Kleinschreibung, Akzente und Reihenfolge („Weise, Djamal“ = „Djamal Weise“) */
export function nameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .replace(/[łđøæœ]/g, (ch) => ({ ł: "l", đ: "d", ø: "o", æ: "ae", œ: "oe" })[ch] ?? ch)
    // „Jörg“, „Joerg“ und „Jorg“ gleich behandeln
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .split(/[^a-z]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const tokens = (s: string) => nameKey(s).split(" ").filter(Boolean);

/**
 * Passt der Name aus der Mail zu einem Coachee? Der Nachname muss vollständig vorkommen, vom Vornamen reicht einer
 * („Djamal Ali Weise“ passt zu „Djamal Weise“ und umgekehrt). Reihenfolge, Akzente und Bindestriche spielen keine Rolle.
 */
export function namesMatch(mailName: string, first: string, last: string) {
  const mail = new Set(tokens(mailName));
  const lastT = tokens(last);
  const firstT = tokens(first);
  if (!mail.size || !lastT.length) return false;
  if (!lastT.every((t) => mail.has(t))) return false;
  return firstT.length === 0 || firstT.some((t) => mail.has(t));
}
