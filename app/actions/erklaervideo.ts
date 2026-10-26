"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { isVideoLanguage } from "@/lib/erklaervideo";

/**
 * Sprache des Erklärvideos merken, nur durch den Coach: Sie ist zugleich die Sprache des ganzen Coachee-Bereichs.
 * Schaltet der Coachee im Video um, gilt das nur für dieses Ansehen.
 */
export async function setVideoLanguage(coacheeId: string, lang: string) {
  const user = await requireUser();
  if (user.role !== "coach") return;
  const c = await coacheeFor(user, coacheeId);
  if (!isVideoLanguage(lang) || c.language === lang) return;
  await query("UPDATE coachees SET language = $2 WHERE id = $1", [c.id, lang]);
  revalidatePath("/mein-bereich", "layout");
  revalidatePath(`/coach/coachees/${c.id}`, "layout");
}

/** Der Coachee hat das Video bis zum Ende gesehen: Hinweis auf der Startseite verschwindet. Die Vorschau des Coachs zählt nicht. */
export async function markVideoSeen(coacheeId: string) {
  const user = await requireUser("coachee");
  const c = await coacheeFor(user, coacheeId);
  if (c.video_seen_at) return;
  await query("UPDATE coachees SET video_seen_at = now() WHERE id = $1", [c.id]);
  revalidatePath("/mein-bereich");
}

/** Hinweis auf der Startseite wegklicken; das Video bleibt im Menü unter „So funktioniert dein Portal“ */
export async function hideVideoCard(coacheeId: string) {
  const user = await requireUser("coachee");
  const c = await coacheeFor(user, coacheeId);
  await query("UPDATE coachees SET video_card_hidden_at = now() WHERE id = $1 AND video_card_hidden_at IS NULL", [c.id]);
  revalidatePath("/mein-bereich");
}
