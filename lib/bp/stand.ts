import "server-only";
import { one } from "../db";

/*
 * Stand von Businessplan und Bankfassung im Vergleich zu den Angaben, aus denen sie geschrieben werden.
 * Neue Angaben im Fragebogen oder im Finanzplan nach dem letzten Schreiben: Der Plan sollte neu geschrieben werden.
 * Änderungen am Plan fürs Amt nach der Bankfassung: Die Bankfassung sollte neu geschrieben werden.
 */

export type PlanStand = {
  /** wann der ganze Plan zuletzt von der KI geschrieben wurde */
  geschrieben: string | null;
  /** neue Angaben seit dem letzten Schreiben, z. B. ["Fragebogen", "Finanzplan"] */
  neu: string[];
  /** die Bankfassung ist älter als der Plan fürs Amt */
  bankVeraltet: boolean;
  bankGeschrieben: string | null;
};

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
// kleine Zeitspanne, damit gleichzeitige Änderungen (z. B. Übernehmen und Schreiben) nicht als neu gelten
const nach = (a: Date | string | null | undefined, b: Date | string | null | undefined) => Boolean(a && b && new Date(a).getTime() > new Date(b).getTime() + 5000);

export async function loadStand(coacheeId: string): Promise<PlanStand> {
  const row = await one<{ finance_at: Date | null; sections_at: Date | null; bank_at: Date | null; bank_text: boolean; fb_at: Date | null; run_at: Date | null; run_started: Date | null }>(
    `SELECT p.finance_updated_at AS finance_at, p.sections_updated_at AS sections_at, p.bank_sections_updated_at AS bank_at,
            EXISTS (SELECT 1 FROM jsonb_each(p.bank_sections) e WHERE btrim(e.value->>'text') <> '') AS bank_text,
            (SELECT updated_at FROM bp_fragebogen WHERE coachee_id = p.coachee_id) AS fb_at,
            r.finished_at AS run_at, r.created_at AS run_started
       FROM business_plans p
       LEFT JOIN LATERAL (
         SELECT finished_at, created_at FROM bp_runs
          WHERE coachee_id = p.coachee_id AND status = 'fertig' AND kind = 'aendern' AND undone_at IS NULL
          ORDER BY created_at DESC LIMIT 1
       ) r ON true
      WHERE p.coachee_id = $1`,
    [coacheeId],
  );
  if (!row) return { geschrieben: null, neu: [], bankVeraltet: false, bankGeschrieben: null };
  // Angaben, die während des Schreibens kamen, gelten als neu; verglichen wird mit dem Start des Durchgangs
  const basis = row.run_started;
  const neu = basis ? [nach(row.fb_at, basis) && "Fragebogen", nach(row.finance_at, basis) && "Finanzplan"].filter((x): x is string => Boolean(x)) : [];
  return {
    geschrieben: iso(row.run_at),
    neu,
    bankVeraltet: row.bank_text && nach(row.sections_at, row.bank_at),
    bankGeschrieben: row.bank_text ? iso(row.bank_at) : null,
  };
}
