// Gemeinsame Typen und Bezeichnungen für Stellensuche und Bewerbungs-Tracker (Server und Browser).

export type JobQuery = { was: string; wo: string; umkreis: number; arbeitszeit: string; angebotsart: number; ohne_zeitarbeit: boolean };
export type SavedSearch = JobQuery & { id: string };

/** Ein Treffer aus der Jobbörse */
export type Job = {
  refnr: string;
  title: string;
  beruf: string;
  employer: string;
  location: string;
  distance: number | null;
  published: string | null;
  start: string | null;
  url: string;
  externalUrl: string | null;
  homeoffice?: boolean;
};

export type Fit = { level: "hoch" | "mittel" | "gering"; reason: string };

export const STATUSES = [
  { key: "vorschlag", label: "Vorschlag", hint: "Vom Coach vorgeschlagen" },
  { key: "gemerkt", label: "Gemerkt", hint: "Interessant, noch nicht beworben" },
  { key: "beworben", label: "Beworben", hint: "Bewerbung ist raus" },
  { key: "gespraech", label: "Gespräch", hint: "Einladung zum Vorstellungsgespräch" },
  { key: "zusage", label: "Zusage", hint: "Angebot oder Vertrag" },
  { key: "absage", label: "Absage", hint: "Vom Arbeitgeber abgesagt" },
  { key: "verworfen", label: "Nicht weiter", hint: "Passt doch nicht" },
] as const;
export type Status = (typeof STATUSES)[number]["key"];
export const statusLabel = (s: string) => STATUSES.find((x) => x.key === s)?.label ?? s;
/** Ab hier zählt es als Bewerbung (für den Nachweis der Eigenbemühungen) */
export const APPLIED: Status[] = ["beworben", "gespraech", "zusage", "absage"];

export const STATUS_TONE: Record<Status, string> = {
  vorschlag: "bg-[#fbf1e3] text-gold",
  gemerkt: "bg-tint text-accent",
  beworben: "bg-[#e6eefa] text-[#2c5ea8]",
  gespraech: "bg-[#efe7f8] text-[#6b3fa0]",
  zusage: "bg-[#e3f1e7] text-ok",
  absage: "bg-[#f8e6e3] text-danger",
  verworfen: "bg-bg text-muted",
};

export const CHANNELS = [
  { key: "", label: "–" },
  { key: "online", label: "Online-Formular" },
  { key: "email", label: "E-Mail" },
  { key: "post", label: "Post" },
  { key: "persoenlich", label: "Persönlich" },
  { key: "telefon", label: "Telefon" },
] as const;
export const channelLabel = (k: string) => (k ? (CHANNELS.find((c) => c.key === k)?.label ?? k) : "");

export const ARBEITSZEIT = [
  { key: "vz", label: "Vollzeit" },
  { key: "tz", label: "Teilzeit" },
  { key: "ho", label: "Homeoffice" },
  { key: "snw", label: "Schicht/Wochenende" },
  { key: "mj", label: "Minijob" },
] as const;

export const ANGEBOTSART = [
  { key: 1, label: "Arbeit" },
  { key: 4, label: "Ausbildung / Duales Studium" },
  { key: 34, label: "Praktikum / Trainee" },
  { key: 2, label: "Selbstständigkeit" },
] as const;

export const UMKREIS = [0, 10, 25, 50, 100, 200] as const;

export type Application = {
  id: string;
  refnr: string | null;
  title: string;
  employer: string;
  location: string;
  url: string;
  published_on: string | null;
  status: Status;
  channel: string;
  applied_on: string | null;
  next_on: string | null;
  next_note: string;
  contact: string;
  salutation: Salutation;
  street: string;
  zip: string;
  note: string;
  reason: string;
  history: { at: string; status: Status; by: string }[];
  proposed_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/** Anrede der Ansprechperson, für die Briefanrede im Anschreiben */
export const SALUTATIONS = [
  { key: "", label: "–" },
  { key: "frau", label: "Frau" },
  { key: "herr", label: "Herr" },
] as const;
export type Salutation = (typeof SALUTATIONS)[number]["key"];

export const describeQuery = (q: JobQuery) =>
  [q.was, q.wo && `in ${q.wo}${q.umkreis ? ` +${q.umkreis} km` : ""}`, q.arbeitszeit && q.arbeitszeit.split(";").map((k) => ARBEITSZEIT.find((a) => a.key === k)?.label ?? k).join(", ")].filter(Boolean).join(" · ");

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
