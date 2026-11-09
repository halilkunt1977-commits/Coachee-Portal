"use server";
import { revalidatePath } from "next/cache";
import { ownCoachee } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, requireUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { evaluateTraining, loadTraining, startTraining } from "@/lib/jobs/training";
import { notify } from "@/lib/push";
import { isTrainingVoice } from "@/lib/jobs/training-shared";

/*
 * Interview-Training für Coachees mit Freigabe „interview_training“. Ein Training zählt einmal zur Monatsgrenze
 * (Fragen und Auswertung), das Umwandeln der Antworten in Text nicht.
 */
const FAIL = "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen.";

async function coachee() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c || c.coaching_type !== "job" || !hasFeature(c, "interview_training")) return null;
  return { user, c };
}

export async function newTraining(appId: string, opts: { count?: number; voice?: string } = {}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = await coachee();
  if (!s) return { ok: false, error: "Diese Funktion hat dein Coach für dich noch nicht freigeschaltet." };
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  try {
    await assertAiAllowed(s.user, { feature: "interview_training", coachee: s.c });
    const id = await startTraining(s.c, appId, s.user.id, { count: Number(opts?.count), voice: isTrainingVoice(opts?.voice) ? opts.voice : "f" });
    if (!id) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
    await audit(s.user.id, "training_started", s.c.id, { application: appId, training: id });
    return { ok: true, id };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("[ai] training fragen", e);
    return { ok: false, error: e instanceof AiError ? e.message : FAIL };
  }
}

export async function finishTraining(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await coachee();
  if (!s) return { ok: false, error: "Diese Funktion hat dein Coach für dich noch nicht freigeschaltet." };
  const t = await loadTraining(s.c, id);
  if (!t) return { ok: false, error: "Dieses Training gibt es nicht mehr." };
  if (t.report) return { ok: true };
  try {
    await evaluateTraining(s.c, t, s.user.id);
    await audit(s.user.id, "training_finished", s.c.id, { training: id });
    await notify([s.c.coach_id], {
      title: `${s.c.first_name} ${s.c.last_name} hat ein Interview-Training gemacht`,
      body: t.title,
      url: `/coach/coachees/${s.c.id}?tab=bewerbungen#training`,
      tag: `training-${id}`,
    }).catch(() => undefined);
    if (t.application_id) revalidatePath(`/mein-bereich/bewerbungen/${t.application_id}/training`);
    return { ok: true };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("[ai] training auswertung", e);
    return { ok: false, error: e instanceof AiError ? e.message : FAIL };
  }
}
