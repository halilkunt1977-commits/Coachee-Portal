// Erfahrungsbogen (gespeichert als JSON in experience_surveys.data). Ohne Server-Abhängigkeiten, damit Formular und Server dieselben Typen nutzen.

/** 0 = nicht gemacht, 1 = manchmal, 2 = oft / Hauptaufgabe */
export type Level = 0 | 1 | 2;
/** tr: Übersetzung nur zur Anzeige für türkischsprachige Coachees; gespeichert und weitergegeben wird immer text */
export type Choice = { text: string; level: Level; detail?: string; tr?: string };
/** arbeit = Stelle, ausbildung = Aus-/Weiterbildung oder Maßnahme (nur Ja/Nein), luecke = Zeit ohne Station im Lebenslauf */
export type StationKind = "arbeit" | "ausbildung" | "luecke";
export type Station = {
  key: string;
  kind: StationKind;
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  tasks: Choice[];
  tools: Choice[];
  ownTasks: string;
  leadership: string;
  success: string;
  liked: string;
};
export type SurveyData = { stations: Station[]; strengths: Choice[]; software: Choice[]; languages: Choice[]; licences: Choice[]; availability: Choice[]; wish: string; notes: string };

export const LEVELS: { value: Level; label: string }[] = [
  { value: 0, label: "Nein" },
  { value: 1, label: "Manchmal" },
  { value: 2, label: "Oft" },
];

export const STRENGTHS = [
  "Zuverlässigkeit", "Teamfähigkeit", "Belastbarkeit", "Kundenorientierung", "Organisationstalent", "Kommunikationsstärke",
  "Selbstständiges Arbeiten", "Lernbereitschaft", "Genauigkeit", "Flexibilität", "Führungsstärke", "Problemlösung",
  "Durchsetzungsvermögen", "Einfühlungsvermögen", "Technisches Verständnis", "Kreativität", "Pünktlichkeit", "Verhandlungsgeschick",
];
/** Bei Aus- und Weiterbildungen und Lücken genügt Ja/Nein */
export const YES_NO: { value: Level; label: string }[] = [
  { value: 0, label: "Nein" },
  { value: 2, label: "Ja" },
];

/** Antworten für Zeiten ohne Station. „Gesundheitliche Gründe“ bleibt beim Coach und geht nie an die KI. */
export const GAP_CHOICES = ["Bewerbungen geschrieben", "Arbeitsuchend gemeldet", "Minijob / Aushilfsjob (welcher?)", "Familie / Pflege von Angehörigen", "Gesundheitliche Gründe", "Eigenes Lernen oder Kurs (was?)", "Ehrenamt (wo?)", "Praktikum (wo?)"];
export const HEALTH = /gesundheit|krank|reha/i;
export const LANGUAGES = ["Englisch Grundkenntnisse", "Englisch gut", "Türkisch", "Russisch", "Arabisch", "Polnisch"];
export const AVAILABILITY = ["Vollzeit", "Teilzeit", "Bereit zu Schichtarbeit", "Bereit zu Wochenendarbeit", "Bereit zu Montage / Reisen", "Mobil mit eigenem Auto", "Mobil mit Bus und Bahn"];
/** Zeile mit Lücke zum Ausfüllen, z. B. „Schweißschein abgelegt (welcher?)“ */
export const asksDetail = (text: string) => /\((welche[rsn]?|wo|was|wie viele|wie lange)\?\)\s*$/i.test(text);

export const LICENCES = [
  "Führerschein Klasse B", "Führerschein Klasse C/CE", "Staplerschein", "Ersthelfer", "Brandschutzhelfer", "Ausbildereignung (AEVO)",
  "Sachkunde § 34a", "Gesundheitszeugnis", "Schweißerpass", "Elektrofachkraft",
];
export const BASE_SOFTWARE = ["Word", "Excel", "Outlook", "PowerPoint", "SAP", "Microsoft Teams"];

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const lvl = (v: unknown): Level => (v === 1 || v === 2 ? v : 0);
const choices = (v: unknown, max = 40): Choice[] =>
  Array.isArray(v)
    ? v
        .slice(0, max)
        .map((x) => (typeof x === "string" ? { text: x, level: 0 as Level } : { text: s((x as Choice)?.text, 200), level: lvl((x as Choice)?.level), ...((x as Choice)?.detail ? { detail: s((x as Choice).detail, 200) } : {}), ...((x as Choice)?.tr ? { tr: s((x as Choice).tr, 300) } : {}) }))
        .filter((c) => c.text.trim())
    : [];

/** Liste ankreuzbarer Einträge aus Texten, ohne doppelte */
export const toChoices = (list: string[], keep: Choice[] = [], tr: string[] = []): Choice[] => {
  const out = [...keep];
  list.forEach((t, i) => {
    if (t.trim() && !out.some((c) => c.text.toLowerCase() === t.trim().toLowerCase())) out.push({ text: t.trim(), level: 0, ...(tr[i]?.trim() ? { tr: tr[i].trim() } : {}) });
  });
  return out;
};

export const newStationKey = () => Math.random().toString(36).slice(2, 10);

export function normalizeSurvey(raw: unknown): SurveyData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stations = Array.isArray(r.stations)
    ? r.stations.slice(0, 25).map((x) => {
        const st = (x ?? {}) as Record<string, unknown>;
        return {
          key: s(st.key, 20) || newStationKey(),
          kind: (st.kind === "ausbildung" || st.kind === "luecke" ? st.kind : "arbeit") as StationKind,
          title: s(st.title, 200),
          company: s(st.company, 200),
          location: s(st.location, 120),
          start: s(st.start, 7),
          end: s(st.end, 7),
          current: Boolean(st.current),
          tasks: choices(st.tasks),
          tools: choices(st.tools, 20),
          ownTasks: s(st.ownTasks, 2000),
          leadership: s(st.leadership, 500),
          success: s(st.success, 2000),
          liked: s(st.liked, 1000),
        };
      })
    : [];
  return {
    stations,
    strengths: r.strengths ? choices(r.strengths) : toChoices(STRENGTHS),
    software: r.software ? choices(r.software) : toChoices(BASE_SOFTWARE),
    languages: r.languages ? choices(r.languages) : toChoices(LANGUAGES),
    licences: r.licences ? choices(r.licences) : toChoices(LICENCES),
    availability: r.availability ? choices(r.availability) : toChoices(AVAILABILITY),
    wish: s(r.wish, 1000),
    notes: s(r.notes, 2000),
  };
}

/** Wie weit ist der Bogen ausgefüllt? Eine Station zählt, wenn mindestens eine Tätigkeit angekreuzt ist. */
export function progress(d: SurveyData) {
  const done = d.stations.filter((st) => st.tasks.some((t) => t.level > 0) || st.ownTasks.trim()).length;
  return { done, total: d.stations.length };
}

export const formatMonth = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : v);
export const period = (st: Pick<Station, "start" | "end" | "current">, today = "heute") => [formatMonth(st.start), st.current ? today : formatMonth(st.end)].filter(Boolean).join(" – ");
