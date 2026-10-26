import "server-only";
import { query } from "./db";
import { FEATURES, defaultMonthlyLimit, type FeatureKey } from "./features";

export type UsageCount = { month: number; total: number; last: string | null };
/** prep: Gesprächsvorbereitungen, die der Coach erstellt hat, und wie viele davon der Coachee schon geöffnet hat */
export type CoacheeUsage = { features: Record<FeatureKey, UsageCount>; month: number; last: string | null; prep: { prepared: number; read: number } };

const empty = (): CoacheeUsage => ({
  features: Object.fromEntries(FEATURES.map((f) => [f.key, { month: 0, total: 0, last: null }])) as Record<FeatureKey, UsageCount>,
  month: 0,
  last: null,
  prep: { prepared: 0, read: 0 },
});

/**
 * Verbrauch der Hilfen je Coachee aus ai_usage. Gezählt werden nur die eigenen Aufrufe des Coachees (wie bei der Monatsgrenze),
 * nicht was der Coach in der Akte für ihn macht. coacheeId schränkt auf einen Coachee ein.
 */
export async function usageFor(coachId: string, coacheeId?: string) {
  const prepP = query<{ coachee_id: string; prepared: number; read: number }>(
    `SELECT a.coachee_id, count(*)::int AS prepared, count(a.interview_seen_at)::int AS read
       FROM applications a JOIN coachees c ON c.id = a.coachee_id
      WHERE c.coach_id = $1 AND ($2::uuid IS NULL OR c.id = $2::uuid) AND a.interview IS NOT NULL
      GROUP BY a.coachee_id`,
    [coachId, coacheeId ?? null],
  );
  const rows = await query<{ coachee_id: string; purpose: string; month: number; total: number; last_at: string }>(
    `SELECT c.id AS coachee_id, a.purpose,
            count(*) FILTER (WHERE a.created_at >= date_trunc('month', now()))::int AS month,
            count(*)::int AS total, max(a.created_at) AS last_at
       FROM coachees c JOIN ai_usage a ON a.user_id = c.user_id
      WHERE c.coach_id = $1 AND ($2::uuid IS NULL OR c.id = $2::uuid)
      GROUP BY c.id, a.purpose`,
    [coachId, coacheeId ?? null],
  );
  const out = new Map<string, CoacheeUsage>();
  for (const r of rows) {
    const u = out.get(r.coachee_id) ?? empty();
    out.set(r.coachee_id, u);
    u.month += r.month;
    if (!u.last || r.last_at > u.last) u.last = r.last_at;
    const f = FEATURES.find((x) => (x.purposes as readonly string[]).includes(r.purpose));
    if (!f) continue;
    const s = u.features[f.key];
    s.month += r.month;
    s.total += r.total;
    if (!s.last || r.last_at > s.last) s.last = r.last_at;
  }
  for (const r of await prepP) {
    const u = out.get(r.coachee_id) ?? empty();
    out.set(r.coachee_id, u);
    u.prep = { prepared: r.prepared, read: r.read };
  }
  return { get: (id: string) => out.get(id) ?? empty() };
}

export const limitOf = (c: { ai_monthly_limit: number | null }) => c.ai_monthly_limit ?? defaultMonthlyLimit();
