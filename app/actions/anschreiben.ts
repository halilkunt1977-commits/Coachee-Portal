"use server";
import { AiError, assertAiAllowed, jsonResponse } from "@/lib/ai";
import { audit, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { profileForAi } from "@/lib/jobs/store";
import { notifyCoachee, postToInbox } from "@/lib/coachee-inbox";
import { SENDER_LOCKED, letterFor } from "@/lib/letter/store";
import { normalizeStoredLetter, overridesOf, type LetterField, type StoredLetter } from "@/lib/letter/types";

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
- Mittelteil: zwei bis drei konkrete Belege aus Lebenslauf und Kompetenzprofil, die zu den Anforderungen der Anzeige passen.
- Schluss: Wunsch nach einem persönlichen Gespräch, sachlich und freundlich. Gehalt oder Eintrittstermin nur, wenn die Anzeige danach fragt und das Profil es hergibt; sonst weglassen.
- Erfinde keine Tatsachen. Was nicht im Profil steht, nicht behaupten. Klare, einfache Sprache.
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

/** Anrede und Gruß entfernen, falls doch mitgeliefert, und Platzhalter tilgen */
function cleanBody(text: string) {
  const ls = text.replace(/\r/g, "").replace(/\[Name\]\s*/g, "").trim().split("\n");
  while (ls.length && /^(sehr geehrte|guten tag|hallo)/i.test(ls[0].trim())) ls.shift();
  const end = ls.findIndex((l) => /^(mit freundlichen grüßen|freundliche grüße|viele grüße)/i.test(l.trim()));
  return (end >= 0 ? ls.slice(0, end) : ls).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
