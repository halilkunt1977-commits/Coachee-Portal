import "server-only";
import { one, query } from "../db";

/** Wird beim Anlegen eines Coachees aus einer Anfrage aufgerufen */
export async function leadWon(coachId: string, leadId: string, coacheeId: string) {
  const lead = await one<{ mail_id: string | null }>("SELECT mail_id FROM leads WHERE id = $1 AND coach_id = $2", [leadId, coachId]);
  if (!lead) return;
  await query(
    `UPDATE leads SET status = 'gewonnen', coachee_id = $2, follow_up_on = NULL, updated_at = now(),
            log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'Als Coachee angelegt')) WHERE id = $1`,
    [leadId, coacheeId],
  );
  if (lead.mail_id) await query("UPDATE inbox_mails SET coachee_id = $2 WHERE id = $1 AND coachee_id IS NULL", [lead.mail_id, coacheeId]);
}
