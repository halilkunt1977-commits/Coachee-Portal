"use server";
import { createHash } from "node:crypto";
import { ownCoachee } from "@/lib/access";
import { AiError, aiEnabled, jsonResponse, pseudonymize } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

/*
 * Türkische Fassung von Anschreiben und E-Mail-Bewerbung für Coachees mit türkischer Oberfläche. Der Brief an den
 * Arbeitgeber bleibt deutsch; die Übersetzung steht nur zum Verstehen darunter. Jeder Text wird einmal übersetzt
 * und gespeichert, ein geänderter Text wird neu übersetzt. Ohne Freigabe nutzbar, zählt nicht zur Monatsgrenze.
 */

const MAX = 12000;
const SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false };
const INSTRUCTIONS = `Übersetze diesen deutschen Bewerbungstext (Anschreiben oder E-Mail an einen Arbeitgeber in Deutschland) ins Türkische, damit ein türkischsprachiger Bewerber genau versteht, was er schickt.
- Natürliches, gut verständliches Türkisch, Absätze und Zeilenumbrüche wie im Original.
- Höflichkeitsform wie im Original (an den Arbeitgeber: „siz“).
- Deutsche Begriffe, die man so kennt, bleiben deutsch: Jobcenter, Arbeitsagentur, Ausbildung, Probezeit, Firmen-, Orts- und Berufsnamen. Bei Berufsbezeichnungen darf in Klammern die türkische Bedeutung stehen.
- Nichts weglassen, nichts hinzufügen, nichts verbessern. Platzhalter wie [Vorname] und [Nachname] unverändert lassen.`;

const hashOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export async function textTurkish(text: string): Promise<{ ok: true; tr: string } | { ok: false; error: string }> {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c || c.language !== "tr") return { ok: false, error: "Diese Hilfe gibt es nur mit türkischer Ansicht." };
  const src = String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX);
  if (!src) return { ok: false, error: "Noch kein Text da." };
  const hash = hashOf(src);
  const hit = await one<{ tr: string }>("SELECT tr FROM text_tr WHERE coachee_id = $1 AND hash = $2", [c.id, hash]);
  if (hit) return { ok: true, tr: hit.tr };
  if (!aiEnabled()) return { ok: false, error: "Das geht gerade nicht. Bitte später noch einmal versuchen." };
  try {
    const r = await jsonResponse<{ text: string }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "text_tr",
      instructions: INSTRUCTIONS,
      input: pseudonymize(pseudonymize(src, [c.last_name]).replace(/\[Name\]/g, "[Nachname]"), [c.first_name]).replace(/\[Name\]/g, "[Vorname]"),
      schemaName: "text_tr",
      schema: SCHEMA,
      maxTokens: 6000,
    });
    // Namen nur für den Coachee selbst wieder einsetzen, an die KI gehen sie nicht
    const tr = String(r?.text ?? "").trim().replace(/\[Nachname\]/g, c.last_name).replace(/\[Vorname\]/g, c.first_name);
    if (!tr) return { ok: false, error: "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
    await query("INSERT INTO text_tr (coachee_id, hash, tr) VALUES ($1,$2,$3) ON CONFLICT (coachee_id, hash) DO UPDATE SET tr = EXCLUDED.tr, created_at = now()", [c.id, hash, tr]);
    return { ok: true, tr };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("[ai] text türkisch", e instanceof Error ? e.message : e);
    return { ok: false, error: "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}
