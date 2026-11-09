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
import { attachmentsFor, closingFor, isLetterLang, looksTurkish, normalizeStoredLetter, salutationFor, splitContact, subjectFor, type LetterField, type LetterLang } from "./types";

export type LetterAuto = Record<LetterField, string> & { body: string; lang: LetterLang };

/** Bewerbung samt Anschreiben laden, wenn der Nutzer die Akte sehen darf */
export async function letterFor(user: User, applicationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) notFound();
  const row = await one<{ coachee_id: string; letter: unknown; letter_lang: string | null; email_to: string | null; email_subject: string | null; email_body: string | null }>(
    "SELECT coachee_id, letter, letter_lang, email_to, email_subject, email_body FROM applications WHERE id = $1",
    [applicationId],
  );
  if (!row) notFound();
  const coachee = await coacheeFor(user, row.coachee_id);
  if (coachee.coaching_type !== "job") notFound();
  const app = (await getApplication(coachee.id, applicationId))!;
  const cv = await one<{ id: string; data: unknown; color: string }>("SELECT id, data, color FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [coachee.id]);
  const own = user.role !== "coach";
  const data = cv ? (own ? lockPersonal(normalizeCv(cv.data), personalLockOf(coachee)) : normalizeCv(cv.data)) : null;
  const lang: LetterLang = isLetterLang(row.letter_lang) ? row.letter_lang : autoLang(coachee, app, data);
  const auto = autoLetter(coachee, app, data, lang);
  const stored = normalizeStoredLetter(row.letter);
  const email = normalizeStoredEmail(row);
  // Automatisch auf Türkisch erkannt, aber noch deutsch Gespeichertes da (von vor der Umstellung): das Deutsche nicht
  // mit türkischer Anrede mischen, sondern die türkische Vorlage zeigen. Gelöscht wird erst beim nächsten Speichern.
  if (lang === "tr" && !isLetterLang(row.letter_lang)) {
    const german = (v: string | null | undefined) => Boolean(v && GERMAN.test(v));
    if (stored) {
      if (german(stored.body)) stored.body = "";
      for (const k of ["subject", "reference", "salutation", "closing", "attachments"] as const) if (german(stored.fields[k])) delete stored.fields[k];
    }
    if (german(email.subject)) email.subject = null;
    if (german(email.body)) email.body = null;
  }
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
    lang,
    /** Sprache von Hand gewählt (sonst automatisch erkannt) */
    langChosen: isLetterLang(row.letter_lang),
    stored,
    auto,
    email,
    /** Neuester Lebenslauf, als PDF-Anlage zur E-Mail-Bewerbung */
    cvId: cv?.id ?? null,
    // Farbe des neuesten Lebenslaufs, damit Anschreiben und Lebenslauf zusammenpassen
    color: cv && /^#[0-9a-f]{6}$/i.test(cv.color) ? cv.color : "#1f3a5f",
  };
}

const GERMAN = /(^|[\s,(])(ich|und|Ihnen|Ihr|Ihre|Sehr geehrte[rn]?|Guten Tag|Mit freundlichen|Grüßen|Bewerbung|Initiativbewerbung|Anlagen|Lebenslauf|Zeugnisse|Referenznummer)([\s,.)!?]|$)/i;

/** Absenderfelder, die Coachees nicht selbst ändern können */
export const SENDER_LOCKED = ["senderName", "senderEmail", "senderPhone"] as const;

export const berlinDate = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/**
 * Sprache, wenn niemand gewählt hat: Türkisch nur für Coachees mit türkischer Ansicht, deren Lebenslauf türkisch ist
 * oder deren Stelle bei einer türkischen Firma liegt. Alle anderen schreiben deutsch.
 */
export function autoLang(c: Coachee, a: Application, cv: CvData | null): LetterLang {
  if (c.language !== "tr") return "de";
  return cv?.language === "tr" || looksTurkish(a.title, a.employer) ? "tr" : "de";
}

/** Alles, was sich aus Akte, Lebenslauf und Bewerbung schon ergibt */
export function autoLetter(c: Coachee, a: Application, cv: CvData | null, lang: LetterLang = "de"): LetterAuto {
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
    subject: subjectFor(a.title, lang),
    reference: a.refnr ? `${lang === "tr" ? "Referans No" : "Referenznummer"}: ${a.refnr}` : "",
    salutation: salutationFor(a.salutation, a.contact, lang),
    body: lang === "tr" ? templateBodyTr(a, cv) : templateBody(a, cv),
    closing: closingFor(lang),
    attachments: attachmentsFor(lang),
    lang,
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

/**
 * Türkische Vorlage für Bewerbungen bei türkischen Firmen. Firmen- und Berufsnamen stehen ohne angehängte Endung
 * („… için“, „… şirketinde“), weil die Vokalharmonie je Name wechselt.
 */
export function templateBodyTr(a: Application, cv: CvData | null) {
  const title = a.title.replace(/\s*\((m|w|d|f|gn|all)[/|,\s]*[^)]*\)\s*$/i, "").trim();
  const initiative = /initiativ|a[çc][iı]k ba[şs]vuru/i.test(a.title);
  const job = cv?.experience.find((e) => e.title || e.company);
  const skills = (cv?.skills ?? []).map((s) => s.name).filter(Boolean).slice(0, 3);
  const edu = cv?.education.find((e) => e.degree);

  const intro = initiative
    ? `${a.employer ? `${a.employer} bünyesinde` : "Şirketinizde"} çalışmak istediğim için açık başvuruda bulunuyorum. Çalışma alanınız ilgimi çekiyor ve deneyimimi sizinle paylaşmak isterim.`
    : `${a.employer ? `${a.employer} tarafından yayınlanan` : "Yayınladığınız"} ${title ? `“${title}” ilanını` : "iş ilanını"} ilgiyle okudum ve bu pozisyon için başvurmak istiyorum.`;

  const middle: string[] = [];
  if (job) {
    const where = job.company ? `${job.company} şirketinde ` : "";
    const role = job.title || "çalışan";
    middle.push(job.current ? `Şu anda ${where}${role} olarak çalışıyorum.` : `En son ${where}${role} olarak çalıştım.`);
  } else if (edu) middle.push(`Eğitimim: “${edu.degree}”.`);
  if (skills.length) middle.push(`Size katabileceğim beceriler arasında ${skills.length > 1 ? `${skills.slice(0, -1).join(", ")} ve ${skills.at(-1)}` : skills[0]} var.`);
  if (!middle.length) middle.push("Bu göreve neler katabileceğimi bir görüşmede memnuniyetle anlatırım.");

  const outro = "Sizinle yüz yüze bir görüşmede tanışma fırsatı bulursam çok sevinirim. Sorularınız için bana telefon veya e-posta ile ulaşabilirsiniz.";
  return [intro, middle.join(" "), outro].join("\n\n");
}
