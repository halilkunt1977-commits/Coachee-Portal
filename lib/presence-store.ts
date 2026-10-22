import "server-only";
import { query } from "./db";
import type { Presence } from "./presence";

/** Online-Stand aller Coachees (mit Zugang) eines Coachs, eine Abfrage für alle Listen */
export function presenceFor(coachId: string) {
  return query<Presence>(
    `SELECT c.id, c.first_name || ' ' || c.last_name AS name, u.last_seen_at AS seen, u.last_seen_area AS area
       FROM coachees c JOIN users u ON u.id = c.user_id
      WHERE c.coach_id = $1
      ORDER BY u.last_seen_at DESC NULLS LAST`,
    [coachId],
  );
}

/** Meldung aus dem Coachee-Bereich: nur schreiben, wenn der letzte Eintrag älter als 30 Sekunden ist oder der Bereich wechselt */
export async function touchPresence(userId: string, area: string) {
  await query(
    `UPDATE users SET last_seen_at = now(), last_seen_area = $2
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 seconds' OR last_seen_area IS DISTINCT FROM $2)`,
    [userId, area],
  );
}

/** Beim Abmelden: sofort nicht mehr online, die Zeit bleibt für „zuletzt online“ */
export async function clearPresence(userId: string) {
  await query("UPDATE users SET last_seen_area = NULL WHERE id = $1", [userId]);
}
