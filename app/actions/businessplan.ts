"use server";
import { coacheeFor, type Coachee } from "@/lib/access";
import { AiError, assertAiAllowed, jsonResponse, pseudonymize } from "@/lib/ai";
import { audit, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { financeSummary, normalizeFinance, type FinanceInput } from "@/lib/bp/finance";
import { SECTIONS, normalizeSections } from "@/lib/bp/sections";
import { financeFromItems, financeItems, planFor } from "@/lib/bp/store";
import { normalizeCv } from "@/lib/cv/types";
import { categoryLabel } from "@/lib/profile";

async function gruendungCoachee(user: User, coacheeId: string) {
  const c = await coacheeFor(user, coacheeId);
  if (c.coaching_type !== "gruendung") throw new Error("Businessplan gibt es nur im Gründungscoaching.");
  await planFor(c);
  return c;
}

/** Ins Protokoll höchstens alle 30 Minuten, nicht bei jedem automatischen Speichern */
async function auditThrottled(user: User, action: string, coacheeId: string, detail: Record<string, string> = {}) {
  const recent = await one(
    "SELECT 1 FROM audit_log WHERE user_id = $1 AND action = $2 AND coachee_id = $3 AND detail @> $4 AND created_at > now() - interval '30 minutes' LIMIT 1",
    [user.id, action, coacheeId, JSON.stringify(detail)],
  );
  if (!recent) await audit(user.id, action, coacheeId, detail);
}

// ---------- Businessplan-Texte ----------

export type SectionSave = { ok: true; version: number; savedAt: string } | { ok: false; error: string; conflict?: { text: string; version: number; by: string | null } };

export async function saveSection(coacheeId: string, key: string, baseVersion: number, text: string): Promise<SectionSave> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  if (!SECTIONS.some((s) => s.key === key)) return { ok: false, error: "Unbekannter Abschnitt." };
  const body = String(text ?? "").slice(0, 20000);
  // Speichern nur, wenn niemand anderes inzwischen geändert hat (eigene schnelle Folgespeicherungen sind erlaubt)
  const row = await one<{ version: number; saved_at: string }>(
    `UPDATE business_plans
        SET sections = jsonb_set(sections, ARRAY[$2::text], jsonb_build_object('text', $3::text, 'version', COALESCE((sections->($2::text)->>'version')::int, 0) + 1, 'updated_at', now(), 'updated_by', $4::text)),
            updated_at = now()
      WHERE coachee_id = $1 AND (COALESCE((sections->($2::text)->>'version')::int, 0) = $5 OR sections->($2::text)->>'updated_by' = $4::text)
      RETURNING (sections->($2::text)->>'version')::int AS version, sections->($2::text)->>'updated_at' AS saved_at`,
    [c.id, key, body, user.id, baseVersion],
  );
  if (!row) {
    const now = await one<{ sections: unknown }>("SELECT sections FROM business_plans WHERE coachee_id = $1", [c.id]);
    const s = normalizeSections(now?.sections)[key];
    const by = s.updated_by ? await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [s.updated_by]) : null;
    return { ok: false, error: "Jemand anderes hat diesen Abschnitt gerade geändert.", conflict: { text: s.text, version: s.version, by: by?.name ?? null } };
  }
  await auditThrottled(user, "bp_saved", c.id, { section: key });
  return { ok: true, version: row.version, savedAt: row.saved_at };
}

export async function saveTitle(coacheeId: string, title: string) {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  await query("UPDATE business_plans SET title = $2, updated_at = now() WHERE coachee_id = $1", [c.id, String(title ?? "").trim().slice(0, 120)]);
  return { ok: true };
}

const DRAFT_SCHEMA = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };

/** KI-Entwurf für einen Abschnitt aus den Bausteinen der Gespräche, den Zahlen und den übrigen Abschnitten. */
export async function draftSection(coacheeId: string, key: string): Promise<{ text?: string; error?: string }> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const def = SECTIONS.find((s) => s.key === key);
  if (!def) return { error: "Unbekannter Abschnitt." };
  try {
    await assertAiAllowed(user);
    const input = await draftContext(user, c, key);
    const out = await jsonResponse<{ text: string }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "businessplan",
      schemaName: "abschnitt",
      schema: DRAFT_SCHEMA,
      maxTokens: 3000,
      instructions: `Du schreibst den Abschnitt „${def.title}“ eines Businessplans für eine Gründung in Deutschland. Der Plan wird bei der fachkundigen Stelle (Gründungszuschuss der Agentur für Arbeit) und bei Banken eingereicht.

Regeln:
- Schreib in der Ich-Form der gründenden Person, sachlich, konkret und überzeugend, ohne Werbesprache.
- Beantworte diese Leitfragen: ${def.questions.join(" ")}
- Nutze nur die Fakten aus dem Material. Erfinde keine Zahlen, Namen, Kunden oder Abschlüsse. Wo etwas fehlt, setze einen kurzen Platzhalter in eckigen Klammern, z. B. [Anzahl Mitbewerber im Umkreis].
- Zahlen aus dem Finanzplan übernimmst du genau so, wie sie im Material stehen.
- Namen sind durch [Name] ersetzt. Schreib [Name], wo ein Name nötig ist.
- Wenn es schon einen Text gibt, verbessere und ergänze ihn und behalte seine Aussagen.
- Umfang ${key === "zusammenfassung" ? "200 bis 350" : "150 bis 400"} Wörter. Kurze Absätze, bei Aufzählungen Zeilen mit „- “, **fett** sparsam. Keine Überschrift, keine Vorrede.
- Gib nur den fertigen Abschnitt im Feld text zurück.`,
      input,
    });
    await audit(user.id, "bp_draft", c.id, { section: key });
    return { text: out.text.replaceAll("[Name]", c.first_name).trim() };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-Entwurf", e);
    return { error: e instanceof AiError ? e.message : "Die KI hat gerade nicht geantwortet. Bitte gleich noch einmal versuchen." };
  }
}

async function draftContext(user: User, c: Coachee, key: string) {
  const coach = user.role === "coach";
  const def = SECTIONS.find((s) => s.key === key)!;
  const all = key === "zusammenfassung";
  const plan = await planFor(c);
  const [items, cv] = await Promise.all([
    query<{ category: string; title: string; detail: string }>(
      "SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' AND (NOT internal OR $2) AND ($3 OR category = ANY($4)) ORDER BY category, created_at",
      [c.id, coach, all, def.from],
    ),
    key === "gruender" ? one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]) : null,
  ]);

  const lines: string[] = [];
  if (plan.title || c.goal) lines.push(`Vorhaben: ${plan.title || c.goal}`);
  if (items.length) {
    lines.push("\nBausteine aus den Coaching-Gesprächen:");
    for (const i of items) lines.push(`- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`);
  }
  if (cv) {
    const d = normalizeCv(cv.data);
    lines.push("\nLebenslauf:");
    if (d.personal.headline) lines.push(`Beruf: ${d.personal.headline}`);
    for (const e of d.experience) lines.push(`- ${e.start || "?"} bis ${e.current ? "heute" : e.end || "?"}: ${e.title}, ${e.company}${e.bullets ? ` – ${e.bullets.replace(/\n/g, "; ")}` : ""}`);
    for (const e of d.education) lines.push(`- Ausbildung: ${e.degree}, ${e.school} (${e.end || e.start})`);
    for (const e of d.certificates) lines.push(`- Zertifikat: ${e.name}${e.year ? ` (${e.year})` : ""}`);
  }
  if (["zusammenfassung", "preise", "standort", "marketing", "organisation", "chancen"].includes(key)) lines.push("\n" + financeSummary(plan.finance));

  const others = SECTIONS.filter((s) => s.key !== key && plan.sections[s.key].text.trim());
  if (others.length) {
    lines.push("\nBereits geschriebene Abschnitte:");
    for (const s of others) lines.push(`## ${s.title}\n${plan.sections[s.key].text.slice(0, all ? 2500 : 500)}`);
  }
  const current = plan.sections[key].text.trim();
  lines.push(current ? `\nBisheriger Text dieses Abschnitts:\n${current}` : "\nDieser Abschnitt ist noch leer.");
  return pseudonymize(lines.join("\n"), [c.first_name, c.last_name]);
}

// ---------- Finanzplan ----------

export type FinanceSave = { ok: true; version: number } | { ok: false; error: string; conflict?: { by: string | null; version: number } };

export async function saveFinance(coacheeId: string, baseVersion: number, raw: unknown): Promise<FinanceSave> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const f = normalizeFinance(raw);
  const row = await one<{ finance_version: number }>(
    `UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3, updated_at = now()
      WHERE coachee_id = $1 AND (finance_version = $4 OR finance_updated_by = $3) RETURNING finance_version`,
    [c.id, JSON.stringify(f), user.id, baseVersion],
  );
  if (!row) {
    const now = await one<{ name: string | null; finance_version: number }>("SELECT u.name, bp.finance_version FROM business_plans bp LEFT JOIN users u ON u.id = bp.finance_updated_by WHERE bp.coachee_id = $1", [c.id]);
    return { ok: false, error: "Jemand anderes hat den Finanzplan gerade geändert.", conflict: { by: now?.name ?? null, version: now?.finance_version ?? 0 } };
  }
  await auditThrottled(user, "finance_saved", c.id);
  return { ok: true, version: row.finance_version };
}

/** Zahlen aus den Gesprächen (Reiter „Zahlen“) neu in den Finanzplan übernehmen. Ersetzt die bisherigen Eingaben. */
export async function importFinanceItems(coacheeId: string): Promise<{ ok: true; finance: FinanceInput; version: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const items = await financeItems(c.id);
  if (!items.length) return { ok: false, error: "Es gibt noch keine Zahlen aus den Gesprächen." };
  const current = await one<{ finance: unknown }>("SELECT finance FROM business_plans WHERE coachee_id = $1", [c.id]);
  const f = { ...financeFromItems(items), start: normalizeFinance(current?.finance).start };
  const row = await one<{ finance_version: number }>(
    "UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3, updated_at = now() WHERE coachee_id = $1 RETURNING finance_version",
    [c.id, JSON.stringify(f), user.id],
  );
  await audit(user.id, "finance_imported", c.id, { items: String(items.length) });
  return { ok: true, finance: f, version: row!.finance_version };
}
