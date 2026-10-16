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
  coachbericht: { label: "Start und Bericht", plural: "Starts und Berichte", chip: "bg-[#eef0ff] text-[#3d3f9a] border-[#5b5fc7]/25", dot: "bg-[#5b5fc7]" },
  anwesenheit: { label: "Anwesenheit", plural: "Anwesenheiten", chip: "bg-ok-soft text-ok border-ok/20", dot: "bg-ok" },
  nachricht: { label: "Nachricht", plural: "Nachrichten", chip: "bg-surface-2 text-ink border-line", dot: "bg-muted" },
};
export const isCategory = (v: string): v is Category => v in CATEGORIES;

export const SOURCES: Record<Source, string> = { erfolgspfad: "Erfolgspfad", avocons: "AVOCONS", sonstige: "Sonstige" };

/** Absender, die ins Portal gehören (Teil der Adresse oder des Namens), änderbar über INBOX_FROM. Regus: Besprechungsräume, die AVOCONS bucht */
export const senders = () => (process.env.INBOX_FROM || "erfolgspfad,avocons,avgs-coaching,regus").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function sourceOf(from: string, body = ""): Source {
  const f = from.toLowerCase();
  if (f.includes("erfolgspfad")) return "erfolgspfad";
  if (f.includes("avocons") || f.includes("avgs-coaching")) return "avocons";
  // z. B. Regus-Bestätigung mit „Gastgeber Firma: AVOCONS GmbH“
  if (/avocons/i.test(body)) return "avocons";
  if (/erfolgspfad/i.test(body)) return "erfolgspfad";
  return "sonstige";
}

const norm = (s: string) => s.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
/** Zitierte frühere Mails („Am … schrieb …“, „-----Ursprüngliche Nachricht-----“) abschneiden, damit alte Inhalte nicht mitzählen */
export function ownPart(body: string) {
  const t = norm(body);
  const cut = t.search(/\n\s*(?:-{2,}\s*(?:Ursprüngliche Nachricht|Original Message)|Am .{5,80} schrieb .{2,80}:|Von:\s.+\n\s*Gesendet:|From:\s.+\n\s*Sent:)/i);
  return cut > 200 ? t.slice(0, cut) : t;
}

export const isReply = (subject: string) => /^\s*(re|aw|antw|wg|fw|fwd)\s*:/i.test(subject);

const BOOKING = /(b[üu]ro|raum|r[äa]ume|besprechungs)[- ]?(buchung|reservierung|best[äa]tigung)|buchungsbest[äa]tigung|reservierungsbest[äa]tigung|best[äa]tigung (ihrer|der|deiner) (buchung|reservierung)|b[üu]rotermin/i;

/**
 * Art der Mail. Reihenfolge zählt: Projektverträge von Erfolgspfad erwähnen auch die Bürobuchung,
 * deshalb zählt der Betreff zuerst. Bürobuchung nur, wenn wirklich etwas bestätigt ist; Rückfragen
 * („leider alles voll, passt der 21.10.?“) bleiben Nachrichten.
 */
export function classify(m: { subject: string; body: string; attachments: string[] }): Category {
  const subject = m.subject;
  const head = ownPart(m.body).slice(0, 6000);
  const all = `${subject}\n${head}`;
  const files = m.attachments.join(" ").toLowerCase();
  const reply = isReply(subject);
  if (/anwesenheitserfassung|neue anwesenheit/i.test(subject)) return "anwesenheit";
  if (/projektvertrag|projekt-vertrag|honorarvertrag|kooperationsvertrag/i.test(subject) || (!reply && /vertrag/.test(files)))
    return reply && !files ? "nachricht" : "projektvertrag";
  if (/coaching .{0,80}startet|startet am|beratungsdokumentation|coach(ing)?[- ]?bericht|dokumentationsbericht/i.test(subject) || (!reply && /bericht|dokumentation/.test(files)))
    return reply && !files ? "nachricht" : "coachbericht";
  if (BOOKING.test(all) && /best[äa]tig/i.test(all) && hasDateWithTime(head)) return "buerobuchung";
  if (reply) return "nachricht";
  if (/(neue|neuer) (anfrage|teilnehmer|kunde|interessent|coachee|zuweisung)|coaching-?anfrage|anfrage|interessent|zuweisung|neuanmeldung/i.test(subject)) return "anfrage";
  if (/neue (anfrage|teilnehmer(in)?|zuweisung)|du hast eine anfrage erhalten|bitte (nehmen sie|nimm) kontakt auf|bitte kontaktiere|bitte (zeitnah )?kontakt aufnehmen|m[öo]chte (ein|an einem) coaching/i.test(head)) return "anfrage";
  if (/bericht|dokumentation/.test(files) || /coachingstart|bewilligung/i.test(subject)) return "coachbericht";
  return "nachricht";
}

// ---------- Auslesen ----------

const two = (n: string) => n.padStart(2, "0");
const MONTHS: Record<string, string> = { januar: "01", jan: "01", februar: "02", feb: "02", märz: "03", maerz: "03", mär: "03", april: "04", apr: "04", mai: "05", juni: "06", jun: "06", juli: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09", sept: "09", oktober: "10", okt: "10", november: "11", nov: "11", dezember: "12", dez: "12" };

const EN_MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

/** Alle Kalendertage im Text, mit Stelle: „20.10.2026“, „20.10.26“, „20. Oktober 2026“, „2026-10-20“, „Wednesday, October 28, 2026“ */
function datesIn(text: string, fallbackYear: number) {
  const out: { day: string; index: number; end: number }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?!\d)/g)) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(fallbackYear);
    if (Number(m[2]) > 12 || Number(m[2]) === 0 || Number(m[1]) > 31 || Number(m[1]) === 0) continue;
    out.push({ day: `${y}-${two(m[2])}-${two(m[1])}`, index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\.\s*(januar|februar|m[äa]e?rz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|apr|jun|jul|aug|sept?|okt|nov|dez)\.?\s*(\d{4})?/gi)) {
    const k = m[2].toLowerCase();
    const mon = MONTHS[k] ?? (/^m[äa]e?rz$/.test(k) ? "03" : undefined);
    if (!mon) continue;
    out.push({ day: `${m[3] ?? fallbackYear}-${mon}-${two(m[1])}`, index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(20\d{2})\b/gi))
    out.push({ day: `${m[3]}-${EN_MONTHS[m[1].toLowerCase()]}-${two(m[2])}`, index: m.index!, end: m.index! + m[0].length });
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.push({ day: `${m[1]}-${m[2]}-${m[3]}`, index: m.index!, end: m.index! + m[0].length });
  return out.sort((a, b) => a.index - b.index);
}

const hm = (h: string, m: string) => `${two(h)}:${m}`;
const timesIn = (s: string) =>
  [...s.matchAll(/(?<![\d.:])(\d{1,2})[:.](\d{2})(?![\d.:])/g)].filter((t) => Number(t[1]) < 24 && Number(t[2]) < 60).map((t) => hm(t[1], t[2]));

function hasDateWithTime(text: string) {
  const ds = datesIn(text, 2000);
  return ds.some((d, i) => timesIn(text.slice(d.end, Math.min(ds[i + 1]?.index ?? Infinity, d.end + 200))).length > 0);
}

export type Booking = { day: string; start: string; end: string | null; cancelled?: boolean };

/**
 * Gebuchte Termine aus einer Bestätigung: jedes Datum mit Uhrzeit bis zum nächsten Datum. Passt für
 * Erfolgspfads Tabelle (Datum | Start | Ende | Status), Regus („Beginnt am: … um: 09:00 um: 13:00“) und Fließtext.
 * Zeilen „angefragt“ zählen nicht, „storniert“ sagt einen Termin ab. Daten ohne Uhrzeit zählen nicht.
 */
export function parseBookings(body: string, receivedAt: Date): Booking[] {
  const text = ownPart(body);
  const year = receivedAt.getFullYear();
  const found = new Map<string, Booking>();
  const ds = datesIn(text, year);
  const earliest = new Date(receivedAt.getTime() - 86_400_000).toISOString().slice(0, 10);
  ds.forEach((d, i) => {
    // Tabellenzeile (Datum, Start, Ende, Status in einer Zeile) zuerst, sonst bis zum nächsten Datum
    const next = Math.min(ds[i + 1]?.index ?? Infinity, d.end + 200);
    const line = text.slice(d.end, Math.min(next, text.indexOf("\n", d.end) === -1 ? Infinity : text.indexOf("\n", d.end)));
    const window = timesIn(line).length ? line : text.slice(d.end, next);
    const times = timesIn(window);
    if (!times.length) return;
    // Der erste Status nach dem Datum gehört zu dieser Zeile (bei Zellen je Zeile folgen danach schon die nächsten)
    const status = window.match(/best[äa]tigt|storniert|abgesagt|abgelehnt|gel[öo]scht|cancel\w*|angefragt|warteliste|ausstehend|in pr[üu]fung/i)?.[0].toLowerCase() ?? "";
    if (/angefragt|warteliste|ausstehend|pr[üu]fung/.test(status)) return;
    const start = times[0];
    const end = times.find((t) => t > start) ?? null;
    if (d.day < earliest) return;
    found.set(`${d.day} ${start}`, { day: d.day, start, end, ...(/storniert|abgesagt|abgelehnt|gel|cancel/.test(status) ? { cancelled: true } : {}) });
  });
  return [...found.values()];
}

export function parseLocation(body: string) {
  const m = ownPart(body).match(/(?:^|\n)\s*(?:Ort|Standort|Raum|Adresse|Büro|Buero|Räumlichkeit)\s*:[ \t]*\n?[ \t]*([^\n]{3,120})/i);
  return m?.[1]?.trim() ?? null;
}

export type Contact = { first_name: string; last_name: string; email: string | null; phone: string | null; city: string | null; coaching_type: "job" | "gruendung" | null; note?: string };

/** Angaben zum bewilligten Coaching (AVOCONS-Startmail, Projektvertrag): für die neue Akte */
export type Grant = { voucher_number?: string; units_total?: number; start_date?: string; end_date?: string; code?: string };

const field = (text: string, labels: string) => text.match(new RegExp(`(?:^|\\n)[ \\t]*(?:${labels})[ \\t]*[:：][ \\t]*([^\\n]{1,120})`, "i"))?.[1]?.trim() ?? null;
const salutation = /^(herr|frau|hr\.|fr\.|divers)\s+/i;

/** Kontaktdaten aus einer Anfrage: beschriftete Felder zuerst, sonst Telefonnummer und Mailadresse im Text */
export function parseContact(body: string, subject: string): Contact {
  const text = ownPart(body);
  let first = field(text, "Vorname") ?? "";
  let last = field(text, "Nachname|Familienname|Name, Vorname") ?? "";
  if (last.includes(",") && !first) [last, first] = last.split(",").map((s) => s.trim());
  if (!first && !last) {
    const full =
      field(text, "Name|Teilnehmer(?:in)?|Kunde|Kundin|Interessent(?:in)?|Coachee|Bewerber(?:in)?|Von") ??
      subject.match(/(?:projektvertrag|teilnehmer(?:in)?|zuweisung|interessent(?:in)?)\s*(?:für|von|:|-|–)?\s*(?:herrn?|frau)?\s*([A-ZÄÖÜ][^\n,;()]{2,60})/i)?.[1] ??
      subject.match(/coaching (?:mit|von|für)\s+([A-ZÄÖÜ][^\n,;()]{2,60}?)\s+(?:startet|beginnt)/i)?.[1] ??
      text.match(/coaching (?:von|mit|für)\s+\**([A-ZÄÖÜ][\wäöüßÄÖÜ-]+(?:\s+[A-ZÄÖÜ][\wäöüßÄÖÜ-]+){1,3})/)?.[1] ??
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
  const emails = [...text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]).filter((e) => !/avocons|erfolgspfad|avgs-coaching|regus|gruendarium|kuntsolutions|noreply|no-reply/i.test(e));
  const email = field(text, "E-?Mail(?:-Adresse)?")?.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? emails[0] ?? null;
  const phoneField = field(text, "Telefon(?:nummer)?|Tel\\.?|Mobil(?:nummer)?|Handy(?:nummer)?|Rufnummer");
  const phoneRaw = phoneField ?? text.match(/(?:\+49|0049|\b0)[1-9][\d\s/()-]{6,18}\d/)?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "").replace(/^0049/, "+49") : null;
  const city = field(text, "Wohnort|Ort|PLZ(?:\\s*/\\s*|\\s+)Ort|Stadt")?.replace(/^\d{5}\s*/, "") ?? null;
  const all = `${subject}\n${text}`;
  const coaching_type = /gr[üu]ndung|existenzgr[üu]nd|selbstst[äa]ndig|tragf[äa]higkeit/i.test(all) ? "gruendung" : /bewerbung|arbeitssuche|jobsuche|vermittlung in arbeit|stellensuche|mpav|avgs/i.test(all) ? "job" : null;
  // Freitext des Kontaktformulars („Nachrichtentext: …“) bis zur nächsten Leerzeile
  const note = text.match(/(?:^|\n)\s*(?:Nachrichtentext|Nachricht|Anliegen|Bemerkung|Mitteilung)\s*:\s*\n?([\s\S]{3,1500}?)(?=\n\s*\n|\n--|$)/i)?.[1]?.trim();
  return { first_name: first.replace(/\*/g, "").slice(0, 80), last_name: last.replace(/[*.]/g, "").slice(0, 80), email, phone: phone && phone.length >= 7 ? phone.slice(0, 30) : null, city: city?.slice(0, 80) ?? null, coaching_type, ...(note ? { note } : {}) };
}

const isoDay = (d: string) => {
  const m = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${two(m[2])}-${two(m[1])}` : undefined;
};

/** AVGS-Nummer, Unterrichtseinheiten und Zeitraum aus Startmail oder Vertrag */
export function parseGrant(body: string, subject: string): Grant {
  const text = `${subject}\n${ownPart(body)}`;
  const g: Grant = {};
  const voucher = text.match(/(?:AVGS-?(?:Nr|Nummer)\.?|Gutschein(?:nummer|-?Nr\.?)?|Kunden-?Nummer)\s*:?\s*([A-Z0-9][A-Z0-9-]{5,29})/i)?.[1];
  if (voucher) g.voucher_number = voucher;
  const units = text.match(/Unterrichtseinheiten\s*:?\s*(\d{1,3})\b/i)?.[1] ?? text.match(/\((\d{1,3})\s*UE\)/)?.[1];
  if (units) g.units_total = Number(units);
  const range = text.match(/(?:zeitraum|laufzeit|dauer)[^\n:]*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:-|–|bis)\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (range) [g.start_date, g.end_date] = [isoDay(range[1]), isoDay(range[2])];
  else {
    const start = text.match(/startet am\s*(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1];
    if (start) g.start_date = isoDay(start);
  }
  const code = text.match(/Coachingart\s*:\s*([^\n]{2,40})/i)?.[1]?.trim();
  if (code) g.code = code;
  return g;
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
