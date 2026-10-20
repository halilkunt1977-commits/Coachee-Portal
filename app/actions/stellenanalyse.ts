"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor, fullName } from "@/lib/access";
import { AiError } from "@/lib/ai";
import { audit, requireCoach } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";
import { one, query } from "@/lib/db";
import { PARSER_VERSION } from "@/lib/documents-text";
import { storeFile } from "@/lib/files";
import { text, type FormState } from "@/lib/forms";
import { analyzeApplication, type JobAnalysis } from "@/lib/jobs/analysis";
import { renderJobReportHtml } from "@/lib/jobs/report";

const refresh = (coacheeId: string) => revalidatePath(`/coach/coachees/${coacheeId}`);

/** Stellentext einfügen (z. B. aus der Anzeige kopiert) und gleich neu analysieren */
export async function analyzeJob(coacheeId: string, appId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (fd.has("job_text")) await query("UPDATE applications SET job_text = $3 WHERE id = $1 AND coachee_id = $2", [appId, c.id, text(fd, "job_text", 20000)]);
  try {
    const r = await analyzeApplication(c, appId, coach.id);
    if (!r) return { error: "Die KI ist noch nicht eingerichtet (OPENAI_API_KEY fehlt)." };
  } catch (error) {
    console.error("[ai] stellenanalyse", error);
    return { error: error instanceof AiError ? error.message : "Die Analyse hat nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
  await audit(coach.id, "job_analyzed", c.id, { appId });
  refresh(c.id);
  return { ok: "Analyse aktualisiert." };
}

export async function jobReportPdf(coacheeId: string, appId: string) {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const a = await one<{ title: string; employer: string; location: string; analysis: JobAnalysis | null }>("SELECT title, employer, location, analysis FROM applications WHERE id = $1 AND coachee_id = $2", [appId, c.id]);
  if (!a?.analysis) return null;
  const date = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  const pdf = await htmlToPdf(renderJobReportHtml(a.analysis, { title: a.title, employer: a.employer, location: a.location, coachee: fullName(c), coach: coach.name, date }, cvFontCss()));
  return { pdf, name: `Einschätzung ${a.title} ${a.employer}`.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 150) };
}

/** Bericht in die Dokumente der Akte legen, zunächst nicht freigegeben: der Coach entscheidet, wann der Coachee ihn sieht */
export async function jobReportToDocuments(coacheeId: string, appId: string) {
  const coach = await requireCoach();
  const made = await jobReportPdf(coacheeId, appId);
  if (!made) return;
  const fileId = await storeFile({ coacheeId, kind: "dokument", name: `${made.name}.pdf`, mime: "application/pdf", data: made.pdf, userId: coach.id });
  await query("INSERT INTO documents (coachee_id, file_id, category, title, created_by, parser_version) VALUES ($1,$2,'bewerbung',$3,$4,$5)", [coacheeId, fileId, made.name, coach.id, PARSER_VERSION]);
  await audit(coach.id, "job_report_filed", coacheeId, { appId });
  refresh(coacheeId);
}
