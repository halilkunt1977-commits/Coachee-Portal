import "server-only";
import type { Coachee } from "../access";
import { pseudonymize } from "../ai";
import { normalizeCv } from "../cv/types";
import { one, query } from "../db";
import { categoryLabel } from "../profile";
import { audit, type User } from "../auth";
import { ANGEBOTSART, ARBEITSZEIT, UMKREIS, type Application, type Job, type JobQuery, type SavedSearch, type Status } from "./shared";
import { cleanWas } from "./ba";

export const APP_COLUMNS = `a.id, a.refnr, a.title, a.employer, a.location, a.url, a.published_on::text, a.status, a.channel, a.applied_on::text, a.next_on::text,
  a.next_note, a.contact, a.salutation, a.street, a.zip, a.note, a.reason, a.history, a.created_at, a.updated_at, p.name AS proposed_by_name,
  (a.interview IS NOT NULL) AS has_interview`;

export const listApplications = (coacheeId: string) =>
  query<Application>(
    `SELECT ${APP_COLUMNS} FROM applications a LEFT JOIN users p ON p.id = a.proposed_by WHERE a.coachee_id = $1
      ORDER BY CASE a.status WHEN 'vorschlag' THEN 0 WHEN 'gespraech' THEN 1 WHEN 'beworben' THEN 2 WHEN 'gemerkt' THEN 3 WHEN 'zusage' THEN 4 ELSE 5 END, a.next_on NULLS LAST, a.updated_at DESC`,
    [coacheeId],
  );

export const getApplication = (coacheeId: string, id: string) =>
  one<Application>(`SELECT ${APP_COLUMNS} FROM applications a LEFT JOIN users p ON p.id = a.proposed_by WHERE a.coachee_id = $1 AND a.id = $2`, [coacheeId, id]);

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const jobUrl = (v: unknown) => {
  const u = clip(v, 600);
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : "";
};

/**
 * Treffer aus der Stellensuche in die Bewerbungen der Akte übernehmen: vom Coach als Vorschlag, vom Coachee als gemerkte Stelle.
 * Gibt es die Stelle schon, bleibt ihr Stand, wie er ist. Meldungen verschickt der Aufrufer.
 */
export async function storeJob(coacheeId: string, user: User, job: Job, reason = ""): Promise<{ id: string; status: Status; fresh: boolean } | { error: string }> {
  const refnr = clip(job?.refnr, 80);
  if (!refnr) return { error: "Diese Stelle hat keine Referenznummer." };
  const status: Status = user.role === "coach" ? "vorschlag" : "gemerkt";
  const published = String(job.published ?? "").slice(0, 10);
  const row = await one<{ id: string; status: Status; fresh: boolean }>(
    `INSERT INTO applications (coachee_id, refnr, title, employer, location, url, published_on, status, reason, history, proposed_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (coachee_id, refnr) WHERE refnr IS NOT NULL DO UPDATE SET reason = CASE WHEN applications.reason = '' THEN EXCLUDED.reason ELSE applications.reason END
     RETURNING id, status, (xmax = 0) AS fresh`,
    [
      coacheeId, refnr, clip(job.title, 200) || "Stellenangebot", clip(job.employer, 200), clip(job.location, 120), jobUrl(job.url),
      isDate(published) ? published : null,
      status, clip(reason, 600), JSON.stringify([{ at: new Date().toISOString(), status, by: user.name }]), user.role === "coach" ? user.id : null, user.id,
    ],
  );
  await query("DELETE FROM job_hidden WHERE coachee_id = $1 AND refnr = $2", [coacheeId, refnr]);
  await audit(user.id, user.role === "coach" ? "job_proposed" : "job_saved", coacheeId, { refnr });
  return row!;
}

export const listSearches = (coacheeId: string) =>
  query<SavedSearch>("SELECT id, was, wo, umkreis, arbeitszeit, angebotsart, ohne_zeitarbeit FROM job_searches WHERE coachee_id = $1 ORDER BY created_at", [coacheeId]);

export const hiddenRefs = async (coacheeId: string) => (await query<{ refnr: string }>("SELECT refnr FROM job_hidden WHERE coachee_id = $1", [coacheeId])).map((r) => r.refnr);

/** Suchanfrage aus Formulardaten auf erlaubte Werte begrenzen */
export function normalizeQuery(raw: Partial<JobQuery> | null | undefined): JobQuery {
  const q = raw ?? {};
  const umkreis = Number(q.umkreis);
  const art = Number(q.angebotsart);
  const zeiten = String(q.arbeitszeit ?? "").split(";").filter((k) => ARBEITSZEIT.some((a) => a.key === k));
  return {
    was: String(q.was ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    wo: String(q.wo ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    umkreis: (UMKREIS as readonly number[]).includes(umkreis) ? umkreis : 25,
    arbeitszeit: [...new Set(zeiten)].join(";"),
    angebotsart: ANGEBOTSART.some((a) => a.key === art) ? art : 1,
    ohne_zeitarbeit: Boolean(q.ohne_zeitarbeit),
  };
}

/** Kompetenzprofil und Lebenslauf als Text für die KI. Gesundheit und interne Einträge gehen nie raus, Namen werden ersetzt. */
export async function profileForAi(c: Coachee) {
  const [items, cv] = await Promise.all([
    query<{ category: string; title: string; detail: string; level: number | null }>(
      "SELECT category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' AND NOT internal ORDER BY category, created_at",
      [c.id],
    ),
    one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
  ]);
  const lines: string[] = [];
  if (c.goal) lines.push(`Ziel des Coachings: ${c.goal}`);
  if (items.length) {
    lines.push("Kompetenzprofil:");
    for (const i of items) lines.push(`- ${categoryLabel("job", i.category)}: ${i.title}${i.level ? ` (Stufe ${i.level}/5)` : ""}${i.detail ? ` – ${i.detail.slice(0, 300)}` : ""}`);
  }
  if (cv) {
    const d = normalizeCv(cv.data);
    lines.push("Lebenslauf:");
    if (d.personal.headline) lines.push(`Berufsbezeichnung: ${d.personal.headline}`);
    if (d.personal.city) lines.push(`Wohnort: ${d.personal.city}`);
    if (d.personal.license) lines.push(`Führerschein: ${d.personal.license}`);
    for (const e of d.experience.slice(0, 6)) lines.push(`- ${e.start || "?"} bis ${e.current ? "heute" : e.end || "?"}: ${e.title}, ${e.company}`);
    for (const e of d.education.slice(0, 4)) lines.push(`- Ausbildung: ${e.degree}`);
    if (d.skills.length) lines.push(`Kenntnisse: ${d.skills.map((s) => s.name).join(", ")}`);
    for (const e of d.certificates.slice(0, 6)) lines.push(`- Zertifikat: ${e.name}`);
  }
  return { text: pseudonymize(lines.join("\n"), [c.first_name, c.last_name]), empty: !items.length && !cv };
}

/** Erste Suche ohne KI: Wunschberuf aus dem Profil, sonst Berufsbezeichnung aus dem Lebenslauf; Ort aus dem Lebenslauf. */
export async function defaultQuery(c: Coachee): Promise<JobQuery> {
  const [wish, cv] = await Promise.all([
    one<{ title: string }>("SELECT title FROM profile_items WHERE coachee_id = $1 AND category = 'wunsch' ORDER BY created_at LIMIT 1", [c.id]),
    one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
  ]);
  const d = cv ? normalizeCv(cv.data) : null;
  return normalizeQuery({ was: cleanWas(wish?.title ?? d?.personal.headline ?? ""), wo: d?.personal.city || d?.personal.zip || "", umkreis: 25 });
}
