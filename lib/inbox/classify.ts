import { namesMatch } from "../attendance/parse";

/*
 * Mails der Bildungsträger erkennen und auslesen. Bewusst mit Regeln statt KI: Die Mails enthalten Namen,
 * Telefonnummern und Termine von Coachees, und der Coach kann jede Einordnung mit einem Klick korrigieren.
 * Die Muster sind tolerant, weil AVOCONS und Erfolgspfad ihre Texte ändern können.
 */

export type Category = "anfrage" | "projektvertrag" | "buerobuchung" | "coachbericht" | "anwesenheit" | "nachricht";
export type Source = "erfolgspfad" | "avocons" | "sonstige";

export const CATEGORIES: Record<Category, { label: string; plural: string; chip: string; dot: string }> = {
  anfrage: { label: "Neue Anfrage", plural: "Anfragen", chip: "bg-danger-soft text-danger border-danger/20", dot: "bg-danger" },
  buerobuchung: { label: "Bürobuchung", plural: "Bürobuchungen", chip: "bg-gold-soft text-[#7a5520] border-gold/30", dot: "bg-gold" },
  projektvertrag: { label: "Projektvertrag", plural: "Projektverträge", chip: "bg-tint text-accent border-accent/20", dot: "bg-accent" },
  coachbericht: { label: "Bericht zum Unterschreiben", plural: "Berichte", chip: "bg-[#eef0ff] text-[#3d3f9a] border-[#5b5fc7]/25", dot: "bg-[#5b5fc7]" },
  anwesenheit: { label: "Anwesenheit", plural: "Anwesenheiten", chip: "bg-ok-soft text-ok border-ok/20", dot: "bg-ok" },
  nachricht: { label: "Nachricht", plural: "Nachrichten", chip: "bg-surface-2 text-ink border-line", dot: "bg-muted" },
};
export const isCategory = (v: string): v is Category => v in CATEGORIES;

export const SOURCES: Record<Source, string> = { erfolgspfad: "Erfolgspfad", avocons: "AVOCONS", sonstige: "Sonstige" };

/** Absender, die ins Portal gehören (Teil der Adresse oder des Namens), änderbar über INBOX_FROM */
export const senders = () => (process.env.INBOX_FROM || "erfolgspfad,avocons").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function sourceOf(from: string): Source {
  const f = from.toLowerCase();
  if (f.includes("erfolgspfad")) return "erfolgspfad";
  if (f.includes("avocons")) return "avocons";
  return "sonstige";
}

const norm = (s: string) => s.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
/** Zitierte frühere Mails („Am … schrieb …“, „-----Ursprüngliche Nachricht-----“) abschneiden, damit alte Inhalte nicht mitzählen */
export function ownPart(body: string) {
  const t = norm(body);
  const cut = t.search(/\n\s*(?:-{2,}\s*(?:Ursprüngliche Nachricht|Original Message)|Am .{5,80} schrieb .{2,80}:|Von:\s.+\n\s*Gesendet:|From:\s.+\n\s*Sent:)/i);
  return cut > 200 ? t.slice(0, cut) : t;
}

/**
 * Art der Mail. Reihenfolge zählt: Anwesenheit und Buchungsbestätigung sind am eindeutigsten,
 * Berichte und Verträge brauchen meist einen Anhang, Anfragen erkennt man an Betreff und Kontaktfeldern.
 */
export function classify(m: { subject: string; body: string; attachments: string[] }): Category {
  const subject = m.subject;
  const head = ownPart(m.body).slice(0, 4000);
  const all = `${subject}\n${head}`;
  const files = m.attachments.join(" ").toLowerCase();
  if (/anwesenheitserfassung|neue anwesenheit/i.test(subject)) return "anwesenheit";
  if (/(b[üu]ro|raum|r[äa]um(e|lichkeit)|platz)[- ]?(buchung|reservierung)|buchungsbest[äa]tigung|reservierungsbest[äa]tigung|best[äa]tigung (ihrer|der|deiner) (buchung|reservierung)|b[üu]rotermin/i.test(all))
    return "buerobuchung";
  if (/projektvertrag|projekt-vertrag|honorarvertrag|kooperationsvertrag|auftragsbest[äa]tigung|beauftragung/i.test(all) || /vertrag/.test(files)) return "projektvertrag";
  if (/coach(ing)?[- ]?bericht|dokumentationsbericht|beratungsdokumentation|dokumentation|protokoll|bericht/i.test(subject) || /bericht|dokumentation|protokoll/.test(files))
    return "coachbericht";
  if (/(neue|neuer) (anfrage|teilnehmer|kunde|interessent|coachee|zuweisung)|coaching-?anfrage|anfrage|interessent|zuweisung|vermittlung|neuanmeldung/i.test(subject)) return "anfrage";
  if (/neue (anfrage|teilnehmer(in)?|zuweisung)|bitte (nehmen sie|nimm) kontakt auf|bitte (zeitnah )?kontakt aufnehmen|m[öo]chte (ein|an einem) coaching/i.test(head)) return "anfrage";
  return "nachricht";
}

// ---------- Auslesen ----------

const two = (n: string) => n.padStart(2, "0");
const MONTHS: Record<string, string> = { januar: "01", jan: "01", februar: "02", feb: "02", märz: "03", maerz: "03", mär: "03", april: "04", apr: "04", mai: "05", juni: "06", jun: "06", juli: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09", sept: "09", oktober: "10", okt: "10", november: "11", nov: "11", dezember: "12", dez: "12" };

/** Alle Kalendertage im Text, mit Stelle: „20.10.2026“, „20.10.26“, „20. Oktober 2026“, „2026-10-20“ */
function datesIn(text: string, fallbackYear: number) {
  const out: { day: string; index: number; end: number }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?!\d)/g)) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(fallbackYear);
    if (Number(m[2]) > 12 || Number(m[1]) > 31 || Number(m[1]) === 0) continue;
    out.push({ day: `${y}-${two(m[2])}-${two(m[1])}`, index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\.\s*(januar|februar|m[äa]e?rz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|apr|jun|jul|aug|sept?|okt|nov|dez)\.?\s*(\d{4})?/gi)) {
    const k = m[2].toLowerCase();
    const mon = MONTHS[k] ?? (/^m[äa]e?rz$/.test(k) ? "03" : undefined);
    if (!mon) continue;
    out.push({ day: `${m[3] ?? fallbackYear}-${mon}-${two(m[1])}`, index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.push({ day: `${m[1]}-${m[2]}-${m[3]}`, index: m.index!, end: m.index! + m[0].length });
  return out.sort((a, b) => a.index - b.index);
}

const hm = (h: string, m: string) => `${two(h)}:${m}`;

export type Booking = { day: string; start: string; end: string | null };

/**
 * Gebuchte Termine aus einer Bestätigung: jedes Datum mit einer Uhrzeit in derselben oder der nächsten Zeile
 * („20.10.2026 von 10:00 bis 12:00 Uhr“, „Datum: 20.10.2026 / Uhrzeit: 10:00 - 12:00“). Daten ohne Uhrzeit
 * (z. B. das Datum der Mail) zählen nicht.
 */
export function parseBookings(body: string, receivedAt: Date): Booking[] {
  const text = ownPart(body);
  const year = receivedAt.getFullYear();
  const found = new Map<string, Booking>();
  for (const d of datesIn(text, year)) {
    // Bis zum nächsten Datum, höchstens 160 Zeichen weiter
    const rest = text.slice(d.end, d.end + 160);
    const window = rest.split(/\b\d{1,2}\.\d{1,2}\.\d{2,4}/)[0];
    const range = window.match(/(\d{1,2})[:.](\d{2})\s*(?:Uhr)?\s*(?:-|–|—|bis)\s*(\d{1,2})[:.](\d{2})/i);
    const single = window.match(/(?:um|ab|beginn|start|uhrzeit)?\s*:?\s*(\d{1,2})[:.](\d{2})\s*Uhr/i) ?? window.match(/\b(\d{1,2}):(\d{2})\b/);
    let start: string | null = null;
    let end: string | null = null;
    if (range && Number(range[1]) < 24 && Number(range[3]) < 24) {
      start = hm(range[1], range[2]);
      end = hm(range[3], range[4]);
    } else if (single && Number(single[1]) < 24) start = hm(single[1], single[2]);
    if (!start) continue;
    if (end && end <= start) end = null;
    // Vergangenheit vor dem Eingang der Mail ist kein Buchungstermin (eher Bezug auf früheres)
    if (d.day < new Date(receivedAt.getTime() - 86_400_000).toISOString().slice(0, 10)) continue;
    found.set(`${d.day} ${start}`, { day: d.day, start, end });
  }
  return [...found.values()];
}

export function parseLocation(body: string) {
  const m = ownPart(body).match(/(?:^|\n)\s*(?:Ort|Standort|Raum|Adresse|Büro|Buero|Räumlichkeit)\s*:\s*([^\n]{3,120})/i);
  return m?.[1]?.trim() ?? null;
}

export type Contact = { first_name: string; last_name: string; email: string | null; phone: string | null; city: string | null; coaching_type: "job" | "gruendung" | null };

const field = (text: string, labels: string) => text.match(new RegExp(`(?:^|\\n)\\s*(?:${labels})\\s*[:：]\\s*([^\\n]{1,120})`, "i"))?.[1]?.trim() ?? null;
const salutation = /^(herr|frau|hr\.|fr\.|divers)\s+/i;

/** Kontaktdaten aus einer Anfrage: beschriftete Felder zuerst, sonst Telefonnummer und Mailadresse im Text */
export function parseContact(body: string, subject: string): Contact {
  const text = ownPart(body);
  let first = field(text, "Vorname") ?? "";
  let last = field(text, "Nachname|Familienname|Name, Vorname") ?? "";
  if (last.includes(",") && !first) [last, first] = last.split(",").map((s) => s.trim());
  if (!first && !last) {
    const full =
      field(text, "Name|Teilnehmer(?:in)?|Kunde|Kundin|Interessent(?:in)?|Coachee|Bewerber(?:in)?") ??
      subject.match(/(?:anfrage|teilnehmer(?:in)?|zuweisung|interessent(?:in)?)\s*(?:für|von|:|-|–)\s*(?:herrn?|frau)?\s*([A-ZÄÖÜ][^\n,;()]{2,60})/i)?.[1] ??
      text.match(/(?:für|von)\s+(?:Herrn|Herr|Frau)\s+([A-ZÄÖÜ][\wäöüßÄÖÜ-]+(?:\s+[A-ZÄÖÜ][\wäöüßÄÖÜ-]+){0,2})/)?.[1] ??
      "";
    const clean = full.replace(salutation, "").replace(/\s+/g, " ").trim();
    if (clean.includes(",")) [last, first] = clean.split(",").map((s) => s.trim());
    else {
      const parts = clean.split(" ").filter(Boolean);
      last = parts.pop() ?? "";
      first = parts.join(" ");
    }
  }
  first = first.replace(salutation, "").trim();
  last = last.replace(salutation, "").trim();
  const emails = [...text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]).filter((e) => !/avocons|erfolgspfad|gruendarium|kuntsolutions|noreply|no-reply/i.test(e));
  const email = field(text, "E-?Mail(?:-Adresse)?")?.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? emails[0] ?? null;
  const phoneField = field(text, "Telefon(?:nummer)?|Tel\\.?|Mobil(?:nummer)?|Handy(?:nummer)?|Rufnummer");
  const phoneRaw = phoneField ?? text.match(/(?:\+49|0049|\b0)[1-9][\d\s/()-]{6,18}\d/)?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "").replace(/^0049/, "+49") : null;
  const city = field(text, "Wohnort|Ort|PLZ(?:\\s*/\\s*|\\s+)Ort|Stadt")?.replace(/^\d{5}\s*/, "") ?? null;
  const all = `${subject}\n${text}`;
  const coaching_type = /gr[üu]ndung|existenzgr[üu]nd|selbstst[äa]ndig|tragf[äa]higkeit/i.test(all) ? "gruendung" : /bewerbung|arbeitssuche|jobsuche|vermittlung in arbeit|stellensuche|mpav|avgs/i.test(all) ? "job" : null;
  return { first_name: first.slice(0, 80), last_name: last.slice(0, 80), email, phone: phone && phone.length >= 7 ? phone.slice(0, 30) : null, city: city?.slice(0, 80) ?? null, coaching_type };
}

/** Welcher Coachee ist gemeint? Nachname und ein Vorname müssen im Betreff oder Text vorkommen; nur eindeutige Treffer zählen. */
export function findCoachee(text: string, coachees: { id: string; first_name: string; last_name: string; status?: string }[]) {
  const hits = coachees.filter((c) => namesMatch(text, c.first_name, c.last_name));
  if (hits.length === 1) return hits[0].id;
  const active = hits.filter((c) => c.status === "aktiv");
  if (active.length === 1) return active[0].id;
  if (hits.length) return null;
  // „Frau Demir“ ohne Vornamen: nur wenn genau ein Coachee so heißt
  const called = [...text.matchAll(/\b(?:Herrn?|Frau)\s+([A-ZÄÖÜ][\wäöüßÄÖÜ-]+)/g)].map((m) => m[1]);
  const bySurname = coachees.filter((c) => called.some((n) => namesMatch(n, "", c.last_name)));
  return bySurname.length === 1 ? bySurname[0].id : null;
}
