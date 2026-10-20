import "server-only";
import { notFound } from "next/navigation";
import { coacheeFor, type Coachee } from "../access";
import type { User } from "../auth";
import { normalizeCv, type CvData } from "../cv/types";
import { one } from "../db";
import { getApplication } from "../jobs/store";
import type { Application } from "../jobs/shared";
import { DEFAULT_ATTACHMENTS, DEFAULT_CLOSING, normalizeStoredLetter, salutationFor, subjectFor, type LetterField } from "./types";

export type LetterAuto = Record<LetterField, string> & { body: string };

/** Bewerbung samt Anschreiben laden, wenn der Nutzer die Akte sehen darf */
export async function letterFor(user: User, applicationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) notFound();
  const row = await one<{ coachee_id: string; letter: unknown }>("SELECT coachee_id, letter FROM applications WHERE id = $1", [applicationId]);
  if (!row) notFound();
  const coachee = await coacheeFor(user, row.coachee_id);
  if (coachee.coaching_type !== "job") notFound();
  const app = (await getApplication(coachee.id, applicationId))!;
  const cv = await one<{ data: unknown; color: string }>("SELECT data, color FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [coachee.id]);
  const data = cv ? normalizeCv(cv.data) : null;
  return {
    app,
    coachee,
    stored: normalizeStoredLetter(row.letter),
    auto: autoLetter(coachee, app, data),
    // Farbe des neuesten Lebenslaufs, damit Anschreiben und Lebenslauf zusammenpassen
    color: cv && /^#[0-9a-f]{6}$/i.test(cv.color) ? cv.color : "#1f3a5f",
  };
}

export const berlinDate = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** Alles, was sich aus Akte, Lebenslauf und Bewerbung schon ergibt */
export function autoLetter(c: Coachee, a: Application, cv: CvData | null): LetterAuto {
  const p = cv?.personal;
  const city = p?.city || c.city || "";
  const salutation = a.salutation === "frau" ? "Frau" : a.salutation === "herr" ? "Herrn" : "";
  const contact = a.contact.split(/[,;\n]/)[0].replace(/^(frau|herrn?)\s+/i, "").trim();
  return {
    senderName: [p?.firstName || c.first_name, p?.lastName || c.last_name].filter(Boolean).join(" "),
    senderStreet: p?.street ?? "",
    senderCity: [p?.zip, city].filter(Boolean).join(" "),
    senderPhone: p?.phone || c.phone || "",
    senderEmail: p?.email || c.email || "",
    // Anschriftfeld nach DIN 5008: Firma, Ansprechperson, Straße, PLZ Ort
    recipient: [a.employer, contact && [salutation, contact].filter(Boolean).join(" "), a.street, [a.zip, a.location].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
    place: city,
    date: berlinDate(),
    subject: subjectFor(a.title),
    reference: a.refnr ? `Referenznummer: ${a.refnr}` : "",
    salutation: salutationFor(a.salutation, a.contact),
    body: templateBody(a, cv),
    closing: DEFAULT_CLOSING,
    attachments: DEFAULT_ATTACHMENTS,
  };
}

/** Brieftext ohne Schreibhilfe: solide Vorlage mit dem, was der Lebenslauf hergibt. Zum Anpassen gedacht. */
export function templateBody(a: Application, cv: CvData | null) {
  const title = a.title.replace(/\s*\((m|w|d|f|gn|all)[/|,\s]*[^)]*\)\s*$/i, "").trim() || "Mitarbeiter";
  const initiative = /initiativ/i.test(a.title);
  const firm = a.employer || "Ihrem Unternehmen";
  const job = cv?.experience.find((e) => e.title || e.company);
  const skills = (cv?.skills ?? []).map((s) => s.name).filter(Boolean).slice(0, 3);
  const edu = cv?.education.find((e) => e.degree);

  const intro = initiative
    ? `ich möchte mich bei ${firm} initiativ bewerben, weil mich Ihr Unternehmen und Ihre Arbeit überzeugen. Gern bringe ich meine Erfahrung und meine Motivation in Ihr Team ein.`
    : `mit großem Interesse habe ich Ihre Stellenanzeige als ${title} gelesen. Die beschriebenen Aufgaben passen sehr gut zu meinen Erfahrungen und zu dem, was ich beruflich suche. Deshalb bewerbe ich mich bei ${firm}.`;

  const middle: string[] = [];
  if (job) {
    const where = job.company ? ` bei ${job.company}` : "";
    middle.push(job.current ? `Zurzeit arbeite ich als ${job.title || "Mitarbeiter"}${where}.` : `Zuletzt war ich als ${job.title || "Mitarbeiter"}${where} tätig.`);
    middle.push("Dort habe ich gelernt, Aufgaben zuverlässig und selbstständig zu erledigen und auch in stressigen Phasen den Überblick zu behalten.");
  } else if (edu) {
    middle.push(`Meine Ausbildung (${edu.degree}) hat mir eine solide Grundlage für diese Aufgabe gegeben.`);
  }
  if (skills.length) middle.push(`Zu meinen Stärken zählen ${skills.length > 1 ? `${skills.slice(0, -1).join(", ")} und ${skills.at(-1)}` : skills[0]}.`);
  middle.push("Ich arbeite gern im Team, packe mit an und lerne mich schnell in neue Abläufe ein.");

  const outro = "Über die Gelegenheit, mich Ihnen in einem persönlichen Gespräch vorzustellen, freue ich mich sehr. Für Rückfragen bin ich jederzeit telefonisch oder per E-Mail erreichbar.";
  return [intro, middle.join(" "), outro].join("\n\n");
}
