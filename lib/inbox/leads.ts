import "server-only";
import { query } from "../db";
import { applyMail } from "./ingest";

/** Wird beim Anlegen eines Coachees aus einer Anfrage aufgerufen */
export async function leadWon(coachId: string, leadId: string, coacheeId: string) {
  const won = await query<{ id: string }>(
    `UPDATE leads SET status = 'gewonnen', coachee_id = $3, follow_up_on = NULL, updated_at = now(),
            log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'Als Coachee angelegt')) WHERE id = $1 AND coach_id = $2 RETURNING id`,
    [leadId, coachId, coacheeId],
  );
  if (!won.length) return;
  // Alle Mails dieser Anfrage (Anfrage, Vertrag, Startmail) gehören jetzt zur Akte: Dokumente und Termine nachziehen
  const mails = await query<{ id: string }>(
    "UPDATE inbox_mails SET coachee_id = $2 WHERE coach_id = $3 AND coachee_id IS NULL AND (applied->>'lead' = $1::text OR id = (SELECT mail_id FROM leads WHERE id = $1)) RETURNING id",
    [leadId, coacheeId, coachId],
  );
  for (const m of mails) await applyMail(m.id);
}
