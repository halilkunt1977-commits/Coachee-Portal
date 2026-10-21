import "server-only";
import { notFound } from "next/navigation";
import { coacheeFor, type Coachee } from "../access";
import type { User } from "../auth";
import { lockPersonal, normalizeCv, type CvData } from "../cv/types";
import { personalLockOf } from "../cv/store";
import { one } from "../db";
import { getApplication } from "../jobs/store";
import type { Application } from "../jobs/shared";
import { normalizeStoredEmail } from "./email";
import { DEFAULT_ATTACHMENTS, DEFAULT_CLOSING, normalizeStoredLetter, salutationFor, splitContact, subjectFor, type LetterField } from "./types";

export type LetterAuto = Record<LetterField, string> & { body: string };

/** Bewerbung samt Anschreiben laden, wenn der Nutzer die Akte sehen darf */
export async function letterFor(user: User, applicationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) notFound();
  const row = await one<{ coachee_id: string; letter: unknown; email_to: string | null; email_subject: string | null; email_body: string | null }>(
    "SELECT coachee_id, letter, email_to, email_subject, email_body FROM applications WHERE id = $1",
    [applicationId],
  );
  if (!row) notFound();
  const coachee = await coacheeFor(user, row.coachee_id);
  if (coachee.coaching_type !== "job") notFound();
  const app = (await getApplication(coachee.id, applicationId))!;
  const cv = await one<{ id: string; data: unknown; color: string }>("SELECT id, data, color FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [coachee.id]);
  const own = user.role !== "coach";
  const data = cv ? (own ? lockPersonal(normalizeCv(cv.data), personalLockOf(coachee)) : normalizeCv(cv.data)) : null;
  const auto = autoLetter(coachee, app, data);
  const stored = normalizeStoredLetter(row.letter);
  if (own) {
    // Coachees schreiben Anschreiben nur in eigenem Namen: Absendername und Kontakt kommen aus den Stammdaten
    auto.senderName = `${coachee.first_name} ${coachee.last_name}`;
    auto.senderEmail = coachee.email;
    auto.senderPhone = coachee.phone ?? "";
    if (stored) for (const k of SENDER_LOCKED) delete stored.fields[k];
  }
  return {
    app,
    coachee,
    stored,
    auto,
    email: normalizeStoredEmail(row),
    /** Neuester Lebenslauf, als PDF-Anlage zur E-Mail-Bewerbung */
    cvId: cv?.id ?? null,
    // Farbe des neuesten Lebenslaufs, damit Anschreiben und Lebenslauf zusammenpassen
    color: cv && /^#[0-9a-f]{6}$/i.test(cv.color) ? cv.color : "#1f3a5f",
  };
}

/** Absenderfelder, die Coachees nicht selbst ändern können */
export const SENDER_LOCKED = ["senderName", "senderEmail", "senderPhone"] as const;

export const berlinDate = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** Alles, was sich aus Akte, Lebenslauf und Bewerbung schon ergibt */
export function autoLetter(c: Coachee, a: Application, cv: CvData | null): LetterAuto {
  const p = cv?.personal;
  const city = p?.city || c.city || "";
  const salutation = a.salutation === "frau" ? "Frau" : a.salutation === "herr" ? "Herrn" : "";
  const contact = splitContact(a.contact).name;
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

  // Nur Angaben, die im Lebenslauf stehen; keine Superlative, keine erfundenen Eigenschaften
  const intro = initiative
    ? `ich bewerbe mich initiativ bei ${firm}, weil mich Ihr Arbeitsbereich interessiert und ich meine Erfahrung gern bei Ihnen einbringen möchte.`
    : `mit Interesse habe ich Ihre Stellenanzeige als ${title} gelesen und bewerbe mich hiermit bei ${firm}.`;

  const middle: string[] = [];
  if (job) {
    const where = job.company ? ` bei ${job.company}` : "";
    middle.push(job.current ? `Zurzeit arbeite ich als ${job.title || "Mitarbeiter"}${where}.` : `Zuletzt war ich als ${job.title || "Mitarbeiter"}${where} tätig.`);
  }
  else if (edu) middle.push(`Ich habe den Abschluss „${edu.degree}“.`);
  if (skills.length) middle.push(`Mitbringen kann ich unter anderem ${skills.length > 1 ? `${skills.slice(0, -1).join(", ")} und ${skills.at(-1)}` : skills[0]}.`);
  if (!middle.length) middle.push("Gern erläutere ich Ihnen in einem Gespräch, was ich für diese Aufgabe mitbringe.");

  const outro = "Über die Gelegenheit, mich Ihnen in einem persönlichen Gespräch vorzustellen, freue ich mich. Für Rückfragen bin ich telefonisch oder per E-Mail erreichbar.";
  return [intro, middle.join(" "), outro].join("\n\n");
}
