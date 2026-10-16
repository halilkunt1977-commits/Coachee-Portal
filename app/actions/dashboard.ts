"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { MILESTONES } from "@/lib/dashboard/milestones";
import { text } from "@/lib/forms";

/** Etappe abhaken oder zurücknehmen. Dürfen Coach und Coachee. */
export async function toggleMilestone(coacheeId: string, key: string, done: boolean) {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  if (!MILESTONES[c.coaching_type].some((m) => m.key === key)) return;
  if (done) await query("INSERT INTO milestones (coachee_id, key, done_by) VALUES ($1, $2, $3) ON CONFLICT (coachee_id, key) DO NOTHING", [c.id, key, user.id]);
  else await query("DELETE FROM milestones WHERE coachee_id = $1 AND key = $2", [c.id, key]);
  await audit(user.id, done ? "milestone_done" : "milestone_undone", c.id, { key });
  revalidatePath(`/coach/coachees/${c.id}`);
  revalidatePath("/coach", "layout");
  revalidatePath("/mein-bereich");
}

/** Ort für das Wetter auf dem Coach-Dashboard */
export async function setCoachCity(fd: FormData) {
  const coach = await requireCoach();
  await query("UPDATE users SET city = $2 WHERE id = $1", [coach.id, text(fd, "city", 100) || null]);
  revalidatePath("/coach", "layout");
}

/** Wohnort des Coachees fürs Wetter, falls er nicht im Lebenslauf steht. Dürfen Coach und Coachee. */
export async function setCoacheeCity(coacheeId: string, fd: FormData) {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  await query("UPDATE coachees SET city = $2, updated_at = now() WHERE id = $1", [c.id, text(fd, "city", 100) || null]);
  revalidatePath(`/coach/coachees/${c.id}`);
  revalidatePath("/mein-bereich");
}
