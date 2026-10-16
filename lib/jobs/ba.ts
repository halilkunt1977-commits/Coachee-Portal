import "server-only";
import type { Job, JobQuery } from "./shared";

/*
 * Jobbörse der Bundesagentur für Arbeit (öffentliche Schnittstelle, siehe github.com/bundesAPI/jobsuche-api).
 * Seit 2026 antwortet nur noch Version 6 (/pc/v6/jobs), die alte Version 4 lehnt mit 403 ab. Die älteren Adressen
 * bleiben als Rückfall in der Liste. Es werden nur Suchbegriffe gesendet, nie Daten über Coachees.
 * JOBSUCHE_URL kann die Adresse für Tests ersetzen.
 */
const BASE = () => process.env.JOBSUCHE_URL || "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const PATHS = ["/pc/v6/jobs", "/pc/v4/app/jobs", "/pc/v4/jobs"];
export const PAGE_SIZE = 25;

export class JobSearchError extends Error {}

const cache = new Map<string, { at: number; data: { jobs: Job[]; total: number } }>();
const TTL = 10 * 60 * 1000;
let workingPath: string | null = null;

/** Suchbegriff wie „Metallbauer · CNC-Fachkraft (Heidenhain / Siemens)“ auf das Wesentliche kürzen: die Jobbörse sucht sonst nach allem gleichzeitig */
export function cleanWas(was: string) {
  const first = was.replace(/\([^)]*\)/g, " ").split(/\s[·|•–—]\s|[·|•;]/)[0];
  return first.replace(/[^\p{L}\p{N}\s/+#.&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function searchJobs(q: JobQuery, page = 1): Promise<{ jobs: Job[]; total: number }> {
  // Homeoffice filtert Version 6 nicht mehr zuverlässig (liefert dann gar nichts), deshalb hier nach dem Abruf
  const zeiten = q.arbeitszeit.split(";").filter(Boolean);
  const homeoffice = zeiten.includes("ho");
  const params = new URLSearchParams({ angebotsart: String(q.angebotsart || 1), page: String(page), size: String(PAGE_SIZE) });
  const was = cleanWas(q.was);
  if (was) params.set("was", was);
  if (q.wo.trim()) {
    params.set("wo", q.wo.trim());
    if (q.umkreis) params.set("umkreis", String(q.umkreis));
  }
  const rest = zeiten.filter((z) => z !== "ho");
  if (rest.length) params.set("arbeitszeit", rest.join(";"));
  if (q.ohne_zeitarbeit) params.set("zeitarbeit", "false");
  const extra = new URLSearchParams(params);
  extra.set("veroeffentlichtseit", "60");
  extra.set("pav", "false");

  const key = extra.toString() + (homeoffice ? "&ho" : "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const tried: string[] = [];
  for (const path of workingPath ? [workingPath, ...PATHS.filter((p) => p !== workingPath)] : PATHS) {
    // Erst mit allen Filtern, bei „ungültige Anfrage“ noch einmal nur mit den Grundangaben
    for (const query of [extra, params]) {
      let res: Response;
      try {
        res = await fetch(`${BASE()}${path}?${query}`, {
          headers: { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; gruendarium-portal/1.0)" },
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        });
      } catch (e) {
        console.error("Jobbörse nicht erreichbar", e);
        throw new JobSearchError("Die Jobbörse der Arbeitsagentur antwortet gerade nicht. Bitte gleich noch einmal versuchen.");
      }
      if (res.ok) {
        let data = parseResult(await res.json().catch(() => ({})));
        if (homeoffice) data = { jobs: data.jobs.filter((j) => j.homeoffice !== false), total: data.total };
        workingPath = path;
        cache.set(key, { at: Date.now(), data });
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
        return data;
      }
      const body = await res.text().catch(() => "");
      tried.push(`${path} ${res.status} ${body.slice(0, 200)}`);
      if (res.status === 400 && query === extra) continue;
      break;
    }
    if (tried.at(-1)?.includes(" 429 ")) break;
    if (workingPath === path) workingPath = null;
  }
  console.error("[jobboerse] Suche abgelehnt:", tried.join(" | "));
  const status = tried.at(-1)?.split(" ")[1];
  if (status === "429") throw new JobSearchError("Die Jobbörse bekommt gerade zu viele Anfragen. Bitte in einer Minute noch einmal suchen.");
  throw new JobSearchError(`Die Jobbörse der Arbeitsagentur hat die Suche abgelehnt (Fehler ${status ?? "?"}). Bitte gib Bescheid, dann schaue ich es mir an.`);
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Antwort vorsichtig lesen, weil die Arbeitsagentur Feldnamen zwischen Versionen ändert. */
export function parseResult(data: unknown): { jobs: Job[]; total: number } {
  const d = (data ?? {}) as Raw;
  const list = (d.ergebnisliste ?? d.stellenangebote ?? d.ergebnisse ?? d.jobs ?? []) as Raw[];
  const jobs: Job[] = [];
  const title = (s: string) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : s);
  for (const x of Array.isArray(list) ? list : []) {
    const refnr = str(x.referenznummer) || str(x.refnr);
    if (!refnr) continue;
    // Version 6: stellenlokationen[].adresse, Version 4: arbeitsort
    const lok = (Array.isArray(x.stellenlokationen) ? x.stellenlokationen[0] : null) as Raw | null;
    const orte = ((lok?.adresse as Raw | undefined) ?? x.arbeitsort ?? (Array.isArray(x.arbeitsorte) ? x.arbeitsorte[0] : null) ?? {}) as Raw;
    const employer = str(x.firma) || (typeof x.arbeitgeber === "object" && x.arbeitgeber ? str((x.arbeitgeber as Raw).name) : str(x.arbeitgeber));
    const rawDist = str(x.entfernung) || str(orte.entfernung);
    const dist = Number(rawDist.replace(",", "."));
    const external = str(x.externeURL) || str(x.externeUrl);
    const period = (k: string) => str((x[k] as Raw | undefined)?.von);
    jobs.push({
      refnr,
      title: str(x.stellenangebotsTitel) || str(x.titel) || str(x.stellentitel) || str(x.hauptberuf) || str(x.beruf) || "Stellenangebot",
      beruf: str(x.hauptberuf) || str(x.beruf),
      employer,
      location: [str(orte.plz), title(str(orte.ort))].filter(Boolean).join(" ") || title(str(orte.region)),
      distance: rawDist && Number.isFinite(dist) ? dist : null,
      published: period("veroeffentlichungszeitraum") || str(x.aktuelleVeroeffentlichungsdatum) || str(x.datumErsteVeroeffentlichung) || str(x.veroeffentlichungsdatum) || null,
      start: period("eintrittszeitraum") || str(x.eintrittsdatum) || null,
      url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`,
      externalUrl: /^https?:\/\//.test(external) ? external : null,
      homeoffice: typeof x.homeofficemoeglich === "boolean" ? x.homeofficemoeglich : undefined,
    });
  }
  const total = Number(d.maxErgebnisse ?? d.anzahlErgebnisse ?? jobs.length) || jobs.length;
  return { jobs, total };
}
