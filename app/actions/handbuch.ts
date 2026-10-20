"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

/** Schritt im Handbuch abhaken oder zurücknehmen. Das Handbuch gehört dem Coachee: nur er selbst hakt ab. */
export async function toggleHandbookItem(coacheeId: string, item: string, done: boolean) {
  const user = await requireUser("coachee");
  const c = await coacheeFor(user, coacheeId);
  if (!/^[a-z0-9-]{2,40}$/.test(item)) return { ok: false as const };
  if (done) await query("INSERT INTO handbook_checks (coachee_id, item) VALUES ($1,$2) ON CONFLICT DO NOTHING", [c.id, item]);
  else await query("DELETE FROM handbook_checks WHERE coachee_id = $1 AND item = $2", [c.id, item]);
  revalidatePath("/mein-bereich/handbuch");
  return { ok: true as const };
}
