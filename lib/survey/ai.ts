import "server-only";
import { jsonResponse, pseudonymize } from "../ai";
import type { CvData, CvSkill } from "../cv/types";
import { GAP_CHOICES, HEALTH, newStationKey, normalizeSurvey, period, toChoices, type Choice, type Station, type SurveyData } from "./types";

type Usage = { coacheeId: string; userId: string; names?: string[] };
const str = { type: "string" };
const strs = { type: "array", items: str };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const TASKS_RULES = `- tasks: 10 bis 16 typische, konkrete Tätigkeiten, die man genau dort macht, als kurze Aussage ohne „Ich“, z. B. „Wareneingang: Annahme, Sichtkontrolle und Abgleich mit Lieferschein“ oder „Zuschnitt mit hydraulischer Schlagschere, Bandsäge und Kreissäge“. Konkret mit Maschinen, Verfahren und Material in Klammern, von alltäglich bis anspruchsvoll, damit der Teilnehmer ankreuzen kann, was er wirklich gemacht hat. Was im Lebenslauf schon steht, ist dabei. Wo eine Angabe fehlt, die der Teilnehmer ergänzen soll, endet die Zeile mit einer Frage in Klammern, z. B. „Schweißen von Baugruppen (welche Verfahren?)“ wird zu „Schweißen von Baugruppen (welche?)“, „Schweißschein abgelegt (welcher?)“, „Praktikum im Betrieb (wo?)“.
- Bei Aus- und Weiterbildungen: die gelernten Inhalte und Fertigkeiten, dazu „Abschlussprüfung bestanden“ bzw. „Zertifikat erhalten“ und, wenn üblich, „Praktikum im Betrieb (wo?)“. Bei Coachings oder Maßnahmen: was dort gemacht wurde.
- tools: bis zu 8 Maschinen, Geräte, Programme oder Verfahren, die dort typisch sind (z. B. „Gabelstapler“, „Handscanner / MDE“, „SAP“, „Heidenhain-Steuerung“). Leer, wenn nichts passt.
- Einfache, verständliche Sprache. Nichts zur Gesundheit.`;

const SCHOOL = /schule|gymnasium|abitur|mittlere reife|schulabschluss|berufsvorbereitung|\bbvj\b/i;
const month = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? Number(v.slice(0, 4)) * 12 + Number(v.slice(5)) - 1 : null);
const ym = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
const blank = (p: Partial<Station>): Station => ({ key: newStationKey(), kind: "arbeit", title: "", company: "", location: "", start: "", end: "", current: false, tasks: [], tools: [], ownTasks: "", leadership: "", success: "", liked: "", ...p });

/** Zeiten ab drei Monaten ohne Station, auch die Zeit seit der letzten Station bis heute */
function gaps(stations: Station[]): Station[] {
  const now = new Date();
  const today = now.getFullYear() * 12 + now.getMonth();
  const spans = stations
    .map((st) => ({ from: month(st.start), to: st.current ? today : month(st.end) ?? month(st.start) }))
    .filter((x): x is { from: number; to: number } => x.from != null && x.to != null)
    .sort((x, y) => x.from - y.from);
  const out: Station[] = [];
  let covered = spans[0]?.from ?? null;
  for (const sp of spans) {
    if (covered != null && sp.from - covered > 3) out.push(blank({ kind: "luecke", title: "Zeit ohne Eintrag", start: ym(covered + 1), end: ym(sp.from - 1), tasks: toChoices(GAP_CHOICES) }));
    covered = covered == null ? sp.to : Math.max(covered, sp.to);
  }
  if (covered != null && today - covered >= 3) out.push(blank({ kind: "luecke", title: "Zeit ohne Eintrag", start: ym(covered + 1), current: true, tasks: toChoices(GAP_CHOICES) }));
  return out;
}

/** Aus dem Lebenslauf einen Bogen zum Ankreuzen machen: Stellen, Aus- und Weiterbildungen und Lücken, älteste zuerst. */
export async function surveyFromCv(cv: CvData, u: Usage, keep?: SurveyData): Promise<SurveyData> {
  const base = keep ?? normalizeSurvey({});
  const entries: Station[] = [
    ...cv.experience.filter((e) => e.title || e.company).map((e) => blank({ kind: "arbeit", title: e.title, company: e.company, location: e.location, start: e.start, end: e.end, current: e.current })),
    ...cv.education
      .filter((e) => (e.degree || e.school) && !SCHOOL.test(`${e.degree} ${e.school}`))
      .map((e) => blank({ kind: "ausbildung", title: e.degree, company: e.school, location: e.location, start: e.start, end: e.end })),
  ];
  if (!entries.length) return { ...base, stations: [] };
  const bullets = (st: Station) => cv.experience.find((e) => e.title === st.title && e.company === st.company)?.bullets ?? cv.education.find((e) => e.degree === st.title && e.school === st.company)?.detail ?? "";
  const input = entries
    .map((st, i) => `${i + 1}. ${st.kind === "ausbildung" ? "Aus-/Weiterbildung oder Maßnahme" : "Stelle"}: ${st.title} bei ${st.company || "unbekannt"}${st.location ? ` in ${st.location}` : ""} (${period(st)})\n${bullets(st)}`)
    .join("\n\n");
  const result = await jsonResponse<{ stations: { tasks: string[]; tools: string[] }[]; software: string[]; languages: string[] }>({
    coacheeId: u.coacheeId,
    userId: u.userId,
    purpose: "survey_build",
    instructions: `Du bereitest für ein Jobcoaching einen Fragebogen vor, in dem der Teilnehmer zu jeder Station seines Lebenslaufs ankreuzt, was er dort gemacht hat. Für jede Station (gleiche Reihenfolge, gleiche Anzahl) lieferst du:
${TASKS_RULES}
Außerdem software: Programme und digitale Kenntnisse aus dem Lebenslauf (z. B. „OpenOffice“, „3D-Modellierung mit Blender“, „Videobearbeitung“, „CAD-Programm (welches?)“), ohne Word, Excel, Outlook, PowerPoint, SAP und Teams.
Und languages: Sprachen aus dem Lebenslauf mit Niveau, z. B. „Englisch Grundkenntnisse“, ohne Deutsch.`,
    input: `${input}\n\nKenntnisse laut Lebenslauf: ${[...cv.skills.map((x) => x.name), ...cv.languages.map((x) => `${x.name} ${x.level}`), cv.interests].filter(Boolean).join(", ")}`,
    schemaName: "erfahrungsbogen",
    schema: obj({ stations: { type: "array", items: obj({ tasks: strs, tools: strs }) }, software: strs, languages: strs }),
    maxTokens: 10000,
  });
  entries.forEach((st, i) => {
    st.tasks = toChoices(result.stations?.[i]?.tasks ?? []);
    st.tools = toChoices(result.stations?.[i]?.tools ?? []);
  });
  const all = [...entries, ...gaps(entries)].sort((x, y) => (month(x.start) ?? 0) - (month(y.start) ?? 0));
  return {
    ...base,
    software: toChoices(result.software ?? [], base.software),
    languages: toChoices(result.languages ?? [], base.languages),
    stations: all,
  };
}

/** Typische Tätigkeiten für eine von Hand ergänzte Station */
export async function tasksForStation(st: Pick<Station, "title" | "company">, u: Usage) {
  const r = await jsonResponse<{ tasks: string[]; tools: string[] }>({
    coacheeId: u.coacheeId,
    userId: u.userId,
    purpose: "survey_station",
    instructions: `Du bereitest für ein Jobcoaching einen Fragebogen vor. Für die genannte Stelle lieferst du:\n${TASKS_RULES}`,
    input: `${st.title} bei ${st.company || "unbekannt"}`,
    schemaName: "station",
    schema: obj({ tasks: strs, tools: strs }),
    maxTokens: 2000,
  });
  return { tasks: toChoices(r.tasks ?? []), tools: toChoices(r.tools ?? []) };
}

/** Aus dem ausgefüllten Bogen Tätigkeitsbeschreibungen, Kurzprofil und Kenntnisse für den neuen Lebenslauf schreiben */
export async function cvFromSurvey(d: SurveyData, base: CvData, u: Usage): Promise<CvData> {
  const lv = (l: number) => (l === 2 ? "oft" : "manchmal");
  const say = (t: Choice) => `${t.text.replace(/\s*\([^)]*\?\)\s*$/, "")}${t.detail ? `: ${t.detail}` : ""}`;
  const stations = d.stations.filter((st) => st.kind !== "luecke");
  const input = [
    d.wish && `Berufswunsch: ${d.wish}`,
    ...stations.map((st, i) =>
      [
        `Station ${i + 1} (${st.kind === "ausbildung" ? "Aus-/Weiterbildung" : "Stelle"}): ${st.title} bei ${st.company} (${period(st)})`,
        `${st.kind === "ausbildung" ? "Inhalte" : "Tätigkeiten"}: ${st.tasks.filter((t) => t.level > 0 && !HEALTH.test(t.text)).map((t) => (st.kind === "ausbildung" ? say(t) : `${say(t)} (${lv(t.level)})`)).join("; ") || "–"}`,
        st.tools.some((t) => t.level > 0) && `Arbeitsmittel: ${st.tools.filter((t) => t.level > 0).map((t) => t.text).join(", ")}`,
        st.ownTasks && `Eigene Angaben: ${st.ownTasks}`,
        st.leadership && `Verantwortung: ${st.leadership}`,
        st.success && `Erfolge: ${st.success}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    `Stärken: ${d.strengths.filter((t) => t.level > 0).map((t) => t.text).join(", ")}`,
    `Programme: ${d.software.filter((t) => t.level > 0).map((t) => `${say(t)} (${t.level === 2 ? "gut" : "Grundkenntnisse"})`).join(", ")}`,
    `Sprachen: ${d.languages.filter((t) => t.level > 0).map(say).join(", ")}`,
    `Einsatzbereitschaft: ${d.availability.filter((t) => t.level > 0).map(say).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const clean = pseudonymize(input, u.names ?? []);
  const r = await jsonResponse<{ stations: { bullets: string[] }[]; summary: string; headline: string; skills: { name: string; level: number }[] }>({
    coacheeId: u.coacheeId,
    userId: u.userId,
    purpose: "survey_cv",
    instructions: `Du schreibst für einen Lebenslauf aus einem ausgefüllten Erfahrungsbogen die Tätigkeitsbeschreibungen.
- stations: gleiche Reihenfolge und Anzahl wie im Bogen. Je Stelle 4 bis 7 Stichpunkte, je Aus-/Weiterbildung 2 bis 4 Stichpunkte zu den Inhalten in knappem, starkem Lebenslauf-Deutsch (Verb am Ende oder Nominalstil, ohne „Ich“), Wichtigstes und „oft“ zuerst. Ähnliches zusammenfassen, Erfolge und Verantwortung mit Zahlen übernehmen. Nichts erfinden.
- summary: Kurzprofil bzw. kurzer Pitch für Bewerbungen in 2 bis 3 Sätzen, passend zum Berufswunsch, mit den stärksten Belegen, ohne Namen.
- headline: Berufsbezeichnung bzw. Wunschposition.
- skills: 6 bis 12 Fach-, Programm- und persönliche Kenntnisse, level 1 bis 5 (oft = 4, manchmal = 3).`,
    input: clean,
    schemaName: "lebenslauf_text",
    schema: obj({ stations: { type: "array", items: obj({ bullets: strs }) }, summary: str, headline: str, skills: { type: "array", items: obj({ name: str, level: { type: "integer" } }) } }),
    maxTokens: 8000,
  });
  const cv: CvData = structuredClone(base);
  const text = (i: number) => (r.stations?.[i]?.bullets ?? []).map((b) => b.trim()).filter(Boolean).join("\n");
  const work = stations.map((st, i) => ({ st, i })).filter((x) => x.st.kind === "arbeit");
  const edu = stations.map((st, i) => ({ st, i })).filter((x) => x.st.kind === "ausbildung");
  // Neueste zuerst, wie im Lebenslauf üblich
  const newest = <T extends { st: Station }>(list: T[]) => [...list].sort((a, b) => (b.st.current ? "9999" : b.st.end || b.st.start).localeCompare(a.st.current ? "9999" : a.st.end || a.st.start));
  cv.experience = newest(work).map(({ st, i }) => {
    const old = base.experience.find((e) => e.title === st.title && e.company === st.company);
    return { title: st.title, company: st.company, location: st.location, start: st.start, end: st.end, current: st.current, bullets: text(i) || old?.bullets || "" };
  });
  const school = base.education.filter((e) => !edu.some(({ st }) => st.title === e.degree && st.company === e.school));
  cv.education = [
    ...newest(edu).map(({ st, i }) => {
      const old = base.education.find((e) => e.degree === st.title && e.school === st.company);
      return { degree: st.title, school: st.company, location: st.location, start: st.start, end: st.end, detail: text(i).split("\n").join(", ") || old?.detail || "" };
    }),
    ...school,
  ];
  const langs = d.languages.filter((t) => t.level > 0).map((t) => t.text);
  for (const l of langs) {
    const [name, ...lvl] = l.split(" ");
    if (!cv.languages.some((x) => x.name.toLowerCase() === name.toLowerCase())) cv.languages.push({ name, level: lvl.join(" ") });
  }
  if (r.summary) cv.summary = r.summary;
  if (r.headline && !cv.personal.headline) cv.personal.headline = r.headline;
  const skills: CvSkill[] = (r.skills ?? []).map((x) => ({ name: x.name.slice(0, 100), level: Math.min(5, Math.max(0, Math.round(x.level))) }));
  if (skills.length) cv.skills = skills;
  const licences = d.licences.filter((t) => t.level > 0).map((t) => t.text);
  const license = licences.filter((t) => t.startsWith("Führerschein")).map((t) => t.replace("Führerschein ", "")).join(", ");
  if (license && !cv.personal.license) cv.personal.license = license;
  for (const l of licences.filter((t) => !t.startsWith("Führerschein"))) {
    if (!cv.certificates.some((c) => c.name.toLowerCase() === l.toLowerCase())) cv.certificates.push({ name: l, institution: "", year: "" });
  }
  return cv;
}
