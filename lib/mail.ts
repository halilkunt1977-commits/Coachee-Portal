import "server-only";
import { domainToASCII } from "node:url";
import { translator, type Lang } from "./i18n";
import { smtpSend } from "./smtp";

/*
 * E-Mails des Portals über SMTP (z. B. Strato: SMTP_HOST=smtp.strato.de, SMTP_PORT=465, SMTP_USER, SMTP_PASS, optional MAIL_FROM).
 * Mails enthalten nie Coaching-Inhalte, nur Hinweise mit Link ins Portal.
 */
export const mailEnabled = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const ascii = (addr: string) => addr.replace(/@([^\s>]+)/g, (_m, d: string) => "@" + (domainToASCII(d) || d));
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);

export function portalUrl(path = "") {
  const base = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "");
  try {
    const url = new URL(base);
    url.hostname = domainToASCII(url.hostname) || url.hostname;
    return url.origin + path;
  } catch {
    return base + path;
  }
}

/** Warum eine Mail nicht rausging, als Kürzel für die Oberfläche (die vollständige Meldung steht im Server-Log). */
export function mailProblem(e: unknown): "aus" | "anmeldung" | "verbindung" | "absender" | "sonst" {
  if (!mailEnabled()) return "aus";
  const msg = String((e as Error)?.message ?? e);
  const code = (e as { code?: string })?.code ?? "";
  if (/„5(35|34|30)/.test(msg) || /erwartet 235/.test(msg)) return "anmeldung";
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|ECONNRESET|Zeitüberschreitung/.test(code + msg)) return "verbindung";
  if (/erwartet 250/.test(msg) && /„5(50|53|54)/.test(msg)) return "absender";
  return "sonst";
}

export const MAIL_PROBLEM_TEXT: Record<string, string> = {
  aus: "Der E-Mail-Versand ist noch nicht eingerichtet. Die Zugangsdaten des Postfachs müssen auf dem Server hinterlegt werden.",
  anmeldung: "Der Mailserver hat die Anmeldung abgelehnt. Bitte die hinterlegte Mailadresse (komplett) und das Passwort genau dieses Postfachs prüfen.",
  verbindung: "Der Mailserver war nicht erreichbar. Bitte Serveradresse und Port des Postfachs prüfen (Strato: smtp.strato.de, 465).",
  absender: "Der Mailserver hat Absender oder Empfänger abgelehnt. Die Absenderadresse muss zur Adresse des Postfachs passen.",
  sonst: "Die E-Mail konnte nicht verschickt werden. Die genaue Meldung steht im Protokoll der App auf dem Server.",
};

export async function sendMail({ to, subject, text, html, replyTo, calendar }: { to: string; subject: string; text: string; html: string; replyTo?: string | null; calendar?: { method: "REQUEST" | "CANCEL"; content: string } | null }) {
  if (!mailEnabled()) {
    console.warn(`[mail] SMTP nicht eingerichtet, Mail an ${to} nicht verschickt: ${subject}`);
    return false;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  await smtpSend({
    host: process.env.SMTP_HOST!,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    from: ascii(process.env.MAIL_FROM || `Gründarium Portal <${process.env.SMTP_USER}>`),
    to: [ascii(to)],
    replyTo: replyTo ? ascii(replyTo) : null,
    subject,
    text,
    html,
    calendar,
  });
  return true;
}

const NAVY = "#1f3a5f";
export function layout(title: string, paragraphs: string[], button?: { label: string; href: string }, lang: Lang = "de") {
  const p = paragraphs.map((t) => `<p style="margin:0 0 14px;line-height:1.55">${esc(t)}</p>`).join("");
  const b = button
    ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${esc(button.label)}</a></p><p style="font-size:12px;color:#6f6a60;word-break:break-all">${esc(translator(lang)("Falls der Knopf nicht geht: {link}", { link: button.href }))}</p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#17181c;background:#f6f4ef;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px"><p style="font-weight:bold;font-size:20px;color:${NAVY};margin:0 0 18px">gründarium · Portal</p><h1 style="font-size:20px;margin:0 0 14px">${esc(title)}</h1>${p}${b}</div></div>`;
}

export function inviteMail(name: string, coachName: string, link: string, lang: Lang = "de") {
  const t = translator(lang);
  const lines = [
    t("Hallo {name},", { name }),
    t("{coach} hat für dich einen Zugang zum Gründarium Portal eingerichtet. Dort findest du alles aus unserem Coaching an einem Ort: Termine, Aufgaben, Lebenslauf, Businessplan und mehr.", { coach: coachName }),
    t("Lege über den Link dein Passwort fest. Der Link ist 7 Tage gültig."),
  ];
  return { subject: t("Dein Zugang zum Gründarium Portal"), text: `${lines.join("\n\n")}\n\n${link}`, html: layout(t("Willkommen im Portal"), lines, { label: t("Passwort festlegen"), href: link }, lang) };
}

export function resetMail(name: string, link: string, lang: Lang = "de") {
  const t = translator(lang);
  const lines = [t("Hallo {name},", { name }), t("du hast ein neues Passwort angefordert. Der Link ist 2 Stunden gültig. Falls du das nicht warst, ignoriere diese Mail einfach.")];
  return { subject: t("Neues Passwort für das Gründarium Portal"), text: `${lines.join("\n\n")}\n\n${link}`, html: layout(t("Neues Passwort"), lines, { label: t("Passwort neu setzen"), href: link }, lang) };
}

/** Hinweis ohne Inhalt; "what" ist ein deutscher Satz und wird in die Sprache des Empfängers übersetzt */
export function noticeMail(name: string, what: string, lang: Lang = "de") {
  const t = translator(lang);
  const lines = [t("Hallo {name},", { name }), `${t(what)} ${t("Melde dich im Portal an, um es anzusehen.")}`];
  return { subject: t("Neues im Gründarium Portal"), text: `${lines.join("\n\n")}\n\n${portalUrl("/")}`, html: layout(t("Es gibt etwas Neues"), lines, { label: t("Zum Portal"), href: portalUrl("/") }, lang) };
}
