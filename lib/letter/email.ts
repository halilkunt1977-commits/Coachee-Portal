// E-Mail-Bewerbung zum Anschreiben: kurze Nachricht, die das PDF-Anschreiben und den Lebenslauf begleitet.
// Ohne Server-Abhängigkeiten, damit Editor (Browser) und Server dieselbe Vorlage nutzen. Das Portal verschickt nichts selbst.

import { closingFor, lines, paragraphs, type LetterLang, type LetterView } from "./types";

export const EMAIL_FIELDS = ["to", "subject", "body"] as const;
export type EmailField = (typeof EMAIL_FIELDS)[number];
export type EmailValues = Record<EmailField, string>;
/** Was in applications.email_* steht: null heißt „automatisch aus dem Anschreiben“ */
export type StoredEmail = Record<EmailField, string | null>;

export const EMAIL_MAX: Record<EmailField, number> = { to: 254, subject: 300, body: 4000 };

/** Erste E-Mail-Adresse aus einem Freitext wie „Frau Müller, mueller@firma.de, 0911 …“ */
export function emailIn(text: string) {
  const m = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text ?? "");
  return m ? m[0] : "";
}

export const looksLikeEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(s.trim());

/** „Bewerbung als Lagerist – Referenznummer 123 – Stefan Schmidt“ */
export function emailSubject(letterSubject: string, refnr: string | null | undefined, name: string, lang: LetterLang = "de") {
  return [letterSubject.trim() || (lang === "tr" ? "İş Başvurusu" : "Bewerbung"), refnr?.trim() && `${lang === "tr" ? "Referans No" : "Referenznummer"} ${refnr.trim()}`, name.trim()].filter(Boolean).join(" – ");
}

/** Sätze eines Absatzes; trennt nur, wenn danach ein neuer Satz beginnt (Großbuchstabe oder Anführungszeichen) */
export const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜÇĞİŞ„"])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** „(Anschreiben, Lebenslauf und Zeugnisse)“ aus der Anlagenliste des Briefs */
export function attachmentNames(letterAttachments: string, lang: LetterLang = "de") {
  const names = [lang === "tr" ? "Ön yazı" : "Anschreiben", ...lines(letterAttachments).map((l) => l.replace(/^[-–•*]\s*/, ""))];
  return names.filter((n, i) => n && names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
}

const list = (xs: string[], and: string) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${and} ${xs.at(-1)}` : xs[0] ?? "");

export const ATTACHMENT_SENTENCE = (letterAttachments: string, lang: LetterLang = "de") =>
  lang === "tr"
    ? `Başvuru belgelerimi (${list(attachmentNames(letterAttachments, lang), "ve")}) ekte PDF olarak bulabilirsiniz.`
    : `Im Anhang finden Sie meine Bewerbungsunterlagen (${list(attachmentNames(letterAttachments), "und")}) als PDF.`;
export const OUTRO_SENTENCE = "Über eine Einladung zu einem persönlichen Gespräch freue ich mich.";
const OUTRO_TR = "Sizinle yüz yüze bir görüşmede tanışmaktan memnuniyet duyarım.";

/**
 * Kurzfassung des Brieftexts ohne Schreibhilfe: der erste Satz des Einstiegs, die ersten zwei Sätze des Mittelteils
 * (dort stehen die Angaben aus dem Lebenslauf), dann Hinweis auf die Anlagen und der Gesprächswunsch.
 * Nimmt nur Sätze aus dem Brief, erfindet nichts dazu. Zusammen höchstens sechs Sätze.
 */
export function condenseLetter(letterBody: string, letterAttachments: string, lang: LetterLang = "de") {
  const ps = paragraphs(letterBody).map((p) => sentences(p.join(" ")));
  const picked: string[] = [];
  if (ps.length >= 2) {
    picked.push(ps[0][0]);
    // Mittelteil: der erste Absatz vor dem Schluss
    const middle = ps.slice(1, ps.length > 2 ? -1 : undefined).find((p) => p.length);
    if (middle) picked.push(...middle.slice(0, 2));
  } else if (ps.length === 1) {
    picked.push(...ps[0].slice(0, 3));
  }
  // Sehr lange Sätze machen die Mail unübersichtlich; die bleiben im Anschreiben
  const kept = picked.filter((s, i) => i === 0 || s.length <= 260).slice(0, 4);
  // Erster Satz klein, weil er nach der Anrede mit Komma steht
  if (kept[0] && lang === "de") kept[0] = kept[0].replace(/^(Mit|Ich|Hiermit|Gern|Zurzeit|Zuletzt|Über|Auf|Da|Weil|Seit|Als)\b/, (w) => w.toLowerCase());
  return [...kept, ATTACHMENT_SENTENCE(letterAttachments, lang), lang === "tr" ? OUTRO_TR : OUTRO_SENTENCE].join(" ");
}

/** Nachricht ohne Signatur: Anrede, Kurzfassung in zwei Absätzen, Gruß */
export function composeEmailBody(salutation: string, text: string, closing: string, lang: LetterLang = "de") {
  const s = sentences(text);
  // Anlagenhinweis und Gesprächswunsch als eigener kurzer Absatz
  const tail = s.findIndex((x) => /^(Im Anhang|Başvuru belgelerimi)/.test(x));
  const parts = tail > 0 ? [s.slice(0, tail).join(" "), s.slice(tail).join(" ")] : [s.join(" ")];
  return [salutation.trim() || (lang === "tr" ? "Sayın Yetkili," : "Sehr geehrte Damen und Herren,"), ...parts.filter(Boolean), closing.trim() || closingFor(lang)].join("\n\n");
}

/** Automatische E-Mail aus dem aktuellen Stand des Anschreibens */
export function autoEmail(letter: Pick<LetterView, "subject" | "salutation" | "body" | "closing" | "attachments" | "senderName" | "lang">, app: { contact: string; refnr: string | null }): EmailValues {
  const lang = letter.lang ?? "de";
  return {
    to: emailIn(app.contact),
    subject: emailSubject(letter.subject, app.refnr, letter.senderName, lang),
    body: composeEmailBody(letter.salutation, condenseLetter(letter.body, letter.attachments, lang), letter.closing, lang),
  };
}

/** Signatur unter der Mail: Name, Telefon, E-Mail aus dem Absender des Anschreibens */
export function emailSignature(letter: Pick<LetterView, "senderName" | "senderPhone" | "senderEmail" | "lang">) {
  return [letter.senderName.trim(), letter.senderPhone.trim() && `Telefon: ${letter.senderPhone.trim()}`, letter.senderEmail.trim() && `${letter.lang === "tr" ? "E-posta" : "E-Mail"}: ${letter.senderEmail.trim()}`].filter(Boolean).join("\n");
}

export const fullEmailText = (body: string, signature: string) => [body.replace(/\r/g, "").trimEnd(), signature].filter(Boolean).join("\n\n");

/** mailto:-Link; Zeilenumbrüche als CRLF, wie es RFC 6068 verlangt. Anhänge kann ein mailto:-Link nicht mitgeben. */
export function mailtoHref(to: string, subject: string, text: string) {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  const addr = looksLikeEmail(to) ? encodeURIComponent(to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${addr}?subject=${enc(subject)}&body=${enc(text)}`;
}

export function normalizeStoredEmail(row: { email_to?: unknown; email_subject?: unknown; email_body?: unknown }): StoredEmail {
  const v = (x: unknown, k: EmailField) => (typeof x === "string" ? x.slice(0, EMAIL_MAX[k]) : null);
  return { to: v(row.email_to, "to"), subject: v(row.email_subject, "subject"), body: v(row.email_body, "body") };
}

export const resolveEmail = (auto: EmailValues, stored: StoredEmail): EmailValues => ({
  to: stored.to ?? auto.to,
  subject: stored.subject ?? auto.subject,
  body: stored.body ?? auto.body,
});
