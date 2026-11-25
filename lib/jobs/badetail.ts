import "server-only";

/*
 * Anzeige der Arbeitsagentur direkt im Portal zeigen (Seite /stelle/<refnr>).
 * Die Seite arbeitsagentur.de lädt in manchen Netzen nicht (z. B. Handy-Hotspot), unser Server in Deutschland kommt aber ran.
 * Es wird nur die Referenznummer gesendet, nie Daten über Coachees.
 * Wege, parallel probiert, der erste Treffer zählt:
 *  1. Schnittstelle /pc/v4/jobdetails/<refnr base64> (bundesAPI/jobsuche-api), falls noch aktiv
 *  2. Die Anzeigenseite selbst: sie enthält die Daten als JSON im Skript „ng-state“
 * JOBSUCHE_URL / JOBSUCHE_WEB_URL können die Adressen für Tests ersetzen.
 */
const API = () => process.env.JOBSUCHE_URL || "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const WEB = () => process.env.JOBSUCHE_WEB_URL || "https://www.arbeitsagentur.de";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export type JobDetail = {
  refnr: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  facts: { label: string; value: string }[];
  externalUrl: string | null;
};

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

const cache = new Map<string, { at: number; data: JobDetail | null }>();
const TTL = 30 * 60 * 1000;

/** HTML-Reste entfernen, Absätze erhalten */
export function plainText(s: string) {
  return s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<(ul|ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DESC_KEYS = ["stellenangebotsBeschreibung", "stellenbeschreibung", "stellenBeschreibung", "beschreibung"];

/** Im (verschachtelten) JSON das Objekt suchen, das die Stellenbeschreibung enthält */
function findJob(v: unknown, depth = 0): Raw | null {
  if (depth > 12) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const f = findJob(x, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (!isObj(v)) {
    // ng-state legt Antworten manchmal als JSON-Text ab
    if (typeof v === "string" && v.length > 200 && v.trimStart().startsWith("{") && DESC_KEYS.some((k) => v.includes(`"${k}"`))) {
      try {
        return findJob(JSON.parse(v), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (DESC_KEYS.some((k) => typeof v[k] === "string" && (v[k] as string).length > 40)) return v;
  for (const x of Object.values(v)) {
    const f = findJob(x, depth + 1);
    if (f) return f;
  }
  return null;
}

const MONATE = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

/** „VOLLZEIT“ / „TEILZEIT_FLEXIBEL“ lesbar machen */
const nice = (s: string) => (/^[A-ZÄÖÜ_]+$/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : s);

function list(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => nice(isObj(x) ? str(x.bezeichnung) || str(x.name) || str(x.hierarchieName) : str(x))).filter(Boolean).join(", ");
  return nice(str(v));
}

/** Feldnamen ändern sich zwischen Versionen, deshalb vorsichtig lesen */
export function toDetail(refnr: string, x: Raw): JobDetail | null {
  const description = plainText(DESC_KEYS.map((k) => str(x[k])).find(Boolean) ?? "");
  if (!description) return null;
  const lok = Array.isArray(x.stellenlokationen) ? (x.stellenlokationen[0] as Raw | undefined) : undefined;
  const orte = (isObj(lok?.adresse) ? lok!.adresse : Array.isArray(x.arbeitsorte) ? x.arbeitsorte[0] : x.arbeitsort) as Raw | undefined;
  const location = orte ? [str(orte.plz), str(orte.ort)].filter(Boolean).join(" ") || str(orte.region) : "";
  const employer = str(x.firma) || (isObj(x.arbeitgeber) ? str(x.arbeitgeber.name) : str(x.arbeitgeber));
  const von = (k: string) => (isObj(x[k]) ? str((x[k] as Raw).von) : str(x[k]));
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => value && facts.push({ label, value });
  add("Beruf", str(x.hauptberuf) || list(x.berufe) || str(x.beruf));
  add("Arbeitszeit", list(x.arbeitszeitmodelle) || list(x.arbeitszeiten) || str(x.arbeitszeit));
  const start = von("eintrittszeitraum") || str(x.eintrittsdatum);
  add("Beginn", start ? MONATE(start) : x.ab_sofort === true || x.eintrittAbSofort === true ? "ab sofort" : "");
  add("Befristung", typeof x.befristung === "string" ? nice(x.befristung) : str(x.vertragsdauer));
  add("Vergütung", str(x.verguetung) || str(x.gehalt));
  add("Veröffentlicht", (() => { const d = von("veroeffentlichungszeitraum") || str(x.aktuelleVeroeffentlichungsdatum) || str(x.datumErsteVeroeffentlichung); return d ? MONATE(d) : ""; })());
  const ext = str(x.externeURL) || str(x.externeUrl) || str(x.allianzpartnerUrl);
  return {
    refnr,
    title: str(x.stellenangebotsTitel) || str(x.titel) || str(x.stellentitel) || str(x.hauptberuf) || "Stellenangebot",
    employer,
    location,
    description,
    facts,
    externalUrl: /^https?:\/\//.test(ext) ? ext : null,
  };
}

async function viaApi(refnr: string): Promise<JobDetail> {
  const id = Buffer.from(refnr).toString("base64");
  const res = await fetch(`${API()}/pc/v4/jobdetails/${id}`, {
    headers: { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const d = await res.json();
  const job = findJob(d) ?? (isObj(d) ? d : null);
  const out = job && toDetail(refnr, job);
  if (!out) throw new Error("api ohne Beschreibung");
  return out;
}

/** JSON aus <script id="ng-state" ...> (oder ähnlichen Skripten) der Anzeigenseite lesen */
export function detailFromHtml(refnr: string, html: string): JobDetail | null {
  const scripts = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const raw of scripts) {
    if (!DESC_KEYS.some((k) => raw.includes(k))) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw.replace(/&q;/g, '"').replace(/&a;/g, "&").replace(/&s;/g, "'").replace(/&l;/g, "<").replace(/&g;/g, ">"));
    } catch {
      continue;
    }
    const job = findJob(data);
    const out = job && toDetail(refnr, job);
    if (out) return out;
  }
  return null;
}

async function viaWeb(refnr: string): Promise<JobDetail> {
  const res = await fetch(`${WEB()}/jobsuche/jobdetail/${encodeURIComponent(refnr)}`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`web ${res.status}`);
  const out = detailFromHtml(refnr, await res.text());
  if (!out) throw new Error("web ohne Beschreibung");
  return out;
}

/** Anzeige holen, null wenn sie nicht (mehr) zu bekommen ist */
export async function fetchBaDetail(refnr: string): Promise<JobDetail | null> {
  const hit = cache.get(refnr);
  if (hit && Date.now() - hit.at < (hit.data ? TTL : 2 * 60 * 1000)) return hit.data;
  let data: JobDetail | null = null;
  try {
    data = await Promise.any([viaApi(refnr), viaWeb(refnr)]);
  } catch (e) {
    console.error("[jobboerse] Anzeige nicht abrufbar", refnr, e instanceof AggregateError ? e.errors.map(String).join(" | ") : e);
  }
  cache.set(refnr, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return data;
}
