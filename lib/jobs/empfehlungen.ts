import "server-only";
import type { Coachee } from "../access";
import { normalizeCv } from "../cv/types";
import { one, query } from "../db";
import { cleanWas, JobSearchError, searchJobs } from "./ba";
import { normalizeQuery } from "./store";
import { today, type Job, type JobQuery } from "./shared";

/*
 * Stellenempfehlungen für die Startseite im Jobcoaching. Ohne KI: Suchbegriffe kommen der Reihe nach aus den
 * Wunschberufen im Kompetenzprofil, den gespeicherten Suchen, der Berufsbezeichnung und der letzten Station im
 * Lebenslauf. Ort aus gespeicherter Suche, Ziel („im Raum Nürnberg“), Lebenslauf oder Wohnort. An die Jobbörse
 * gehen nur Suchbegriff und Ort. Ergebnis wird pro Coachee und Tag in job_tips gespeichert.
 */

const MAX_TERMS = 2;
const KEEP = 15;

export type Tip = Job & { term: string };
export type TipsResult = { tips: Tip[]; queries: JobQuery[]; error?: string };

/** Ort aus dem Coaching-Ziel, z. B. „Teamleitung Logistik im Raum Nürnberg“ → „Nürnberg“ */
export function placeFromGoal(goal: string | null) {
  const m = String(goal ?? "").match(/\b(?:Raum|Großraum|Region|Umgebung von|Umkreis von)\s+([A-ZÄÖÜ][\p{L}.-]+(?:\s(?:an der|am|a\.\s?d\.)\s[A-ZÄÖÜ][\p{L}-]+)?)/u);
  return m ? m[1] : "";
}

/** Suchanfragen für die Startseite ableiten (höchstens zwei, ohne Dopplungen) */
export async function tipQueries(c: Coachee): Promise<JobQuery[]> {
  const [wishes, searches, cv] = await Promise.all([
    query<{ title: string }>("SELECT title FROM profile_items WHERE coachee_id = $1 AND category = 'wunsch' AND NOT internal ORDER BY created_at", [c.id]),
    query<{ was: string; wo: string; umkreis: number; arbeitszeit: string; angebotsart: number; ohne_zeitarbeit: boolean }>(
      "SELECT was, wo, umkreis, arbeitszeit, angebotsart, ohne_zeitarbeit FROM job_searches WHERE coachee_id = $1 AND was <> '' ORDER BY created_at",
      [c.id],
    ),
    one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
  ]);
  const d = cv ? normalizeCv(cv.data) : null;
  const latest = d?.experience.find((e) => e.current) ?? d?.experience[0];
  const place = searches.find((s) => s.wo)?.wo || placeFromGoal(c.goal) || d?.personal.city || d?.personal.zip || c.city || "";

  const out: JobQuery[] = [];
  const seen = new Set<string>();
  const add = (raw: Partial<JobQuery>) => {
    const q = normalizeQuery({ umkreis: 25, ...raw, was: cleanWas(raw.was ?? ""), wo: raw.wo || place });
    const key = q.was.toLowerCase();
    if (!q.was || seen.has(key) || out.length >= MAX_TERMS) return;
    seen.add(key);
    out.push(q);
  };
  for (const w of wishes) add({ was: w.title });
  for (const s of searches) add(s);
  if (d?.personal.headline) add({ was: d.personal.headline });
  if (latest?.title) add({ was: latest.title });
  return out;
}

const signatureOf = (qs: JobQuery[]) => JSON.stringify(qs.map((q) => [q.was, q.wo, q.umkreis, q.arbeitszeit, q.angebotsart, q.ohne_zeitarbeit]));

/** Treffer abwechselnd aus den Suchen mischen, Doppelte entfernen */
function interleave(lists: { term: string; jobs: Job[] }[]) {
  const out: Tip[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < KEEP && lists.some((l) => i < l.jobs.length); i++) {
    for (const l of lists) {
      const j = l.jobs[i];
      if (j && !seen.has(j.refnr)) {
        seen.add(j.refnr);
        out.push({ ...j, term: l.term });
      }
    }
  }
  return out.slice(0, KEEP);
}

/** Empfehlungen von heute aus dem Zwischenspeicher, sonst frisch von der Jobbörse. Gemerkte und ausgeblendete Stellen fallen weg. */
export async function jobTips(c: Coachee, limit = 5): Promise<TipsResult> {
  const queries = await tipQueries(c);
  if (!queries.length) return { tips: [], queries };
  const day = today();
  const signature = signatureOf(queries);
  const [cached, known] = await Promise.all([
    one<{ jobs: Tip[] }>("SELECT jobs FROM job_tips WHERE coachee_id = $1 AND day = $2 AND signature = $3", [c.id, day, signature]),
    query<{ refnr: string }>("SELECT refnr FROM applications WHERE coachee_id = $1 AND refnr IS NOT NULL UNION SELECT refnr FROM job_hidden WHERE coachee_id = $1", [c.id]),
  ]);
  let all = cached?.jobs;
  if (!all) {
    const results = await Promise.allSettled(queries.map((q) => searchJobs(q)));
    const ok = results.flatMap((r, i) => (r.status === "fulfilled" ? [{ term: queries[i].was, jobs: r.value.jobs }] : []));
    if (!ok.length) {
      const e = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (e && !(e.reason instanceof JobSearchError)) console.error("Stellenempfehlungen", e.reason);
      return { tips: [], queries, error: e?.reason instanceof JobSearchError ? e.reason.message : "Die Jobbörse ist gerade nicht erreichbar." };
    }
    all = interleave(ok);
    // Nur speichern, wenn alle Suchen geklappt haben; sonst beim nächsten Aufruf noch einmal versuchen
    if (ok.length === queries.length) {
      await query(
        `INSERT INTO job_tips (coachee_id, day, signature, queries, jobs) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (coachee_id, day) DO UPDATE SET signature = EXCLUDED.signature, queries = EXCLUDED.queries, jobs = EXCLUDED.jobs, created_at = now()`,
        [c.id, day, signature, JSON.stringify(queries), JSON.stringify(all)],
      );
      await query("DELETE FROM job_tips WHERE coachee_id = $1 AND day < $2", [c.id, day]);
    }
  }
  const skip = new Set(known.map((k) => k.refnr));
  return { tips: all.filter((j) => !skip.has(j.refnr)).slice(0, limit), queries };
}
