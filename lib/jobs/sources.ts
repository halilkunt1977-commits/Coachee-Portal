import "server-only";
import { cleanWas, JobSearchError, PAGE_SIZE, searchJobs } from "./ba";
import { SOURCE_LABEL, type Job, type JobQuery, type JobSource } from "./shared";

/*
 * Stellensuche über mehrere Börsen: immer die Bundesagentur, dazu Adzuna und Jooble, sobald deren Zugangsschlüssel
 * in den Einstellungen stehen (ADZUNA_APP_ID + ADZUNA_APP_KEY, JOOBLE_API_KEY; beide kostenlos für Entwickler).
 * Beide sammeln Stellen aus vielen Börsen und Firmenseiten (StepStone, Indeed, Karriereseiten usw.).
 * Wie bei der Arbeitsagentur gehen nur Suchbegriff und Ort hinaus, nie Daten über Coachees.
 * Fällt eine Börse aus, kommen die Treffer der anderen trotzdem. ADZUNA_URL und JOOBLE_URL ersetzen die Adressen für Tests.
 */

export type SourceInfo = { key: JobSource; label: string; count: number; error?: string };
export type MultiResult = { jobs: Job[]; total: number; sources: SourceInfo[] };

const adzunaKeys = () => (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? { id: process.env.ADZUNA_APP_ID, key: process.env.ADZUNA_APP_KEY } : null);
const joobleKey = () => process.env.JOOBLE_API_KEY || null;

/** Welche Börsen gerade abgefragt werden (für den Hinweis in der Suche) */
export const activeSources = (): JobSource[] => ["ba", ...(adzunaKeys() ? (["adzuna"] as const) : []), ...(joobleKey() ? (["jooble"] as const) : [])];

const cache = new Map<string, { at: number; data: { jobs: Job[]; total: number } }>();
const TTL = 10 * 60 * 1000;

async function cached(key: string, load: () => Promise<{ jobs: Job[]; total: number }>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return data;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
/** Treffer-Hervorhebungen (<b>…</b>) und Entities aus Titeln entfernen */
const plain = (v: unknown) =>
  str(v)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
const httpUrl = (v: unknown) => (/^https?:\/\/\S+$/i.test(str(v)) ? str(v) : "");
const isoDay = (v: unknown) => {
  const d = new Date(str(v));
  return str(v) && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

/** Suchbegriff für Börsen ohne eigene Filter: Ausbildung/Praktikum und Homeoffice als Stichwort ergänzen */
function keywords(q: JobQuery) {
  const extra = [q.angebotsart === 4 && "Ausbildung", q.angebotsart === 34 && "Praktikum", q.arbeitszeit.split(";").includes("ho") && "Homeoffice"];
  return [cleanWas(q.was), ...extra].filter(Boolean).join(" ");
}

// Personaldienstleister erkennen, wenn „ohne Zeitarbeit“ gewählt ist (die anderen Börsen haben dafür keinen Filter)
const ZEITARBEIT =
  /zeitarbeit|personaldienst|personalservice|personal-service|arbeitnehmerüberlassung|randstad|adecco|manpower|persona service|tempton|orizon|amadeus fire|hays\b|brunel|piening|avitea|gulp|jobactive|dis ag|timepartner|trenkwalder|unique personal|i\.k\. hofmann|ik hofmann|actief|start people|expertum|office people|run personal|jobimpulse|franz & wach|pluss\b|wirtz|zag personal|autovision|serviceline|hofmann personal/i;

const refOf = (source: JobSource, id: string) => `${source}:${id}`.slice(0, 80);

export async function searchAdzuna(q: JobQuery, page = 1): Promise<{ jobs: Job[]; total: number }> {
  const keys = adzunaKeys();
  if (!keys) return { jobs: [], total: 0 };
  // Selbstständigkeit gibt es dort nicht
  if (q.angebotsart === 2) return { jobs: [], total: 0 };
  const params = new URLSearchParams({ app_id: keys.id, app_key: keys.key, results_per_page: String(PAGE_SIZE), max_days_old: "60", sort_by: "date", "content-type": "application/json" });
  const what = keywords(q);
  if (what) params.set("what", what);
  if (q.wo.trim()) {
    params.set("where", q.wo.trim());
    params.set("distance", String(q.umkreis || 5));
  }
  const zeiten = q.arbeitszeit.split(";");
  if (zeiten.includes("vz") && !zeiten.includes("tz")) params.set("full_time", "1");
  if (zeiten.includes("tz") && !zeiten.includes("vz")) params.set("part_time", "1");
  const base = process.env.ADZUNA_URL || "https://api.adzuna.com/v1/api/jobs/de/search";
  const url = `${base}/${page}?${params}`;
  return cached(`adzuna ${q.ohne_zeitarbeit} ${url.replace(keys.key, "")}`, async () => {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" }).catch((e) => {
      console.error("Adzuna nicht erreichbar", e);
      throw new JobSearchError("Adzuna antwortet gerade nicht.");
    });
    if (!res.ok) {
      console.error("[adzuna] Suche abgelehnt:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      throw new JobSearchError(`Adzuna hat die Suche abgelehnt (Fehler ${res.status}).`);
    }
    return parseAdzuna(await res.json().catch(() => ({})), q.ohne_zeitarbeit);
  });
}

export function parseAdzuna(data: unknown, ohneZeitarbeit = false): { jobs: Job[]; total: number } {
  const d = (data ?? {}) as Raw;
  const jobs: Job[] = [];
  for (const x of Array.isArray(d.results) ? (d.results as Raw[]) : []) {
    const id = str(x.id);
    const url = httpUrl(x.redirect_url);
    if (!id || !url) continue;
    const employer = plain((x.company as Raw | undefined)?.display_name);
    if (ohneZeitarbeit && ZEITARBEIT.test(employer)) continue;
    const loc = (x.location ?? {}) as Raw;
    const area = Array.isArray(loc.area) ? (loc.area as unknown[]).map(str) : [];
    jobs.push({
      refnr: refOf("adzuna", id),
      title: plain(x.title) || "Stellenangebot",
      beruf: "",
      employer,
      // „Nürnberg, Mittelfranken“ → Nürnberg; sonst die genaueste Angabe aus area
      location: plain(loc.display_name).split(",")[0] || area.at(-1) || "",
      distance: null,
      published: isoDay(x.created),
      start: null,
      url,
      externalUrl: url,
      homeoffice: undefined,
      source: "adzuna",
    });
  }
  return { jobs, total: Number(d.count) || jobs.length };
}

// Jooble kennt nur feste Umkreise
const JOOBLE_RADIUS = [0, 4, 8, 16, 26, 40, 80];

export async function searchJooble(q: JobQuery, page = 1): Promise<{ jobs: Job[]; total: number }> {
  const key = joobleKey();
  if (!key) return { jobs: [], total: 0 };
  if (q.angebotsart === 2) return { jobs: [], total: 0 };
  const radius = JOOBLE_RADIUS.find((r) => r >= (q.umkreis || 0)) ?? 80;
  const body = { keywords: keywords(q), location: q.wo.trim(), radius: String(radius), page: String(page), ResultOnPage: String(PAGE_SIZE), companysearch: "false" };
  const url = `${process.env.JOOBLE_URL || "https://jooble.org/api"}/${encodeURIComponent(key)}`;
  return cached(`jooble ${q.ohne_zeitarbeit} ${JSON.stringify(body)}`, async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    }).catch((e) => {
      console.error("Jooble nicht erreichbar", e);
      throw new JobSearchError("Jooble antwortet gerade nicht.");
    });
    if (!res.ok) {
      console.error("[jooble] Suche abgelehnt:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      throw new JobSearchError(`Jooble hat die Suche abgelehnt (Fehler ${res.status}).`);
    }
    return parseJooble(await res.json().catch(() => ({})), q);
  });
}

export function parseJooble(data: unknown, q: Pick<JobQuery, "ohne_zeitarbeit" | "arbeitszeit">): { jobs: Job[]; total: number } {
  const d = (data ?? {}) as Raw;
  const zeiten = q.arbeitszeit.split(";");
  const jobs: Job[] = [];
  for (const x of Array.isArray(d.jobs) ? (d.jobs as Raw[]) : []) {
    const id = str(x.id);
    const url = httpUrl(x.link);
    if (!id || !url) continue;
    const employer = plain(x.company);
    if (q.ohne_zeitarbeit && ZEITARBEIT.test(`${employer} ${plain(x.source)}`)) continue;
    // Arbeitszeit steht als Text in „type“ (z. B. „Vollzeit“, „Teilzeit“), ein fehlender Wert lässt den Treffer drin
    const type = plain(x.type).toLowerCase();
    if (type && zeiten.includes("vz") && !zeiten.includes("tz") && type.includes("teilzeit") && !type.includes("vollzeit")) continue;
    if (type && zeiten.includes("tz") && !zeiten.includes("vz") && type.includes("vollzeit") && !type.includes("teilzeit")) continue;
    jobs.push({
      refnr: refOf("jooble", id),
      title: plain(x.title) || "Stellenangebot",
      beruf: "",
      employer,
      location: plain(x.location).split(",")[0],
      distance: null,
      published: isoDay(x.updated),
      start: null,
      url,
      externalUrl: url,
      homeoffice: undefined,
      source: "jooble",
    });
  }
  return { jobs, total: Number(d.totalCount) || jobs.length };
}

/** Gleiche Stelle aus mehreren Börsen nur einmal zeigen (Titel + Arbeitgeber, ohne Zusätze wie „(m/w/d)“) */
const sameKey = (j: Job) =>
  `${j.title.toLowerCase().replace(/\((?:m|w|d|f|x|gn|all genders?)(?:\s*[/|,]\s*(?:m|w|d|f|x|gn))*\)|\*in\b/gi, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${j.employer
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|se|e\.?v\.?|co\.?|mbh|ug|ohg|&)\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")}`;

/** Treffer abwechselnd aus den Börsen mischen, die Arbeitsagentur zuerst, Doppelte fallen weg */
export function merge(lists: Job[][]): Job[] {
  const out: Job[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++)
    for (const l of lists) {
      const j = l[i];
      if (!j) continue;
      const k = sameKey(j);
      if (seen.has(j.refnr) || seen.has(k)) continue;
      seen.add(j.refnr);
      seen.add(k);
      out.push(j);
    }
  return out;
}

/** Alle eingerichteten Börsen gleichzeitig abfragen. Fehler nur, wenn keine einzige geantwortet hat. */
export async function searchAll(q: JobQuery, page = 1): Promise<MultiResult> {
  const keys = activeSources();
  const run: Record<JobSource, () => Promise<{ jobs: Job[]; total: number }>> = {
    ba: () => searchJobs(q, page).then((r) => ({ ...r, jobs: r.jobs.map((j) => ({ ...j, source: "ba" as const })) })),
    adzuna: () => searchAdzuna(q, page),
    jooble: () => searchJooble(q, page),
  };
  const results = await Promise.allSettled(keys.map((k) => run[k]()));
  const sources: SourceInfo[] = results.map((r, i) => ({
    key: keys[i],
    label: SOURCE_LABEL[keys[i]],
    count: r.status === "fulfilled" ? r.value.total : 0,
    ...(r.status === "rejected" ? { error: r.reason instanceof JobSearchError ? r.reason.message : `${SOURCE_LABEL[keys[i]]} ist gerade nicht erreichbar.` } : {}),
  }));
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) {
    const first = results[0] as PromiseRejectedResult;
    if (!(first.reason instanceof JobSearchError)) console.error("Stellensuche", first.reason);
    throw first.reason instanceof JobSearchError ? first.reason : new JobSearchError("Die Jobbörsen antworten gerade nicht. Bitte gleich noch einmal versuchen.");
  }
  return { jobs: merge(ok.map((r) => r.jobs)), total: ok.reduce((n, r) => n + r.total, 0), sources };
}
