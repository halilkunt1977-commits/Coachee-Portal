import "server-only";
import { jsonResponse, pseudonymize } from "../ai";
import type { CvData, CvSkill } from "../cv/types";
import { newStationKey, normalizeSurvey, period, toChoices, type Station, type SurveyData } from "./types";

type Usage = { coacheeId: string; userId: string; names?: string[] };
const str = { type: "string" };
const strs = { type: "array", items: str };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const TASKS_RULES = `- tasks: 12 bis 16 typische, konkrete Tätigkeiten, die man in genau dieser Stelle und Branche macht, als kurze Aussage ohne „Ich“, z. B. „Wareneingang prüfen und buchen“, „Schichtpläne für das Team erstellen“. Von alltäglich bis anspruchsvoll, damit der Teilnehmer ankreuzen kann, was er wirklich gemacht hat. Was im Lebenslauf schon steht, ist dabei.
- tools: bis zu 8 Maschinen, Geräte, Programme oder Verfahren, die in dieser Stelle typisch sind (z. B. „Gabelstapler“, „Warenwirtschaftssystem“, „SAP MM“, „Kassensystem“). Leer, wenn nichts passt.
- Einfache, verständliche Sprache, keine Fachbegriffe ohne Not. Nichts zur Gesundheit.`;

/** Aus den Stationen des Lebenslaufs einen Bogen zum Ankreuzen machen: je Station typische Tätigkeiten und Werkzeuge. */
export async function surveyFromCv(cv: CvData, u: Usage, keep?: SurveyData): Promise<SurveyData> {
  const stations = cv.experience.filter((e) => e.title || e.company);
  const base = keep ?? normalizeSurvey({});
  if (!stations.length) return { ...base, stations: [] };
  const input = stations.map((e, i) => `Station ${i + 1}: ${e.title} bei ${e.company || "unbekannt"}${e.location ? ` in ${e.location}` : ""} (${period(e)})\n${e.bullets}`).join("\n\n");
  const result = await jsonResponse<{ stations: { tasks: string[]; tools: string[] }[]; software: string[] }>({
    coacheeId: u.coacheeId,
    userId: u.userId,
    purpose: "survey_build",
    instructions: `Du bereitest für ein Jobcoaching einen Fragebogen vor. Für jede Station aus dem Lebenslauf (gleiche Reihenfolge, gleiche Anzahl) lieferst du:
${TASKS_RULES}
Außerdem software: Programme, die bei diesen Stationen vorkommen (z. B. „DATEV“, „Lexware“), ohne Word, Excel, Outlook, PowerPoint, SAP und Teams.`,
    input,
    schemaName: "erfahrungsbogen",
    schema: obj({ stations: { type: "array", items: obj({ tasks: strs, tools: strs }) }, software: strs }),
    maxTokens: 8000,
  });
  return {
    ...base,
    software: toChoices(result.software ?? [], base.software),
    stations: stations.map((e, i) => ({
      key: newStationKey(),
      title: e.title,
      company: e.company,
      location: e.location,
      start: e.start,
      end: e.end,
      current: e.current,
      tasks: toChoices(result.stations?.[i]?.tasks ?? []),
      tools: toChoices(result.stations?.[i]?.tools ?? []),
      ownTasks: "",
      leadership: "",
      success: "",
      liked: "",
    })),
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
  const input = [
    d.wish && `Berufswunsch: ${d.wish}`,
    ...d.stations.map((st, i) =>
      [
        `Station ${i + 1}: ${st.title} bei ${st.company} (${period(st)})`,
        `Tätigkeiten: ${st.tasks.filter((t) => t.level > 0).map((t) => `${t.text} (${lv(t.level)})`).join("; ") || "–"}`,
        st.tools.some((t) => t.level > 0) && `Arbeitsmittel: ${st.tools.filter((t) => t.level > 0).map((t) => t.text).join(", ")}`,
        st.ownTasks && `Eigene Angaben: ${st.ownTasks}`,
        st.leadership && `Verantwortung: ${st.leadership}`,
        st.success && `Erfolge: ${st.success}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    `Stärken: ${d.strengths.filter((t) => t.level > 0).map((t) => t.text).join(", ")}`,
    `Programme: ${d.software.filter((t) => t.level > 0).map((t) => `${t.text} (${lv(t.level)})`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const clean = pseudonymize(input, u.names ?? []);
  const r = await jsonResponse<{ stations: { bullets: string[] }[]; summary: string; headline: string; skills: { name: string; level: number }[] }>({
    coacheeId: u.coacheeId,
    userId: u.userId,
    purpose: "survey_cv",
    instructions: `Du schreibst für einen Lebenslauf aus einem ausgefüllten Erfahrungsbogen die Tätigkeitsbeschreibungen.
- stations: gleiche Reihenfolge und Anzahl wie im Bogen. Je Station 4 bis 7 Stichpunkte in knappem, starkem Lebenslauf-Deutsch (Verb am Ende oder Nominalstil, ohne „Ich“), Wichtigstes und „oft“ zuerst. Ähnliches zusammenfassen, Erfolge und Verantwortung mit Zahlen übernehmen. Nichts erfinden.
- summary: Kurzprofil in 2 bis 3 Sätzen, passend zum Berufswunsch, ohne Namen.
- headline: Berufsbezeichnung bzw. Wunschposition.
- skills: 6 bis 12 Fach-, Programm- und persönliche Kenntnisse, level 1 bis 5 (oft = 4, manchmal = 3).`,
    input: clean,
    schemaName: "lebenslauf_text",
    schema: obj({ stations: { type: "array", items: obj({ bullets: strs }) }, summary: str, headline: str, skills: { type: "array", items: obj({ name: str, level: { type: "integer" } }) } }),
    maxTokens: 8000,
  });
  const cv: CvData = structuredClone(base);
  cv.experience = d.stations.map((st, i) => {
    const old = base.experience.find((e) => e.title === st.title && e.company === st.company);
    const bullets = (r.stations?.[i]?.bullets ?? []).map((b) => b.trim()).filter(Boolean).join("\n");
    return { title: st.title, company: st.company, location: st.location, start: st.start, end: st.end, current: st.current, bullets: bullets || old?.bullets || "" };
  });
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
