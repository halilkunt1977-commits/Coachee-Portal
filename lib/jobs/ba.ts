import "server-only";
import type { Job, JobQuery } from "./shared";

/*
 * Jobbörse der Bundesagentur für Arbeit (öffentliche Schnittstelle, siehe github.com/bundesAPI/jobsuche-api).
 * Es werden nur Suchbegriffe gesendet, nie Daten über Coachees. JOBSUCHE_URL kann die Adresse für Tests ersetzen.
 */
const BASE = () => process.env.JOBSUCHE_URL || "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const PATHS = ["/pc/v4/jobs", "/pc/v6/jobs", "/pc/v4/app/jobs"];
export const PAGE_SIZE = 25;

export class JobSearchError extends Error {}

const cache = new Map<string, { at: number; data: { jobs: Job[]; total: number } }>();
const TTL = 10 * 60 * 1000;
let workingPath: string | null = null;

export async function searchJobs(q: JobQuery, page = 1): Promise<{ jobs: Job[]; total: number }> {
  const params = new URLSearchParams({ angebotsart: String(q.angebotsart || 1), page: String(page), size: String(PAGE_SIZE), veroeffentlichtseit: "60", pav: "false" });
  if (q.was.trim()) params.set("was", q.was.trim());
  if (q.wo.trim()) {
    params.set("wo", q.wo.trim());
    if (q.umkreis) params.set("umkreis", String(q.umkreis));
  }
  if (q.arbeitszeit) params.set("arbeitszeit", q.arbeitszeit);
  if (q.ohne_zeitarbeit) params.set("zeitarbeit", "false");
  const key = params.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let lastError = "";
  for (const path of workingPath ? [workingPath] : PATHS) {
    let res: Response;
    try {
      res = await fetch(`${BASE()}${path}?${key}`, {
        headers: { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json", "User-Agent": "gruendarium-portal/1.0" },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch (e) {
      console.error("Jobbörse nicht erreichbar", e);
      throw new JobSearchError("Die Jobbörse der Arbeitsagentur antwortet gerade nicht. Bitte gleich noch einmal versuchen.");
    }
    if (res.status === 404 || res.status === 410 || res.status === 405) {
      lastError = `${path}: ${res.status}`;
      continue;
    }
    if (!res.ok) {
      console.error("Jobbörse antwortet mit", res.status, await res.text().catch(() => ""));
      throw new JobSearchError("Die Jobbörse der Arbeitsagentur hat die Suche gerade abgelehnt. Bitte später noch einmal versuchen.");
    }
    const data = parseResult(await res.json());
    workingPath = path;
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return data;
  }
  console.error("Keine Jobsuche-Adresse funktioniert", lastError);
  throw new JobSearchError("Die Schnittstelle der Jobbörse hat sich geändert. Bitte gib deinem Coach Bescheid.");
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Antwort vorsichtig lesen, weil die Arbeitsagentur Feldnamen zwischen Versionen ändert. */
export function parseResult(data: unknown): { jobs: Job[]; total: number } {
  const d = (data ?? {}) as Raw;
  const list = (d.stellenangebote ?? d.ergebnisse ?? d.jobs ?? []) as Raw[];
  const jobs: Job[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const refnr = str(x.refnr) || str(x.referenznummer);
    if (!refnr) continue;
    const orte = (x.arbeitsort ?? (Array.isArray(x.arbeitsorte) ? x.arbeitsorte[0] : null) ?? {}) as Raw;
    const employer = typeof x.arbeitgeber === "object" && x.arbeitgeber ? str((x.arbeitgeber as Raw).name) : str(x.arbeitgeber);
    const dist = Number(str(orte.entfernung).replace(",", "."));
    const external = str(x.externeUrl);
    jobs.push({
      refnr,
      title: str(x.titel) || str(x.stellenangebotsTitel) || str(x.stellentitel) || str(x.beruf) || "Stellenangebot",
      beruf: str(x.beruf),
      employer,
      location: [str(orte.plz), str(orte.ort)].filter(Boolean).join(" ") || str(orte.region),
      distance: str(orte.entfernung) && Number.isFinite(dist) ? dist : null,
      published: str(x.aktuelleVeroeffentlichungsdatum) || str(x.veroeffentlichungsdatum) || null,
      start: str(x.eintrittsdatum) || null,
      url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`,
      externalUrl: /^https?:\/\//.test(external) ? external : null,
    });
  }
  const total = Number(d.maxErgebnisse ?? d.anzahlErgebnisse ?? jobs.length) || jobs.length;
  return { jobs, total };
}
