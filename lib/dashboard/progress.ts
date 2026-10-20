import "server-only";
import type { Coachee } from "../access";
import { unitsUsedSql } from "../attendance/units";
import { SECTIONS, normalizeSections, sectionDone } from "../bp/sections";
import { calculate, normalizeFinance } from "../bp/finance";
import { normalizeCv, type CvData } from "../cv/types";
import { one, query } from "../db";
import { categoriesFor } from "../profile";
import { MILESTONES, type MilestoneState } from "./milestones";

/*
 * Stand eines Coachings auf einen Blick: Unterrichtseinheiten, Lebenslauf, Businessplan, Finanzplan,
 * Profil, Erfahrungsbogen, Bewerbungen und Etappen. Dieselben Zahlen sehen Coach (Akte, Dashboard) und Coachee.
 * Interne Profileinträge (Gesundheit) zählen nicht mit und werden nicht geladen.
 */

export type Part = { key: string; label: string; pct: number; detail: string; href: keyof Links };
export type Links = { cv: string; plan: string; finance: string; profile: string; survey: string; jobs: string; attendance: string };

export type Progress = {
  units: { used: number; total: number | null; rest: number | null; pct: number | null; weeksLeft: number | null; perWeek: number | null; last: string | null };
  weeks: { week: string; units: number }[];
  parts: Part[];
  overall: number;
  sections: { key: string; title: string; done: boolean; chars: number }[];
  milestones: MilestoneState[];
  jobs: { proposals: number; applied: number; talks: number; offers: number; due: number } | null;
  city: string | null;
  lastContact: string | null;
};

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Wie vollständig ein Lebenslauf ist, in Prozent */
export function cvScore(cv: CvData | null) {
  if (!cv) return 0;
  const p = cv.personal;
  let s = 0;
  s += ([p.firstName, p.lastName, p.city, p.phone || p.email].filter((x) => x.trim()).length / 4) * 20;
  if (p.headline.trim()) s += 5;
  if (cv.summary.trim().length > 80) s += 15;
  const exp = cv.experience.filter((e) => e.title.trim());
  if (exp.length) s += 15;
  if (exp.length && exp.filter((e) => e.bullets.trim().length > 40).length / exp.length >= 0.6) s += 15;
  if (cv.education.some((e) => e.degree.trim() || e.school.trim())) s += 10;
  if (cv.skills.filter((x) => x.name.trim()).length >= 3) s += 10;
  if (cv.languages.some((l) => l.name.trim())) s += 10;
  return clampPct(s);
}

/** Wie weit der Finanzplan ausgefüllt ist (Investitionen, Finanzierung, Umsatz, Kosten/Personal, privater Bedarf) */
export function financeScore(raw: unknown) {
  const f = normalizeFinance(raw);
  const r = calculate(f);
  const checks = [
    f.investments.length > 0,
    f.financing.length > 0 || f.grants.length > 0 || f.openingCash > 0,
    f.revenues.some((r) => r.price > 0 && r.qty.some((q) => q > 0)),
    f.costs.length > 0 || f.staff.length > 0,
    f.privateDraw.some((x) => x > 0),
  ];
  const done = checks.filter(Boolean).length;
  return { pct: clampPct((done / checks.length) * 100), done, total: checks.length, liquid: f.revenues.length > 0 && r.minBalance.value >= 0 && r.gap >= 0 };
}

const mondayOf = (d: Date) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

/** Letzte n Wochen (Montag als Schlüssel), leere Wochen mit 0 */
export function weekSeries(rows: { week: string; units: number }[], n = 12) {
  const map = new Map(rows.map((r) => [r.week, r.units]));
  const out: { week: string; units: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const w = mondayOf(d);
    out.push({ week: w, units: Math.round((map.get(w) ?? 0) * 100) / 100 });
  }
  return out;
}

/** UE pro Woche: Anwesenheit, solange es welche gibt, sonst Gespräche (wie unitsUsedSql) */
export const weeklyUnitsSql = (filter: string) => `
  WITH a AS (SELECT a.coachee_id, a.held_on, a.units FROM attendance a WHERE ${filter.replaceAll("$c", "a.coachee_id")}),
       m AS (SELECT m.coachee_id, m.held_on, m.units FROM meetings m WHERE ${filter.replaceAll("$c", "m.coachee_id")} AND NOT EXISTS (SELECT 1 FROM attendance x WHERE x.coachee_id = m.coachee_id)),
       u AS (SELECT * FROM a UNION ALL SELECT * FROM m)
  SELECT to_char(date_trunc('week', held_on), 'YYYY-MM-DD') AS week, sum(units)::float AS units
    FROM u WHERE held_on >= CURRENT_DATE - 7 * $WEEKS GROUP BY 1`;

export async function progressFor(c: Coachee): Promise<Progress> {
  const job = c.coaching_type === "job";
  const [units, weekRows, cvRow, plan, profile, survey, jobs, ticked, lastContact] = await Promise.all([
    one<{ used: number; last: string | null }>(
      `SELECT ${unitsUsedSql("$1")} AS used, GREATEST((SELECT max(held_on) FROM attendance WHERE coachee_id = $1), (SELECT max(held_on) FROM meetings WHERE coachee_id = $1)) AS last`,
      [c.id],
    ),
    query<{ week: string; units: number }>(weeklyUnitsSql("$c = $1").replace("$WEEKS", "12"), [c.id]),
    one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
    job ? null : one<{ sections: unknown; finance: unknown }>("SELECT sections, finance FROM business_plans WHERE coachee_id = $1", [c.id]),
    query<{ category: string; n: number }>("SELECT category, count(*)::int AS n FROM profile_items WHERE coachee_id = $1 AND NOT internal GROUP BY category", [c.id]),
    one<{ status: string }>("SELECT status FROM experience_surveys WHERE coachee_id = $1 ORDER BY (status <> 'offen') DESC, updated_at DESC LIMIT 1", [c.id]),
    job
      ? one<{ proposals: number; applied: number; talks: number; offers: number; due: number }>(
          `SELECT count(*) FILTER (WHERE status = 'vorschlag')::int AS proposals,
                  count(*) FILTER (WHERE status IN ('beworben', 'gespraech', 'zusage', 'absage'))::int AS applied,
                  count(*) FILTER (WHERE status IN ('gespraech', 'zusage'))::int AS talks,
                  count(*) FILTER (WHERE status = 'zusage')::int AS offers,
                  count(*) FILTER (WHERE next_on <= CURRENT_DATE AND status IN ('gemerkt', 'beworben', 'gespraech'))::int AS due
             FROM applications WHERE coachee_id = $1`,
          [c.id],
        )
      : null,
    query<{ key: string; done_on: string }>("SELECT key, done_on FROM milestones WHERE coachee_id = $1", [c.id]),
    one<{ at: string | null }>("SELECT max(created_at) AS at FROM messages WHERE coachee_id = $1", [c.id]),
  ]);

  const cv = cvRow ? normalizeCv(cvRow.data) : null;
  const cvPct = cvScore(cv);
  const sectionsRaw = normalizeSections(plan?.sections);
  const sections = SECTIONS.map((s) => ({ key: s.key, title: s.title, done: sectionDone(sectionsRaw[s.key]), chars: sectionsRaw[s.key].text.trim().length }));
  const bpDone = sections.filter((s) => s.done).length;
  const fin = financeScore(plan?.finance);
  const cats = categoriesFor(c.coaching_type).filter((x) => !x.internal);
  const filled = cats.filter((x) => profile.some((p) => p.category === x.key)).length;
  const items = profile.reduce((a, p) => a + p.n, 0);
  const surveyPct = survey?.status === "eingereicht" || survey?.status === "gesehen" ? 100 : survey ? 40 : 0;
  const idea = sections.find((s) => s.key === "idee")!;

  const parts: Part[] = [];
  if (!job) {
    parts.push({ key: "idee", label: "Geschäftsidee", pct: idea.done ? 100 : clampPct((idea.chars / 300) * 100), detail: idea.done ? "beschrieben" : idea.chars ? "angefangen" : "noch offen", href: "plan" });
    parts.push({ key: "plan", label: "Businessplan", pct: clampPct((bpDone / SECTIONS.length) * 100), detail: `${bpDone} von ${SECTIONS.length} Kapiteln`, href: "plan" });
    parts.push({ key: "finance", label: "Finanzplan", pct: fin.pct, detail: `${fin.done} von ${fin.total} Bereichen${fin.liquid ? " · Liquidität positiv" : ""}`, href: "finance" });
  }
  parts.push({ key: "cv", label: "Lebenslauf", pct: cvPct, detail: cv ? (cvPct >= 80 ? "fast fertig" : "in Arbeit") : "noch keiner", href: "cv" });
  parts.push({ key: "profile", label: job ? "Kompetenzprofil" : "Gründerprofil", pct: clampPct((filled / cats.length) * 100), detail: `${items} ${items === 1 ? "Eintrag" : "Einträge"} in ${filled} von ${cats.length} Bereichen`, href: "profile" });
  if (job) {
    parts.push({ key: "survey", label: "Erfahrungsbogen", pct: surveyPct, detail: surveyPct === 100 ? "ausgefüllt" : survey ? "angefangen" : "noch offen", href: "survey" });
    const j = jobs ?? { applied: 0, talks: 0, offers: 0 };
    parts.push({ key: "jobs", label: "Bewerbungen", pct: j.offers ? 100 : j.talks ? 75 : clampPct(Math.min(j.applied, 10) * 5), detail: `${j.applied} verschickt · ${j.talks} Gespräch${j.talks === 1 ? "" : "e"}`, href: "jobs" });
  }

  const auto: Record<string, boolean> = {
    idee: idea.done,
    businessplan: bpDone === SECTIONS.length,
    finanzplan: fin.pct === 100,
    lebenslauf: cvPct >= 80,
    erfahrung: surveyPct === 100,
    profil: filled >= Math.ceil(cats.length / 2),
    bewerbung: (jobs?.applied ?? 0) > 0,
    gespraech: (jobs?.talks ?? 0) > 0,
    zusage: (jobs?.offers ?? 0) > 0,
  };
  const milestones: MilestoneState[] = MILESTONES[c.coaching_type].map((m) => {
    const t = ticked.find((x) => x.key === m.key);
    return { ...m, done: Boolean(t) || Boolean(m.auto && auto[m.key]), done_on: t?.done_on ?? null, byPortal: !t && Boolean(m.auto && auto[m.key]) };
  });
  const msPct = (milestones.filter((m) => m.done).length / milestones.length) * 100;

  const used = units?.used ?? 0;
  const total = c.units_total ? Number(c.units_total) : null;
  const rest = total != null ? Math.max(0, Math.round((total - used) * 100) / 100) : null;
  const daysLeft = c.end_date ? Math.ceil((new Date(`${c.end_date}T23:59:59`).getTime() - Date.now()) / 86_400_000) : null;
  const weeksLeft = daysLeft != null ? Math.max(0, Math.round((daysLeft / 7) * 10) / 10) : null;

  return {
    units: {
      used,
      total,
      rest,
      pct: total ? clampPct((used / total) * 100) : null,
      weeksLeft,
      perWeek: rest != null && weeksLeft ? Math.round((rest / Math.max(weeksLeft, 1)) * 10) / 10 : null,
      last: units?.last ?? null,
    },
    weeks: weekSeries(weekRows),
    parts,
    overall: clampPct((parts.reduce((a, p) => a + p.pct, 0) / parts.length) * 0.7 + msPct * 0.3),
    sections,
    milestones,
    jobs: jobs ?? null,
    city: c.city?.trim() || cv?.personal.city.trim() || null,
    lastContact: [units?.last, lastContact?.at?.slice(0, 10)].filter(Boolean).sort().pop() ?? null,
  };
}
