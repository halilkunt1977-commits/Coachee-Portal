// Kalender-Rechnen mit reinen Tagen („YYYY-MM-DD“, Berliner Kalendertag). Ohne Uhrzeiten, damit nichts verrutscht.

export type Kind = "teams" | "buero" | "telefon" | "vor_ort" | "sonstiges";

export const KINDS: Record<Kind, { label: string; short: string; dot: string; chip: string }> = {
  teams: { label: "Teams-Besprechung", short: "Teams", dot: "bg-[#5b5fc7]", chip: "border-[#5b5fc7]/25 bg-[#eef0ff] text-[#3d3f9a]" },
  buero: { label: "Termin im Büro", short: "Büro", dot: "bg-gold", chip: "border-gold/30 bg-gold-soft text-[#7a5520]" },
  telefon: { label: "Telefonat", short: "Telefon", dot: "bg-ok", chip: "border-ok/25 bg-ok-soft text-ok" },
  vor_ort: { label: "Vor Ort", short: "Vor Ort", dot: "bg-accent-2", chip: "border-accent-2/25 bg-tint text-accent" },
  sonstiges: { label: "Sonstiger Termin", short: "Termin", dot: "bg-muted", chip: "border-line bg-surface-2 text-ink" },
};
export const isKind = (v: string): v is Kind => v in KINDS;

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
};

export const addMonths = (day: string, n: number) => {
  const d = toDate(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return fromDate(target);
};

/** Wochentag, Montag = 0 */
export const weekday = (day: string) => (toDate(day).getUTCDay() + 6) % 7;
export const weekStart = (day: string) => addDays(day, -weekday(day));
export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

/** Wochen (Montag bis Sonntag), die den Monat abdecken */
export function monthWeeks(day: string) {
  const first = weekStart(monthStart(day));
  const lastOfMonth = addDays(addMonths(monthStart(day), 1), -1);
  const weeks: string[][] = [];
  for (let start = first; start <= lastOfMonth; start = addDays(start, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  return weeks;
}

export const todayBerlin = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
export const nowBerlinHm = () => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

// lang: „tr“ für Coachees mit türkischer Oberfläche (lib/i18n.ts), sonst Deutsch
type L = "de" | "tr";
const fmt = (day: string, o: Intl.DateTimeFormatOptions, lang: L = "de") => toDate(day).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", { timeZone: "UTC", ...o });
export const dayLong = (day: string, lang?: L) => fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, lang);
export const dateLong = (day: string, lang?: L) => fmt(day, { day: "numeric", month: "long", year: "numeric" }, lang);
export const dayMedium = (day: string, lang?: L) => fmt(day, { weekday: "short", day: "numeric", month: "short" }, lang);
export const monthTitle = (day: string, lang?: L) => fmt(day, { month: "long", year: "numeric" }, lang);
export const weekdayShort = (day: string, lang?: L) => fmt(day, { weekday: "short" }, lang).replace(".", "");
export const dayNum = (day: string) => Number(day.slice(8, 10));

/** Kalenderwoche nach ISO 8601 */
export function isoWeek(day: string) {
  const thursday = toDate(addDays(day, 3 - weekday(day)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** „heute“, „morgen“ oder der Wochentag mit Datum */
export function relativeDay(day: string, today = todayBerlin(), lang: L = "de") {
  if (day === today) return lang === "tr" ? "Bugün" : "Heute";
  if (day === addDays(today, 1)) return lang === "tr" ? "Yarın" : "Morgen";
  return dayMedium(day, lang);
}

export const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Millisekunden bis zu einem Zeitpunkt (negativ = vorbei) */
export const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
