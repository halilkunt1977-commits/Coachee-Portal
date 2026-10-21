"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { query } from "@/lib/db";
import { featureOf, isFeatureKey } from "@/lib/features";
import { text, type FormState } from "@/lib/forms";

const refresh = (coacheeId: string) => {
  revalidatePath("/coach/freigaben");
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/coach");
};

/** Zusatzfunktion für einen Coachee freigeben oder wieder sperren. Wirkt sofort, auch serverseitig (assertAiAllowed). */
export async function setFeature(coacheeId: string, key: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!isFeatureKey(key)) return { ok: false, error: "Diese Funktion gibt es nicht." };
  await query(
    on
      ? "UPDATE coachees SET features = array_append(array_remove(features, $2), $2), updated_at = now() WHERE id = $1"
      : "UPDATE coachees SET features = array_remove(features, $2), updated_at = now() WHERE id = $1",
    [c.id, key],
  );
  await audit(coach.id, on ? "feature_enabled" : "feature_disabled", c.id, { feature: key, label: featureOf(key).label });
  refresh(c.id);
  return { ok: true };
}

/** Eigene Monatsgrenze für die Hilfen; leer = Standard (AI_COACHEE_MONTHLY_LIMIT) */
export async function setAiLimit(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const raw = text(fd, "limit", 10);
  const limit = raw === "" ? null : Number(raw);
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 1000)) return { error: "Bitte eine ganze Zahl von 0 bis 1000 eingeben oder leer lassen." };
  if (limit === c.ai_monthly_limit) return { ok: "Unverändert." };
  await query("UPDATE coachees SET ai_monthly_limit = $2, updated_at = now() WHERE id = $1", [c.id, limit]);
  await audit(coach.id, "ai_limit_set", c.id, { limit });
  refresh(c.id);
  return { ok: limit === null ? "Standard-Grenze gilt." : "Grenze gespeichert." };
}
