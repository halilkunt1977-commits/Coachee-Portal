"use server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed, jsonResponse } from "@/lib/ai";
import { audit, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { JobSearchError, searchJobs } from "@/lib/jobs/ba";
import { CHANNELS, SALUTATIONS, STATUSES, today, type Application, type Fit, type Job, type JobQuery, type SavedSearch, type Status } from "@/lib/jobs/shared";
import { getApplication, hiddenRefs, normalizeQuery, profileForAi } from "@/lib/jobs/store";
import { notifyCoachee, postToInbox } from "@/lib/coachee-inbox";

async function jobCoachee(user: User, coacheeId: string) {
  const c = await coacheeFor(user, coacheeId);
  if (c.coaching_type !== "job") throw new Error("Stellensuche gibt es nur im Jobcoaching.");
  return c;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const safeUrl = (v: unknown) => {
  const u = clip(v, 600);
  // „www.firma.de“ ohne https:// ist im Alltag die Regel
  const full = /^www\./i.test(u) ? `https://${u}` : u;
  return /^https?:\/\/[^\s]+$/i.test(full) ? full : "";
};
const salutation = (v: unknown) => (SALUTATIONS.some((s) => s.key === v) ? (v as string) : "");
// Doppelte Referenznummer: Postgres meldet 23505 (applications_refnr)
const isDuplicate = (e: unknown) => (e as { code?: string })?.code === "23505";

// ---------- Suchen ----------

export async function addSearch(coacheeId: string, raw: Partial<JobQuery>): Promise<{ search?: SavedSearch; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const q = normalizeQuery(raw);
  if (!q.was && !q.wo) return { error: "Bitte mindestens einen Beruf oder einen Ort eingeben." };
  const count = await one<{ n: number }>("SELECT count(*)::int AS n FROM job_searches WHERE coachee_id = $1", [c.id]);
  if ((count?.n ?? 0) >= 12) return { error: "Höchstens 12 Suchen. Bitte zuerst eine alte entfernen." };
  const same = await one<SavedSearch>(
    "SELECT id, was, wo, umkreis, arbeitszeit, angebotsart, ohne_zeitarbeit FROM job_searches WHERE coachee_id = $1 AND lower(was) = lower($2) AND lower(wo) = lower($3) AND umkreis = $4 AND arbeitszeit = $5 AND angebotsart = $6 AND ohne_zeitarbeit = $7",
    [c.id, q.was, q.wo, q.umkreis, q.arbeitszeit, q.angebotsart, q.ohne_zeitarbeit],
  );
  if (same) return { search: same };
  const search = await one<SavedSearch>(
    "INSERT INTO job_searches (coachee_id, was, wo, umkreis, arbeitszeit, angebotsart, ohne_zeitarbeit, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, was, wo, umkreis, arbeitszeit, angebotsart, ohne_zeitarbeit",
    [c.id, q.was, q.wo, q.umkreis, q.arbeitszeit, q.angebotsart, q.ohne_zeitarbeit, user.id],
  );
  await audit(user.id, "job_search_saved", c.id, { was: q.was, wo: q.wo });
  return { search: search! };
}

export async function deleteSearch(coacheeId: string, searchId: string) {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  await query("DELETE FROM job_searches WHERE coachee_id = $1 AND id = $2", [c.id, searchId]);
  return { ok: true };
}

export type SearchResult = { jobs: Job[]; total: number; hidden: number; error?: string };

/** Suche in der Jobbörse. Ausgeblendete Treffer werden herausgefiltert. */
export async function runSearch(coacheeId: string, raw: Partial<JobQuery>, page = 1): Promise<SearchResult> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const q = normalizeQuery(raw);
  if (!q.was && !q.wo) return { jobs: [], total: 0, hidden: 0, error: "Bitte mindestens einen Beruf oder einen Ort eingeben." };
  try {
    const [res, hidden] = await Promise.all([searchJobs(q, Math.max(1, Math.min(40, Math.floor(page) || 1))), hiddenRefs(c.id)]);
    const skip = new Set(hidden);
    const jobs = res.jobs.filter((j) => !skip.has(j.refnr));
    return { jobs, total: res.total, hidden: res.jobs.length - jobs.length };
  } catch (e) {
    if (!(e instanceof JobSearchError)) console.error("Stellensuche", e);
    return { jobs: [], total: 0, hidden: 0, error: e instanceof JobSearchError ? e.message : "Die Suche hat nicht geklappt. Bitte noch einmal versuchen." };
  }
}

export async function hideJob(coacheeId: string, refnr: string, hide: boolean) {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const ref = clip(refnr, 80);
  if (hide) await query("INSERT INTO job_hidden (coachee_id, refnr) VALUES ($1,$2) ON CONFLICT DO NOTHING", [c.id, ref]);
  else await query("DELETE FROM job_hidden WHERE coachee_id = $1 AND refnr = $2", [c.id, ref]);
  return { ok: true };
}

// ---------- Tracker ----------

/** Vorschlag des Coachs: in den Posteingang des Coachees, dazu eine Sofort-Meldung (mehrere Vorschläge fasst das Handy zusammen) */
async function proposed(c: { id: string; user_id: string | null }, applicationId: string, coachId: string) {
  const url = await postToInbox(c.id, "stelle", applicationId, coachId);
  await notifyCoachee(c.user_id, { title: "Neue Stelle für dich", body: "Dein Coach hat dir eine Stelle vorgeschlagen.", url, tag: "stelle" });
}

const historyEntry = (status: Status, user: User) => JSON.stringify([{ at: new Date().toISOString(), status, by: user.name }]);

/** Treffer übernehmen: Coach schlägt vor, Coachee merkt sich die Stelle. Gibt es sie schon, bleibt sie, wie sie ist. */
export async function saveJob(coacheeId: string, job: Job, reason = ""): Promise<{ application?: Application; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const refnr = clip(job?.refnr, 80);
  if (!refnr) return { error: "Diese Stelle hat keine Referenznummer." };
  const status: Status = user.role === "coach" ? "vorschlag" : "gemerkt";
  const row = await one<{ id: string; status: Status; fresh: boolean }>(
    `INSERT INTO applications (coachee_id, refnr, title, employer, location, url, published_on, status, reason, history, proposed_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (coachee_id, refnr) WHERE refnr IS NOT NULL DO UPDATE SET reason = CASE WHEN applications.reason = '' THEN EXCLUDED.reason ELSE applications.reason END
     RETURNING id, status, (xmax = 0) AS fresh`,
    [
      c.id, refnr, clip(job.title, 200) || "Stellenangebot", clip(job.employer, 200), clip(job.location, 120), safeUrl(job.url),
      isDate(String(job.published ?? "").slice(0, 10)) ? String(job.published).slice(0, 10) : null,
      status, clip(reason, 600), historyEntry(status, user), user.role === "coach" ? user.id : null, user.id,
    ],
  );
  await query("DELETE FROM job_hidden WHERE coachee_id = $1 AND refnr = $2", [c.id, refnr]);
  await audit(user.id, user.role === "coach" ? "job_proposed" : "job_saved", c.id, { refnr });
  if (user.role === "coach" && row!.status === "vorschlag" && row!.fresh) await proposed(c, row!.id, user.id);
  return { application: (await getApplication(c.id, row!.id))! };
}

/** Eigene Bewerbung eintragen, z. B. Initiativbewerbung oder eine Stelle aus einer anderen Börse */
export async function addApplication(coacheeId: string, raw: Partial<Application>): Promise<{ application?: Application; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const title = clip(raw.title, 200);
  const employer = clip(raw.employer, 200);
  if (!title && !employer) return { error: "Bitte Stelle oder Arbeitgeber eintragen." };
  const status: Status = STATUSES.some((s) => s.key === raw.status) && raw.status !== "vorschlag" ? (raw.status as Status) : "beworben";
  // Gemerkt heißt: noch nicht beworben, auch wenn im Formular schon ein Datum vorbelegt ist
  const applied = status === "gemerkt" ? null : isDate(raw.applied_on) ? raw.applied_on : today();
  let row: { id: string } | null;
  try {
    row = await one<{ id: string }>(
      `INSERT INTO applications (coachee_id, refnr, title, employer, location, street, zip, contact, salutation, url, published_on, status, channel, applied_on, next_on, note, history, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [
        c.id, clip(raw.refnr, 80) || null, title || "Initiativbewerbung", employer, clip(raw.location, 120), clip(raw.street, 160), clip(raw.zip, 10), clip(raw.contact, 300), salutation(raw.salutation),
        safeUrl(raw.url), isDate(raw.published_on) ? raw.published_on : null, status, CHANNELS.some((x) => x.key === raw.channel) ? raw.channel : "", applied, isDate(raw.next_on) ? raw.next_on : null, clip(raw.note, 4000), historyEntry(status, user), user.id,
      ],
    );
  } catch (e) {
    if (isDuplicate(e)) return { error: "Eine Stelle mit dieser Referenznummer ist schon eingetragen." };
    throw e;
  }
  await audit(user.id, "application_created", c.id);
  return { application: (await getApplication(c.id, row!.id))! };
}

type Patch = Partial<
  Pick<Application, "status" | "channel" | "applied_on" | "next_on" | "next_note" | "contact" | "salutation" | "street" | "zip" | "note" | "reason" | "title" | "employer" | "location" | "url" | "refnr" | "published_on">
>;

export async function updateApplication(coacheeId: string, id: string, patch: Patch): Promise<{ application?: Application; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const cur = await getApplication(c.id, id);
  if (!cur) return { error: "Diese Stelle gibt es nicht mehr." };
  const sets: string[] = [];
  const vals: unknown[] = [c.id, id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.status !== undefined && patch.status !== cur.status) {
    if (!STATUSES.some((s) => s.key === patch.status)) return { error: "Unbekannter Stand." };
    if (patch.status === "vorschlag" && user.role !== "coach") return { error: "Nur der Coach kann Stellen vorschlagen." };
    set("status", patch.status);
    vals.push(historyEntry(patch.status, user));
    sets.push(`history = history || $${vals.length}::jsonb`);
    // Wer auf "beworben" stellt, hat es meist heute getan
    if (["beworben", "gespraech", "zusage", "absage"].includes(patch.status) && !cur.applied_on && patch.applied_on === undefined) set("applied_on", today());
  }
  if (patch.channel !== undefined) set("channel", CHANNELS.some((x) => x.key === patch.channel) ? patch.channel : "");
  if (patch.applied_on !== undefined) set("applied_on", isDate(patch.applied_on) ? patch.applied_on : null);
  if (patch.next_on !== undefined) set("next_on", isDate(patch.next_on) ? patch.next_on : null);
  if (patch.published_on !== undefined) set("published_on", isDate(patch.published_on) ? patch.published_on : null);
  for (const [k, n] of [["next_note", 200], ["contact", 300], ["note", 4000], ["reason", 600], ["location", 120], ["street", 160], ["zip", 10]] as const) if (patch[k] !== undefined) set(k, clip(patch[k], n));
  if (patch.salutation !== undefined) set("salutation", salutation(patch.salutation));
  if (patch.refnr !== undefined) set("refnr", clip(patch.refnr, 80) || null);
  if (patch.title !== undefined) set("title", clip(patch.title, 200) || cur.title);
  if (patch.employer !== undefined) set("employer", clip(patch.employer, 200));
  if (patch.url !== undefined) set("url", safeUrl(patch.url));
  if (!sets.length) return { application: cur };
  try {
    await query(`UPDATE applications SET ${sets.join(", ")}, updated_at = now() WHERE coachee_id = $1 AND id = $2`, vals);
  } catch (e) {
    if (isDuplicate(e)) return { error: "Eine andere Stelle hat schon diese Referenznummer." };
    throw e;
  }
  if (patch.status !== undefined && patch.status !== cur.status) await audit(user.id, "application_status", c.id, { status: patch.status });
  if (patch.status === "vorschlag" && cur.status !== "vorschlag" && user.role === "coach") await proposed(c, id, user.id);
  return { application: (await getApplication(c.id, id))! };
}

export async function deleteApplication(coacheeId: string, id: string) {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  await query("DELETE FROM applications WHERE coachee_id = $1 AND id = $2", [c.id, id]);
  await audit(user.id, "application_deleted", c.id);
  return { ok: true };
}

// ---------- KI ----------

export type SearchIdea = JobQuery & { why: string };

const IDEAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suchen"],
  properties: {
    suchen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["was", "wo", "umkreis", "arbeitszeit", "warum"],
        properties: {
          was: { type: "string" },
          wo: { type: "string" },
          umkreis: { type: "integer", enum: [0, 10, 25, 50, 100, 200] },
          arbeitszeit: { type: "array", items: { type: "string", enum: ["vz", "tz", "ho", "snw", "mj"] } },
          warum: { type: "string" },
        },
      },
    },
  },
};

/** KI schlägt Suchbegriffe aus Kompetenzprofil und Lebenslauf vor, auch Berufe, an die man nicht sofort denkt. */
export async function suggestSearches(coacheeId: string): Promise<{ ideas?: SearchIdea[]; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  try {
    await assertAiAllowed(user, { coachOnly: true });
    const profile = await profileForAi(c);
    if (profile.empty) return { error: "Für Vorschläge braucht es ein Kompetenzprofil oder einen Lebenslauf. Beides fehlt noch." };
    const out = await jsonResponse<{ suchen: { was: string; wo: string; umkreis: number; arbeitszeit: string[]; warum: string }[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "stellen_suchen",
      schemaName: "stellensuchen",
      schema: IDEAS_SCHEMA,
      maxTokens: 2000,
      instructions: `Du hilfst im Jobcoaching, passende Suchen für die Jobbörse der Bundesagentur für Arbeit anzulegen.

Regeln:
- Schlage 4 bis 6 Suchen vor. Zuerst die naheliegenden Wunschberufe, dann 2 bis 3 Berufe, die zu den Kompetenzen passen, an die man aber nicht sofort denkt (verdeckte Kompetenzen, Quereinstieg).
- "was" ist ein kurzer Suchbegriff, wie ihn Arbeitgeber in Anzeigen verwenden, z. B. „Teamleiter Lager“ oder „Disponent“. Keine Sternchen, keine Klammern, kein „m/w/d“.
- "wo" ist der Ort aus den Rahmenbedingungen oder dem Lebenslauf. Ist keiner bekannt, leer lassen. Bei Homeoffice-Wunsch darf "wo" leer sein.
- "umkreis" nach Rahmenbedingungen (Mobilität, Führerschein), sonst 25.
- "arbeitszeit" nur, wenn das Profil es klar sagt (z. B. nur Teilzeit, kein Schichtdienst heißt: nicht "snw" wählen), sonst leere Liste.
- Beachte die Ausschlussgründe aus „Das passt nicht“.
- "warum": ein Satz, warum diese Suche passt, mit Bezug auf das Profil. Namen sind durch [Name] ersetzt.`,
      input: profile.text,
    });
    await audit(user.id, "jobs_ai_searches", c.id);
    const ideas = out.suchen.slice(0, 6).map((s) => ({ ...normalizeQuery({ ...s, arbeitszeit: s.arbeitszeit.join(";") }), why: s.warum.replaceAll("[Name]", c.first_name).slice(0, 300) })).filter((s) => s.was);
    return { ideas };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Suchvorschläge", e);
    return { error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

const FIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bewertungen"],
  properties: {
    bewertungen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "passung", "grund"],
        properties: { nr: { type: "integer" }, passung: { type: "string", enum: ["hoch", "mittel", "gering"] }, grund: { type: "string" } },
      },
    },
  },
};

/** KI schätzt ein, wie gut die Treffer zum Profil passen. An die KI gehen nur Titel, Beruf, Arbeitgeber und Ort der Anzeigen. */
export async function rateJobs(coacheeId: string, jobs: Pick<Job, "refnr" | "title" | "beruf" | "employer" | "location">[]): Promise<{ fits?: Record<string, Fit>; error?: string }> {
  const user = await requireUser();
  const c = await jobCoachee(user, coacheeId);
  const list = (Array.isArray(jobs) ? jobs : []).slice(0, 40);
  if (!list.length) return { fits: {} };
  try {
    await assertAiAllowed(user, { coachOnly: true });
    const profile = await profileForAi(c);
    if (profile.empty) return { error: "Für die Einschätzung braucht es ein Kompetenzprofil oder einen Lebenslauf." };
    const anzeigen = list.map((j, i) => `${i + 1}. ${clip(j.title, 160)}${j.beruf ? ` (Beruf: ${clip(j.beruf, 100)})` : ""} – ${clip(j.employer, 120)}, ${clip(j.location, 80)}`).join("\n");
    const out = await jsonResponse<{ bewertungen: { nr: number; passung: Fit["level"]; grund: string }[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "stellen_passung",
      schemaName: "passung",
      schema: FIT_SCHEMA,
      maxTokens: 4000,
      instructions: `Du schätzt im Jobcoaching ein, wie gut Stellenanzeigen zu einer Person passen. Du kennst nur Titel, Beruf, Arbeitgeber und Ort der Anzeige, nicht den Anzeigentext.

Regeln:
- Bewerte jede Anzeige genau einmal mit ihrer Nummer: "hoch" (Erfahrung und Wunsch passen), "mittel" (machbar, mit Lücken oder als Quereinstieg), "gering" (passt fachlich nicht oder widerspricht einem Ausschlussgrund).
- "grund": ein kurzer Satz (höchstens 18 Wörter), konkret mit Bezug auf das Profil. Bei "gering" sagen, was fehlt oder stört.
- Sei ehrlich, nicht höflich. Namen sind durch [Name] ersetzt.`,
      input: `${profile.text}\n\nStellenanzeigen:\n${anzeigen}`,
    });
    const fits: Record<string, Fit> = {};
    for (const b of out.bewertungen) {
      const j = list[b.nr - 1];
      if (j) fits[j.refnr] = { level: b.passung, reason: b.grund.replaceAll("[Name]", c.first_name).slice(0, 240) };
    }
    await audit(user.id, "jobs_ai_rated", c.id, { count: list.length });
    return { fits };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Passung", e);
    return { error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}
