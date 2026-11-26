import "server-only";
import { one } from "../db";
import { normalizeFragebogen, type FragebogenData } from "./fragebogen";

export type FragebogenStand = { data: FragebogenData; updated_at: string | null; submitted_at: string | null; uebernommen_at: string | null; gestartet: boolean };

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

export async function loadFragebogen(coacheeId: string): Promise<FragebogenStand> {
  const row = await one<{ data: unknown; updated_at: string | Date; submitted_at: string | Date | null; uebernommen_at: string | Date | null }>(
    "SELECT data, updated_at, submitted_at, uebernommen_at FROM bp_fragebogen WHERE coachee_id = $1",
    [coacheeId],
  );
  return { data: normalizeFragebogen(row?.data), updated_at: iso(row?.updated_at ?? null), submitted_at: iso(row?.submitted_at ?? null), uebernommen_at: iso(row?.uebernommen_at ?? null), gestartet: Boolean(row) };
}
