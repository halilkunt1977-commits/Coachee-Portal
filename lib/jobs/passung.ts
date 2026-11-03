import "server-only";
import type { Coachee } from "../access";
import { aiEnabled, jsonResponse } from "../ai";
import { audit, type User } from "../auth";
import { one, query } from "../db";
import { notifyCoachee, postToInbox } from "../coachee-inbox";
import { JobSearchError } from "./ba";
import { tipQueries } from "./empfehlungen";
import { searchAll } from "./sources";
import { listSearches, profileForAi, storeJob } from "./store";
import { AUTO_SCORE, jobKey, levelOf, type Fit, type Job, type JobQuery } from "./shared";

/*
 * Passung von Stellen zum Profil in Prozent. Die KI kennt nur Titel, Beruf, Arbeitgeber und Ort der Anzeige; vom Profil
 * nur, was profileForAi freigibt (nie Gesundheit, nie interne Einträge, Namen ersetzt).
 *
 * findMatches: alle gespeicherten Suchen und die Startseiten-Suchen des Coachees abfragen, neue Treffer einschätzen lassen
 * und alles ab 80 % als Vorschlag des Coachs eintragen. Läuft auf Knopfdruck und einmal am Tag (ab 7 Uhr) für aktive
 * Coachees im Jobcoaching mit eingeschaltetem „Täglich passende Stellen vorschlagen“. Bewertete Anzeigen stehen in
 * job_matches und gehen nicht noch einmal an die KI.
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bewertungen"],
  properties: {
    bewertungen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "prozent", "grund"],
        properties: { nr: { type: "integer" }, prozent: { type: "integer" }, grund: { type: "string" } },
      },
    },
  },
};

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

type Rateable = Pick<Job, "refnr" | "title" | "beruf" | "employer" | "location">;

/** Passung in Prozent für bis zu 40 Anzeigen; leeres Ergebnis, wenn es weder Profil noch Lebenslauf gibt */
export async function scoreJobs(c: Coachee, userId: string, jobs: Rateable[]): Promise<Record<string, Fit> | null> {
  const list = jobs.slice(0, 40);
  if (!list.length) return {};
  const profile = await profileForAi(c);
  if (profile.empty) return null;
  const anzeigen = list.map((j, i) => `${i + 1}. ${clip(j.title, 160)}${j.beruf ? ` (Beruf: ${clip(j.beruf, 100)})` : ""} – ${clip(j.employer, 120)}, ${clip(j.location, 80)}`).join("\n");
  const out = await jsonResponse<{ bewertungen: { nr: number; prozent: number; grund: string }[] }>({
    coacheeId: c.id,
    userId,
    purpose: "stellen_passung",
    schemaName: "passung",
    schema: SCHEMA,
    maxTokens: 4000,
    instructions: `Du schätzt im Jobcoaching ein, wie gut Stellenanzeigen zu einer Person passen. Du kennst nur Titel, Beruf, Arbeitgeber und Ort der Anzeige, nicht den Anzeigentext.

Regeln:
- Bewerte jede Anzeige genau einmal mit ihrer Nummer und einer Passung in Prozent (0–100).
- 80–100: Erfahrung, Ausbildung und Wunsch passen klar, eine Bewerbung lohnt sich sicher. 50–79: machbar, mit Lücken oder als Quereinstieg. Unter 50: passt fachlich nicht oder widerspricht einem Ausschlussgrund (Ort, Arbeitszeit, Einschränkungen).
- Gib 80 oder mehr nur, wenn du es mit dem Profil begründen kannst. Im Zweifel niedriger.
- "grund": ein kurzer Satz (höchstens 18 Wörter), konkret mit Bezug auf das Profil. Unter 50 sagen, was fehlt oder stört.
- Sei ehrlich, nicht höflich. Namen sind durch [Name] ersetzt.`,
    input: `${profile.text}\n\nStellenanzeigen:\n${anzeigen}`,
  });
  const fits: Record<string, Fit> = {};
  for (const b of out.bewertungen) {
    const j = list[b.nr - 1];
    if (!j) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(b.prozent) || 0)));
    fits[j.refnr] = { level: levelOf(score), score, reason: b.grund.replaceAll("[Name]", c.first_name).slice(0, 240) };
  }
  return fits;
}

const MAX_RATE = 30;
const MAX_PROPOSE = 5;

export type MatchResult = { checked: number; proposed: { refnr: string; title: string; employer: string; score: number }[]; error?: string };

/** Neue Treffer aller Suchen des Coachees einschätzen und alles ab 80 % als Vorschlag eintragen */
export async function findMatches(c: Coachee, coach: User): Promise<MatchResult> {
  const [saved, tips] = await Promise.all([listSearches(c.id), tipQueries(c)]);
  const queries: JobQuery[] = [];
  const seen = new Set<string>();
  for (const q of [...saved, ...tips]) {
    const k = JSON.stringify([q.was.toLowerCase(), q.wo.toLowerCase(), q.land, q.umkreis, q.arbeitszeit, q.angebotsart]);
    if (!q.was || seen.has(k) || queries.length >= 6) continue;
    seen.add(k);
    queries.push(q);
  }
  if (!queries.length) return { checked: 0, proposed: [], error: "Es gibt noch keine Suche und keinen Wunschberuf. Bitte zuerst eine Suche speichern oder das Kompetenzprofil ergänzen." };

  const results = await Promise.allSettled(queries.map((q) => searchAll(q)));
  const found = results.flatMap((r) => (r.status === "fulfilled" ? r.value.jobs : []));
  if (!found.length && results.every((r) => r.status === "rejected")) {
    const e = (results[0] as PromiseRejectedResult).reason;
    return { checked: 0, proposed: [], error: e instanceof JobSearchError ? e.message : "Die Jobbörsen antworten gerade nicht." };
  }

  // Schon bekannt: in den Bewerbungen (auch von Hand eingetragen), ausgeblendet oder früher bewertet
  const [apps, hidden, rated] = await Promise.all([
    query<{ refnr: string | null; title: string; employer: string }>("SELECT refnr, title, employer FROM applications WHERE coachee_id = $1", [c.id]),
    query<{ refnr: string }>("SELECT refnr FROM job_hidden WHERE coachee_id = $1", [c.id]),
    query<{ refnr: string }>("SELECT refnr FROM job_matches WHERE coachee_id = $1", [c.id]),
  ]);
  const skip = new Set<string>([...apps.flatMap((a) => (a.refnr ? [a.refnr] : [])), ...apps.map(jobKey), ...hidden.map((h) => h.refnr), ...rated.map((r) => r.refnr)]);
  const fresh: Job[] = [];
  for (const j of found) {
    const k = jobKey(j);
    if (skip.has(j.refnr) || skip.has(k)) continue;
    skip.add(j.refnr);
    skip.add(k);
    fresh.push(j);
    if (fresh.length >= MAX_RATE) break;
  }
  if (!fresh.length) return { checked: 0, proposed: [] };

  const fits = await scoreJobs(c, coach.id, fresh);
  if (!fits) return { checked: 0, proposed: [], error: "Für die Einschätzung braucht es ein Kompetenzprofil oder einen Lebenslauf." };
  for (const j of fresh) {
    const f = fits[j.refnr];
    if (f) await query("INSERT INTO job_matches (coachee_id, refnr, score, reason) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [c.id, j.refnr, f.score ?? 0, f.reason]);
  }
  await query("DELETE FROM job_matches WHERE coachee_id = $1 AND created_at < now() - interval '120 days'", [c.id]);

  const best = fresh
    .filter((j) => (fits[j.refnr]?.score ?? 0) >= AUTO_SCORE)
    .sort((a, b) => (fits[b.refnr]!.score ?? 0) - (fits[a.refnr]!.score ?? 0))
    .slice(0, MAX_PROPOSE);
  const proposed: MatchResult["proposed"] = [];
  let firstUrl: string | null = null;
  for (const j of best) {
    const row = await storeJob(c.id, coach, j, fits[j.refnr]!.reason);
    if ("error" in row || !row.fresh) continue;
    const url = await postToInbox(c.id, "stelle", row.id, coach.id);
    firstUrl ??= url;
    proposed.push({ refnr: j.refnr, title: j.title, employer: j.employer, score: fits[j.refnr]!.score ?? 0 });
  }
  if (proposed.length)
    await notifyCoachee(c.user_id, {
      title: proposed.length === 1 ? "Neue Stelle für dich" : "Neue Stellen für dich",
      body: proposed.length === 1 ? "Dein Coach hat dir eine Stelle vorgeschlagen." : `Dein Coach hat dir ${proposed.length} Stellen vorgeschlagen.`,
      url: firstUrl ?? undefined,
      tag: "stelle",
    });
  await audit(coach.id, "jobs_matched", c.id, { checked: fresh.length, proposed: proposed.length });
  return { checked: fresh.length, proposed };
}

// ---------- Täglicher Lauf ----------

const g = globalThis as unknown as { portalJobMatchTimer?: NodeJS.Timeout; portalJobMatchBusy?: boolean };

const berlin = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

/** Einmal am Tag ab 7 Uhr: alle aktiven Coachees im Jobcoaching mit eingeschalteter Automatik, einer nach dem anderen */
export async function runDailyMatches() {
  if (g.portalJobMatchBusy || !aiEnabled()) return;
  const { day, hour } = berlin();
  if (hour < 7 || hour >= 20) return;
  g.portalJobMatchBusy = true;
  try {
    const due = await query<Coachee>(
      `SELECT c.* FROM coachees c WHERE c.coaching_type = 'job' AND c.status = 'aktiv' AND c.archived_at IS NULL AND c.auto_jobs
         AND (c.auto_jobs_on IS NULL OR c.auto_jobs_on < $1) AND (c.end_date IS NULL OR c.end_date >= $1::date) ORDER BY c.created_at`,
      [day],
    );
    for (const c of due) {
      // Vorher eintragen: schlägt ein Lauf fehl, wird er nicht stündlich wiederholt
      await query("UPDATE coachees SET auto_jobs_on = $2 WHERE id = $1", [c.id, day]);
      const coach = await one<User>("SELECT id, email, name, role, totp_enabled FROM users WHERE id = $1", [c.coach_id]);
      if (!coach) continue;
      const r = await findMatches(c, coach).catch((e) => {
        console.error("[stellen] Tagesvorschläge", c.id, e);
        return null;
      });
      if (r?.proposed.length) console.log(`[stellen] ${r.proposed.length} Vorschläge für Akte ${c.id}`);
    }
  } finally {
    g.portalJobMatchBusy = false;
  }
}

/** Aus instrumentation.ts: stündlich prüfen, ob der Tageslauf fällig ist */
export function startJobMatchSchedule() {
  if (g.portalJobMatchTimer || !process.env.DATABASE_URL || process.env.JOB_MATCH_DISABLED === "1") return;
  const tick = () => void runDailyMatches().catch((e) => console.error("[stellen] Tagesvorschläge", e));
  g.portalJobMatchTimer = setInterval(tick, 60 * 60_000);
  setTimeout(tick, 10 * 60_000);
}
