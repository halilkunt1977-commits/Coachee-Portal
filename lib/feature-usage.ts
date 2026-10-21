import "server-only";
import { query } from "./db";
import { FEATURES, defaultMonthlyLimit, type FeatureKey } from "./features";

export type UsageCount = { month: number; total: number; last: string | null };
export type CoacheeUsage = { features: Record<FeatureKey, UsageCount>; month: number; last: string | null };

const empty = (): CoacheeUsage => ({ features: Object.fromEntries(FEATURES.map((f) => [f.key, { month: 0, total: 0, last: null }])) as Record<FeatureKey, UsageCount>, month: 0, last: null });

/**
 * Verbrauch der Hilfen je Coachee aus ai_usage. Gezählt werden nur die eigenen Aufrufe des Coachees (wie bei der Monatsgrenze),
 * nicht was der Coach in der Akte für ihn macht. coacheeId schränkt auf einen Coachee ein.
 */
export async function usageFor(coachId: string, coacheeId?: string) {
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
  return { get: (id: string) => out.get(id) ?? empty() };
}

export const limitOf = (c: { ai_monthly_limit: number | null }) => c.ai_monthly_limit ?? defaultMonthlyLimit();
