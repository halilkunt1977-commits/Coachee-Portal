"use server";
import { AiError, assertAiAllowed, jsonResponse } from "@/lib/ai";
import { audit, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { profileForAi } from "@/lib/jobs/store";
import { notifyCoachee, postToInbox } from "@/lib/coachee-inbox";
import { SENDER_LOCKED, letterFor } from "@/lib/letter/store";
import { EMAIL_FIELDS, EMAIL_MAX, sentences, type StoredEmail } from "@/lib/letter/email";
import { joinContact, normalizeStoredLetter, overridesOf, splitContact, type LetterField, type StoredLetter } from "@/lib/letter/types";

export type LetterInput = { values: Partial<Record<LetterField, string>>; body: string; adText: string; signature: boolean };

/** Speichert nur Abweichungen von den automatischen Werten (siehe overridesOf) */
export async function saveLetter(applicationId: string, input: LetterInput): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { app, coachee, auto } = await letterFor(user, applicationId);
  const body = String(input?.body ?? "").replace(/\r/g, "").slice(0, 8000);
  const letter: StoredLetter = {
    body: body.trim() === auto.body.trim() ? "" : body,
    adText: String(input?.adText ?? "").slice(0, 12000),
    signature: input?.signature !== false,
    fields: overridesOf(auto, input?.values ?? {}),
  };
  if (user.role !== "coach") {
    // Absender bleibt der Coachee selbst; was der Coach dort eingetragen hat, bleibt erhalten
    const before = normalizeStoredLetter((await one<{ letter: unknown }>("SELECT letter FROM applications WHERE coachee_id = $1 AND id = $2", [coachee.id, app.id]))?.letter);
    for (const k of SENDER_LOCKED) {
      delete letter.fields[k];
      if (before?.fields[k] !== undefined) letter.fields[k] = before.fields[k];
    }
  }
  const row = await one<{ updated_at: string }>("UPDATE applications SET letter = $3, updated_at = now() WHERE coachee_id = $1 AND id = $2 RETURNING updated_at", [coachee.id, app.id, JSON.stringify(letter)]);
  if (!row) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  const recent = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'letter_saved' AND detail->>'application' = $2 AND created_at > now() - interval '30 minutes' LIMIT 1", [user.id, app.id]);
  if (!recent) {
    await audit(user.id, "letter_saved", coachee.id, { application: app.id });
    // Coach bereitet ein Anschreiben vor: einmal pro Sitzung in den Posteingang des Coachees, nicht bei jedem Zwischenspeichern
    if (user.role === "coach") {
      const url = await postToInbox(coachee.id, "anschreiben", app.id, user.id);
      await notifyCoachee(coachee.user_id, { title: "Anschreiben für dich", body: "Dein Coach hat ein Anschreiben vorbereitet.", url, tag: `anschreiben-${app.id}` });
    }
  }
  return { ok: true, savedAt: row.updated_at };
}

/** Text wieder auf die automatische Fassung zurücksetzen */
export async function resetLetter(applicationId: string) {
  const user = await requireUser();
  const { app, coachee } = await letterFor(user, applicationId);
  await query("UPDATE applications SET letter = NULL WHERE coachee_id = $1 AND id = $2", [coachee.id, app.id]);
  return { ok: true };
}

/**
 * Brieftext passend zu Stelle und Profil entwerfen. An die KI gehen Titel, Arbeitgeber und Anzeigentext der Stelle
 * sowie das Profil ohne Gesundheitsangaben und ohne interne Einträge, Namen ersetzt (profileForAi).
 * Coachees sehen dabei nirgends das Wort „KI“; ihre Aufrufe zählen zum Monatskontingent.
 */
export async function draftLetterBody(applicationId: string, adText: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { app, coachee } = await letterFor(user, applicationId);
  if (user.role !== "coach" && !coachee.letter_help) return { ok: false, error: "Textvorschläge hat dein Coach für dich noch nicht freigegeben." };
  try {
    await assertAiAllowed(user);
    const profile = await profileForAi(coachee);
    const job = [
      `Stelle: ${app.title}`,
      app.employer && `Arbeitgeber: ${app.employer}`,
      app.location && `Ort: ${app.location}`,
      adText.trim() ? `Text der Stellenanzeige:\n${adText.trim().slice(0, 8000)}` : "Der Text der Stellenanzeige liegt nicht vor.",
    ].filter(Boolean).join("\n");
    const out = await jsonResponse<{ text: string }>({
      coacheeId: coachee.id,
      userId: user.id,
      purpose: "anschreiben",
      schemaName: "anschreiben",
      schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
      maxTokens: 2500,
      instructions: `Du schreibst den Brieftext eines deutschen Bewerbungsanschreibens (DIN 5008) in der Ich-Form, den Arbeitgeber siezt du.

Regeln:
- Nur der Brieftext: keine Anrede, kein Gruß, keine Unterschrift, kein Betreff, keine Anlagen. Der erste Satz beginnt klein, weil er nach der Anrede mit Komma steht.
- Drei bis vier Absätze, zusammen 170 bis 260 Wörter, Absätze durch eine Leerzeile getrennt.
- Einstieg mit Bezug auf Stelle und Arbeitgeber, ohne Floskeln wie „hiermit bewerbe ich mich“.
- Mittelteil: zwei bis drei konkrete Belege aus Lebenslauf und Kompetenzprofil, die zu den Anforderungen der Anzeige passen. Fehlt eine Anforderung im Profil, übergehe sie; behaupte sie nicht.
- Schluss: Wunsch nach einem persönlichen Gespräch, sachlich und freundlich. Gehalt oder Eintrittstermin nur, wenn die Anzeige danach fragt und das Profil es hergibt; sonst weglassen.
- Ehrlich und nicht übertrieben: Nur Angaben, die im Lebenslauf oder Kompetenzprofil belegt sind. Keine erfundenen Tatsachen, Zahlen, Erfolge oder Eigenschaften.
- Keine Superlative und keine Übertreibungen (nicht „perfekt“, „ideal“, „hervorragend“, „bestens“, „außergewöhnlich“, „mit großer Leidenschaft“). Nüchtern-freundlicher Ton, klare, einfache Sprache.
- Namen sind durch [Name] ersetzt. Schreibe [Name] nie in den Text.`,
      input: `${job}\n\n${profile.text || "Zum Profil liegen keine Angaben vor."}`,
    });
    const text = cleanBody(String(out.text ?? ""));
    if (!text) return { ok: false, error: "Es kam kein Text zurück. Bitte noch einmal versuchen." };
    await audit(user.id, "letter_drafted", coachee.id, { application: app.id });
    return { ok: true, text };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Anschreiben entwerfen", e);
    return { ok: false, error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

/**
 * Ansprechperson der Bewerbung (Anrede und Name) direkt aus dem Anschreiben ändern. Schreibt in applications.contact/salutation;
 * was im Kontaktfeld nach dem Namen steht (E-Mail, Telefon), bleibt erhalten. Gibt die neuen automatischen Werte zurück,
 * damit Anschriftfeld und Anrede im Brief und in der Mail nachziehen, sofern sie nicht von Hand geändert wurden.
 */
export async function saveContact(applicationId: string, input: { salutation: string; name: string }): Promise<{ ok: true; contact: string; recipient: string; salutation: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { app, coachee } = await letterFor(user, applicationId);
  const sal = input?.salutation === "frau" || input?.salutation === "herr" ? input.salutation : "";
  const contact = joinContact(String(input?.name ?? "").slice(0, 120), splitContact(app.contact).rest).slice(0, 300);
  const row = await one("UPDATE applications SET contact = $3, salutation = $4, updated_at = now() WHERE coachee_id = $1 AND id = $2 RETURNING id", [coachee.id, app.id, contact, sal]);
  if (!row) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  const recent = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'letter_contact_saved' AND detail->>'application' = $2 AND created_at > now() - interval '30 minutes' LIMIT 1", [user.id, app.id]);
  if (!recent) await audit(user.id, "letter_contact_saved", coachee.id, { application: app.id });
  const { auto } = await letterFor(user, applicationId);
  return { ok: true, contact, recipient: auto.recipient, salutation: auto.salutation };
}

/** E-Mail-Bewerbung speichern. null = automatisch aus dem Anschreiben, damit spätere Änderungen am Brief durchschlagen. */
export async function saveEmail(applicationId: string, input: StoredEmail): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const { app, coachee } = await letterFor(user, applicationId);
  const v = Object.fromEntries(EMAIL_FIELDS.map((k) => [k, typeof input?.[k] === "string" ? input[k]!.replace(/\r/g, "").slice(0, EMAIL_MAX[k]) : null])) as StoredEmail;
  if (v.to !== null) v.to = v.to.replace(/[\n\t]/g, " ").trim();
  if (v.subject !== null) v.subject = v.subject.replace(/[\n\t]/g, " ");
  const row = await one("UPDATE applications SET email_to = $3, email_subject = $4, email_body = $5, updated_at = now() WHERE coachee_id = $1 AND id = $2 RETURNING id", [coachee.id, app.id, v.to, v.subject, v.body]);
  if (!row) return { ok: false, error: "Diese Bewerbung gibt es nicht mehr." };
  const recent = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'letter_email_saved' AND detail->>'application' = $2 AND created_at > now() - interval '30 minutes' LIMIT 1", [user.id, app.id]);
  if (!recent) await audit(user.id, "letter_email_saved", coachee.id, { application: app.id });
  return { ok: true };
}

/**
 * Kurzfassung für die E-Mail vorschlagen. Gleiche Regeln wie draftLetterBody: an die KI gehen nur Stelle, Anzeigentext
 * und das Profil ohne Gesundheitsangaben und interne Einträge, Namen ersetzt. Der Brieftext selbst geht nicht mit,
 * weil dort frei Eingetragenes (auch Gesundheitliches) stehen kann. Coachees sehen nirgends das Wort „KI“.
 */
export async function draftEmailText(applicationId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { app, coachee, stored } = await letterFor(user, applicationId);
  try {
    await assertAiAllowed(user);
    const profile = await profileForAi(coachee);
    const adText = stored?.adText.trim() ?? "";
    const job = [
      `Stelle: ${app.title}`,
      app.employer && `Arbeitgeber: ${app.employer}`,
      app.location && `Ort: ${app.location}`,
      adText ? `Text der Stellenanzeige:\n${adText.slice(0, 6000)}` : "Der Text der Stellenanzeige liegt nicht vor.",
    ].filter(Boolean).join("\n");
    const out = await jsonResponse<{ text: string }>({
      coacheeId: coachee.id,
      userId: user.id,
      purpose: "anschreiben",
      schemaName: "bewerbungsmail",
      schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
      maxTokens: 1000,
      instructions: `Du schreibst den kurzen Text einer deutschen E-Mail-Bewerbung in der Ich-Form, den Arbeitgeber siezt du. Anschreiben, Lebenslauf und Zeugnisse hängen als PDF an.

Regeln:
- Nur der Text: keine Anrede, kein Gruß, keine Unterschrift, kein Betreff. Der erste Satz beginnt klein, weil er nach der Anrede mit Komma steht.
- Drei bis fünf Sätze, zusammen höchstens 90 Wörter, ein einziger Absatz.
- Bezug auf Stelle und Arbeitgeber, ein konkreter Beleg aus dem Profil, Hinweis auf die angehängten Unterlagen, Wunsch nach einem Gespräch.
- Keine Floskeln wie „hiermit bewerbe ich mich“. Ehrlich und nicht übertrieben: nur belegte Angaben aus dem Profil, keine Superlative, keine erfundenen Tatsachen. Nüchtern-freundlich, klare, einfache Sprache.
- Namen sind durch [Name] ersetzt. Schreibe [Name] nie in den Text.`,
      input: `${job}\n\n${profile.text || "Zum Profil liegen keine Angaben vor."}`,
    });
    const text = sentences(cleanBody(String(out.text ?? "")).replace(/\n+/g, " ")).slice(0, 6).join(" ");
    if (!text) return { ok: false, error: "Es kam kein Text zurück. Bitte noch einmal versuchen." };
    await audit(user.id, "letter_email_drafted", coachee.id, { application: app.id });
    return { ok: true, text };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Bewerbungsmail entwerfen", e);
    return { ok: false, error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

/** Anrede und Gruß entfernen, falls doch mitgeliefert, und Platzhalter tilgen */
function cleanBody(text: string) {
  const ls = text.replace(/\r/g, "").replace(/\[Name\]\s*/g, "").trim().split("\n");
  while (ls.length && /^(sehr geehrte|guten tag|hallo)/i.test(ls[0].trim())) ls.shift();
  const end = ls.findIndex((l) => /^(mit freundlichen grüßen|freundliche grüße|viele grüße)/i.test(l.trim()));
  return (end >= 0 ? ls.slice(0, end) : ls).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
