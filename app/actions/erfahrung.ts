"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coacheeFor } from "@/lib/access";
import { AiError, aiEnabled } from "@/lib/ai";
import { audit, requireCoach, requireUser, type User } from "@/lib/auth";
import { extractCvText, parseCvText } from "@/lib/cv/import";
import { cvFromAkte } from "@/lib/cv/store";
import { normalizeCv, type CvData } from "@/lib/cv/types";
import { one, query } from "@/lib/db";
import { storeFile } from "@/lib/files";
import { text, type FormState } from "@/lib/forms";
import { noticeMail, sendMail } from "@/lib/mail";
import { cvFromSurvey, surveyFromCv, tasksForStation } from "@/lib/survey/ai";
import { normalizeSurvey, type Station, type SurveyData } from "@/lib/survey/types";

const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/mein-bereich/erfahrung");
  revalidatePath("/coach", "layout");
};

/** Coachees sehen neutrale Meldungen, der Coach die genaue. */
const failure = (user: User, e: unknown) => {
  if (!(e instanceof AiError)) console.error("Erfahrungsbogen", e);
  if (user.role === "coach") return e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen.";
  if (e instanceof AiError && /Datei|PDF|Word|Text/.test(e.message)) return e.message;
  return "Das hat gerade nicht geklappt. Bitte versuch es in ein paar Minuten noch einmal oder sag deinem Coach Bescheid.";
};

async function surveyFor(user: User, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await one<{ id: string; coachee_id: string; status: string; data: unknown; cv: unknown }>("SELECT id, coachee_id, status, data, cv FROM experience_surveys WHERE id = $1", [id]);
  if (!row) return null;
  const c = await coacheeFor(user, row.coachee_id);
  return { ...row, c };
}

/** Bogen anlegen: aus einer hochgeladenen Datei oder einem Lebenslauf, der schon im Portal ist */
export async function startSurvey(coacheeId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  if (!aiEnabled()) return { error: user.role === "coach" ? "Die KI ist noch nicht eingerichtet (OPENAI_API_KEY fehlt)." : "Der Bogen ist gerade nicht verfügbar. Bitte sag deinem Coach Bescheid." };
  const today = await one<{ n: number }>("SELECT count(*)::int AS n FROM experience_surveys WHERE coachee_id = $1 AND created_at > now() - interval '1 day'", [c.id]);
  if (user.role !== "coach" && (today?.n ?? 0) >= 5) return { error: "Für heute ist genug hochgeladen. Morgen geht es weiter, oder dein Coach hilft dir." };

  let cv: CvData;
  let sourceId: string | null = null;
  const from = text(fd, "from", 40);
  try {
    if (from && from !== "datei") {
      const row = await one<{ data: unknown; source_file_id: string | null }>("SELECT data, source_file_id FROM cvs WHERE id = $1 AND coachee_id = $2", [from, c.id]);
      if (!row) return { error: "Lebenslauf nicht gefunden." };
      cv = normalizeCv(row.data);
      sourceId = row.source_file_id;
    } else {
      const file = fd.get("datei");
      if (!(file instanceof File) || file.size === 0) return { error: "Bitte deinen Lebenslauf auswählen." };
      if (file.size > 10 * 1024 * 1024) return { error: "Die Datei ist größer als 10 MB." };
      const { text: content, buffer } = await extractCvText(file);
      cv = await parseCvText(content, { coacheeId: c.id, userId: user.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone ?? "" });
      if (!cv.skills.length) cv.skills = (await cvFromAkte(c)).skills;
      sourceId = await storeFile({ coacheeId: c.id, kind: "cv_vorlage", name: file.name, mime: file.type || "application/octet-stream", data: buffer, userId: user.id });
    }
    if (!cv.experience.length && !cv.education.length) return { error: "Im Lebenslauf haben wir keine Stationen gefunden. Du kannst sie im Bogen auch selbst eintragen." };
    const data = await surveyFromCv(cv, { coacheeId: c.id, userId: user.id });
    await query("INSERT INTO experience_surveys (coachee_id, data, cv, source_file_id, created_by) VALUES ($1,$2,$3,$4,$5)", [c.id, JSON.stringify(data), JSON.stringify(cv), sourceId, user.id]);
  } catch (e) {
    return { error: failure(user, e) };
  }
  await audit(user.id, "survey_started", c.id);
  refresh(c.id);
  return { ok: "Dein Bogen ist bereit." };
}

/** Leeren Bogen anlegen, wenn kein Lebenslauf da ist */
export async function startEmptySurvey(coacheeId: string) {
  const user = await requireUser();
  const c = await coacheeFor(user, coacheeId);
  await query("INSERT INTO experience_surveys (coachee_id, data, created_by) VALUES ($1,$2,$3)", [c.id, JSON.stringify(normalizeSurvey({})), user.id]);
  await audit(user.id, "survey_started", c.id);
  refresh(c.id);
}

export async function saveSurvey(id: string, data: SurveyData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const s = await surveyFor(user, id);
  if (!s) return { ok: false, error: "Bogen nicht gefunden." };
  await query("UPDATE experience_surveys SET data = $2, updated_at = now() WHERE id = $1", [s.id, JSON.stringify(normalizeSurvey(data))]);
  return { ok: true };
}

/** Typische Tätigkeiten für eine selbst eingetragene Station holen */
export async function suggestStationTasks(id: string, station: Pick<Station, "title" | "company">): Promise<{ ok: true; tasks: Station["tasks"]; tools: Station["tools"] } | { ok: false; error: string }> {
  const user = await requireUser();
  const s = await surveyFor(user, id);
  if (!s) return { ok: false, error: "Bogen nicht gefunden." };
  if (!station.title.trim()) return { ok: false, error: "Bitte zuerst die Tätigkeit oder den Beruf eintragen." };
  if (!aiEnabled()) return { ok: false, error: "Das geht gerade nicht. Trag deine Aufgaben bitte unten selbst ein." };
  try {
    const r = await tasksForStation({ title: station.title.slice(0, 200), company: station.company.slice(0, 200) }, { coacheeId: s.c.id, userId: user.id });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: failure(user, e) };
  }
}

export async function submitSurvey(id: string, data: SurveyData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const s = await surveyFor(user, id);
  if (!s) return { ok: false, error: "Bogen nicht gefunden." };
  await query("UPDATE experience_surveys SET data = $2, status = 'eingereicht', submitted_at = now(), updated_at = now() WHERE id = $1", [s.id, JSON.stringify(normalizeSurvey(data))]);
  await audit(user.id, "survey_submitted", s.c.id);
  if (user.role !== "coach") {
    const coach = await one<{ name: string; email: string }>("SELECT name, email FROM users WHERE id = $1", [s.c.coach_id]);
    if (coach) await sendMail({ to: coach.email, ...noticeMail(coach.name.split(" ")[0], `${s.c.first_name} ${s.c.last_name} hat den Erfahrungsbogen ausgefüllt.`) }).catch(() => false);
  }
  refresh(s.c.id);
  return { ok: true };
}

/** Coach: aus dem Bogen einen neuen Lebenslauf schreiben lassen und im Editor öffnen */
export async function cvFromSurveyAction(id: string): Promise<FormState> {
  const coach = await requireCoach();
  const s = await surveyFor(coach, id);
  if (!s) return { error: "Bogen nicht gefunden." };
  const data = normalizeSurvey(s.data);
  if (!data.stations.length) return { error: "Im Bogen steht noch keine Station." };
  let cvId: string;
  try {
    const base = s.cv ? normalizeCv(s.cv) : await cvFromAkte(s.c);
    const cv = await cvFromSurvey(data, base, { coacheeId: s.c.id, userId: coach.id, names: [s.c.first_name, s.c.last_name] });
    if (!cv.place) cv.place = cv.personal.city;
    const row = await one<{ id: string }>("INSERT INTO cvs (coachee_id, name, data, updated_by) VALUES ($1,$2,$3,$4) RETURNING id", [s.c.id, "Lebenslauf aus Erfahrungsbogen", JSON.stringify(cv), coach.id]);
    cvId = row!.id;
  } catch (e) {
    return { error: failure(coach, e) };
  }
  await audit(coach.id, "cv_from_survey", s.c.id, { cv: cvId });
  refresh(s.c.id);
  redirect(`/lebenslauf/${cvId}`);
}

export async function deleteSurvey(id: string) {
  const coach = await requireCoach();
  const s = await surveyFor(coach, id);
  if (!s) return;
  await query("DELETE FROM experience_surveys WHERE id = $1", [s.id]);
  await audit(coach.id, "survey_deleted", s.c.id);
  refresh(s.c.id);
}

export async function reopenSurvey(id: string) {
  const coach = await requireCoach();
  const s = await surveyFor(coach, id);
  if (!s) return;
  await query("UPDATE experience_surveys SET status = 'offen', submitted_at = NULL WHERE id = $1", [s.id]);
  refresh(s.c.id);
}
