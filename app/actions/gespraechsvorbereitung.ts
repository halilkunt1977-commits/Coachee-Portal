"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { editInterview, prepareInterview } from "@/lib/jobs/interview";
import { normalizeInterview, type Interview, type InterviewAiTask } from "@/lib/jobs/interview-shared";

/*
 * Gesprächsvorbereitung je Stelle: erstellen, bearbeiten und löschen nur durch den Coach. Der Coachee sieht die Fassung,
 * die der Coach ihm geschickt hat (Teilen-Art „vorbereitung“, app/actions/teilen.ts), sonst mit der Freigabe
 * „gespraechsvorbereitung“ (lib/features.ts) die zuletzt gespeicherte.
 */
type Result = { ok: true; interview: Interview | null; savedAt: string | null } | { ok: false; error: string };

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const refresh = (coacheeId: string) => revalidatePath(`/coach/coachees/${coacheeId}`, "layout");

/** Was der Coach unter „Zur Stelle“ beschreibt: Stellentext (derselbe wie in der Stellenanalyse) und eigene Hinweise zu Stelle und Gespräch */
export type InterviewBrief = { jobText: string; brief: string };

async function saveBrief(coacheeId: string, appId: string, b: InterviewBrief | undefined) {
  if (!b) return;
  await query("UPDATE applications SET job_text = $3, interview_brief = $4 WHERE id = $1 AND coachee_id = $2", [
    appId,
    coacheeId,
    String(b.jobText ?? "").replace(/\r/g, "").slice(0, 20000),
    String(b.brief ?? "").replace(/\r/g, "").slice(0, 6000),
  ]);
}

/** Vorbereitung (neu) erstellen. Was der Coach unter „Meine Empfehlungen“ geschrieben hat, bleibt. */
export async function generateInterview(coacheeId: string, appId: string, brief?: InterviewBrief): Promise<Result> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!isId(appId)) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  try {
    await saveBrief(c.id, appId, brief);
    await assertAiAllowed(coach, { coachOnly: true });
    const interview = await prepareInterview(c, appId, coach.id);
    if (!interview) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
    await audit(coach.id, "interview_prepared", c.id, { application: appId });
    refresh(c.id);
    return { ok: true, interview, savedAt: new Date().toISOString() };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("[ai] gespraechsvorbereitung", e);
    return { ok: false, error: e instanceof AiError ? e.message : "Die Vorbereitung hat nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

/**
 * KI-Hilfe im Editor: überarbeiten, weitere Fragen, eine Frage neu fassen. Gespeichert wird nur „Zur Stelle“;
 * die neue Fassung kommt als ungespeicherte Änderung in den Editor, der Coach prüft und speichert selbst.
 */
export async function aiEditInterview(coacheeId: string, appId: string, draft: Interview, task: InterviewAiTask, brief?: InterviewBrief): Promise<{ ok: true; interview: Interview } | { ok: false; error: string }> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!isId(appId)) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  if (task.mode === "revise" && !String(task.instruction ?? "").trim()) return { ok: false, error: "Bitte zuerst schreiben, was geändert werden soll." };
  try {
    await assertAiAllowed(coach, { coachOnly: true });
    await saveBrief(c.id, appId, brief);
    const interview = await editInterview(c, appId, coach.id, normalizeInterview(draft), task);
    if (!interview) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
    await audit(coach.id, "interview_ai_edit", c.id, { application: appId, mode: task.mode });
    return { ok: true, interview };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("[ai] gespraechsvorbereitung bearbeiten", e);
    return { ok: false, error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

/** Fassung des Coachs speichern (alle Teile bearbeitbar, Fragen hinzufügen und entfernen), dazu „Zur Stelle“ */
export async function saveInterview(coacheeId: string, appId: string, input: Interview, brief?: InterviewBrief): Promise<Result> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!isId(appId)) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  await saveBrief(c.id, appId, brief);
  const interview = normalizeInterview(input);
  const row = await one<{ at: string }>(
    "UPDATE applications SET interview = $3, interview_updated_at = now() WHERE id = $1 AND coachee_id = $2 RETURNING interview_updated_at AS at",
    [appId, c.id, JSON.stringify(interview)],
  );
  if (!row) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  const recent = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'interview_saved' AND detail->>'application' = $2 AND created_at > now() - interval '30 minutes' LIMIT 1", [coach.id, appId]);
  if (!recent) await audit(coach.id, "interview_saved", c.id, { application: appId });
  refresh(c.id);
  return { ok: true, interview, savedAt: row.at };
}

/** Vorbereitung ganz entfernen; der Coachee sieht für diese Stelle dann nichts mehr */
export async function deleteInterview(coacheeId: string, appId: string): Promise<Result> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!isId(appId)) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  await one("UPDATE applications SET interview = NULL, interview_updated_at = NULL, interview_seen_at = NULL, interview_sent = NULL, interview_sent_at = NULL WHERE id = $1 AND coachee_id = $2 RETURNING id", [appId, c.id]);
  await audit(coach.id, "interview_deleted", c.id, { application: appId });
  refresh(c.id);
  return { ok: true, interview: null, savedAt: null };
}
