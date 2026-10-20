"use server";
import { revalidatePath } from "next/cache";
import { coacheeFor, fullName, type Coachee } from "@/lib/access";
import { AiError, assertAiAllowed, jsonResponse, pseudonymize } from "@/lib/ai";
import { audit, requireCoach, requireUser, type User } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { DOC_TYPES, MAX_DOC_BYTES, extOf } from "@/lib/documents";
import { PARSER_VERSION, extractDocumentText } from "@/lib/documents-text";
import { loadFile, storeFile } from "@/lib/files";
import { applyFinanceXlsx, applyPlanDocx, documentFile, importTarget, type ImportResult } from "@/lib/bp/apply-import";
import { financeSummary, normalizeFinance, type FinanceInput } from "@/lib/bp/finance";
import { SECTIONS, normalizeGlance, normalizeSections, sourceList, type GlanceItem } from "@/lib/bp/sections";
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

export type SectionSave = { ok: true; version: number; savedAt: string } | { ok: false; error: string; conflict?: { text: string; sources: string; version: number; by: string | null } };

export async function saveSection(coacheeId: string, key: string, baseVersion: number, text: string, sources: string): Promise<SectionSave> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  if (!SECTIONS.some((s) => s.key === key)) return { ok: false, error: "Unbekanntes Kapitel." };
  const body = String(text ?? "").slice(0, 60000);
  const src = String(sources ?? "").slice(0, 8000);
  // Speichern nur, wenn niemand anderes inzwischen geändert hat (eigene schnelle Folgespeicherungen sind erlaubt)
  const row = await one<{ version: number; saved_at: string }>(
    `UPDATE business_plans
        SET sections = jsonb_set(sections, ARRAY[$2::text], jsonb_build_object('text', $3::text, 'sources', $6::text, 'version', COALESCE((sections->($2::text)->>'version')::int, 0) + 1, 'updated_at', now(), 'updated_by', $4::text)),
            updated_at = now()
      WHERE coachee_id = $1 AND (COALESCE((sections->($2::text)->>'version')::int, 0) = $5 OR sections->($2::text)->>'updated_by' = $4::text)
      RETURNING (sections->($2::text)->>'version')::int AS version, sections->($2::text)->>'updated_at' AS saved_at`,
    [c.id, key, body, user.id, baseVersion, src],
  );
  if (!row) {
    const now = await one<{ sections: unknown }>("SELECT sections FROM business_plans WHERE coachee_id = $1", [c.id]);
    const s = normalizeSections(now?.sections)[key];
    const by = s.updated_by ? await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [s.updated_by]) : null;
    return { ok: false, error: "Jemand anderes hat dieses Kapitel gerade geändert.", conflict: { text: s.text, sources: s.sources, version: s.version, by: by?.name ?? null } };
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

/** „Auf einen Blick“: Liste aus Bezeichnung und Angabe, wird als Ganzes gespeichert */
export async function saveGlance(coacheeId: string, glance: GlanceItem[]) {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [c.id, JSON.stringify(normalizeGlance(glance))]);
  await auditThrottled(user, "bp_saved", c.id, { section: "blick" });
  return { ok: true as const };
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sources"],
  properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
};

/** Entwurf für ein Kapitel aus den Bausteinen der Gespräche, den Zahlen und den übrigen Kapiteln (nur für den Coach). */
export async function draftSection(coacheeId: string, key: string): Promise<{ text?: string; sources?: string; error?: string }> {
  const user = await requireUser();
  const c = await gruendungCoachee(user, coacheeId);
  const def = SECTIONS.find((s) => s.key === key);
  if (!def) return { error: "Unbekanntes Kapitel." };
  try {
    await assertAiAllowed(user, { coachOnly: true });
    const input = await draftContext(user, c, key);
    const number = SECTIONS.indexOf(def) + 1;
    const out = await jsonResponse<{ text: string; sources: string[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "businessplan",
      schemaName: "kapitel",
      schema: DRAFT_SCHEMA,
      maxTokens: 6000,
      instructions: `Du schreibst Kapitel ${number} „${def.title}“ eines Businessplans für eine Gründung in Deutschland. Der Plan wird bei der fachkundigen Stelle (Gründungszuschuss der Agentur für Arbeit) und bei Banken eingereicht und folgt der Vorlage des Gründungscoachs.

Stil der Vorlage:
- Sachlich und nüchtern in der dritten Person: „[Name] plant …“, „Der Gründer verfügt …“, „Das Unternehmen richtet sich …“. Keine Ich-Form, keine Werbesprache, keine Superlative.
- Zusammenhängende Absätze mit jeweils zwei bis vier Sätzen, getrennt durch eine Leerzeile. Konkrete Angaben statt allgemeiner Aussagen.
- Bei längeren Kapiteln Zwischenüberschriften als eigene Zeile mit „### “. Aufzählungen mit „- “ nur, wo sie wirklich helfen. Eine Tabelle im Markdown-Format (| Spalte | Spalte |) nur, wenn sie etwas übersichtlicher macht, z. B. Mitbewerber oder Kundengruppen.
- Umfang etwa ${def.words[0]} bis ${def.words[1]} Wörter. Keine Kapitelüberschrift, keine Vorrede, kein Fazit-Absatz mit Floskeln.

Inhalt:
- Beantworte diese Leitfragen: ${def.questions.join(" ")}
- Nutze nur Fakten aus dem Material. Erfinde keine Zahlen, Namen, Kunden, Statistiken oder Abschlüsse. Wo etwas fehlt, setze einen kurzen Platzhalter in eckigen Klammern, z. B. [Anzahl Betriebe der Branche im Landkreis mit Quelle].
- Zahlen aus dem Finanzplan übernimmst du genau so, wie sie im Material stehen.
- Namen sind durch [Name] ersetzt. Schreib [Name], wo der Name der gründenden Person nötig ist.
- Wenn es schon einen Text gibt, verbessere und ergänze ihn und behalte seine Aussagen, Zahlen und Quellen.

Quellen:
- Gib im Feld sources die Quellen für die Fakten im Kapitel an, eine pro Eintrag, z. B. „Handwerkskammer Wiesbaden (2026): Schriftliche Auskunft …“ oder eine Statistik mit Link.
- Nur Quellen, die wörtlich im Material stehen (bisherige Quellen des Kapitels, genannte Auskünfte, Lebenslauf, Unterlagen). Erfinde niemals Quellen oder Links. Hast du keine belegbare Quelle, gib eine leere Liste zurück.

Gib den fertigen Kapiteltext im Feld text zurück.`,
      input,
    });
    await audit(user.id, "bp_draft", c.id, { section: key });
    const name = fullName(c);
    return { text: out.text.replaceAll("[Name]", name).trim(), sources: out.sources.map((s) => s.replaceAll("[Name]", name).trim()).filter(Boolean).join("\n") };
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-Entwurf", e);
    return { error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." };
  }
}

async function draftContext(user: User, c: Coachee, key: string) {
  const coach = user.role === "coach";
  const def = SECTIONS.find((s) => s.key === key)!;
  const all = key === "summary";
  const plan = await planFor(c);
  const [items, cv] = await Promise.all([
    // Gesundheitsangaben gehen nie an die KI
    query<{ category: string; title: string; detail: string }>(
      "SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' AND (NOT internal OR $2) AND ($3 OR category = ANY($4)) ORDER BY category, created_at",
      [c.id, coach, all, def.from],
    ),
    key === "gruender" || all ? one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]) : null,
  ]);

  const lines: string[] = [];
  if (plan.title || c.goal) lines.push(`Vorhaben: ${plan.title || c.goal}`);
  const glance = plan.glance.filter((g) => g.value.trim());
  if (glance.length) {
    lines.push("\nAuf einen Blick:");
    for (const g of glance) lines.push(`- ${g.label}: ${g.value.replace(/\n/g, ", ")}`);
  }
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
  if (def.finance || ["marketing", "organisation", "standort", "risiken"].includes(key)) lines.push("\n" + financeSummary(plan.finance));

  const others = SECTIONS.filter((s) => s.key !== key && plan.sections[s.key].text.trim());
  if (others.length) {
    lines.push("\nBereits geschriebene Kapitel:");
    for (const s of others) lines.push(`## ${s.title}\n${plan.sections[s.key].text.slice(0, all ? 2500 : 600)}`);
  }
  const current = plan.sections[key];
  lines.push(current.text.trim() ? `\nBisheriger Text dieses Kapitels:\n${current.text.trim()}` : "\nDieses Kapitel ist noch leer.");
  const src = sourceList(current.sources);
  if (src.length) lines.push(`\nBisherige Quellen dieses Kapitels:\n${src.map((s) => `- ${s}`).join("\n")}`);
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

// ---------- Übernahme aus Word und Excel (nur Coach) ----------

/** Datei im Businessplan- oder Finanzplan-Bereich hochladen: wird unter Dokumente abgelegt und übernommen. */
export async function importPlanFile(coacheeId: string, fd: FormData): Promise<ImportResult> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei ausgewählt." };
  const ext = extOf(file.name);
  if (ext !== "docx" && ext !== "xlsx") return { ok: false, error: "Bitte eine Word-Datei (.docx) für den Businessplan oder eine Excel-Datei (.xlsx) für den Finanzplan wählen." };
  if (file.size > MAX_DOC_BYTES) return { ok: false, error: "Die Datei ist größer als 25 MB." };
  const data = Buffer.from(await file.arrayBuffer());
  const category = ext === "docx" ? "businessplan" : "finanzplan";
  // erst prüfen, ob die Datei passt, dann ablegen
  const result = ext === "docx" ? await applyPlanDocx(coach, c, data, { document: null, name: file.name }) : await applyFinanceXlsx(coach, c, data, { document: null, name: file.name });
  if (!result.ok) return result;
  const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: file.name, mime: DOC_TYPES[ext], data, userId: coach.id });
  const plain = await extractDocumentText(file.name, data);
  const doc = await one<{ id: string }>(
    "INSERT INTO documents (coachee_id, file_id, category, title, extracted_text, created_by, parser_version) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [c.id, fileId, category, file.name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim().slice(0, 200) || file.name, plain || null, coach.id, PARSER_VERSION],
  );
  await query(`UPDATE business_plans SET imports = jsonb_set(imports, ARRAY[$2::text, 'document'], to_jsonb($3::text)) WHERE coachee_id = $1 AND imports ? $2`, [c.id, ext === "docx" ? "plan" : "finance", doc!.id]);
  revalidatePath(`/coach/coachees/${c.id}`);
  return { ...result, message: `${result.message} Die Datei liegt unter Dokumente.` };
}

/** Ein unter Dokumente abgelegtes Word- oder Excel-Dokument übernehmen */
export async function importDocument(coacheeId: string, docId: string): Promise<ImportResult> {
  const coach = await requireCoach();
  const c = await gruendungCoachee(coach, coacheeId);
  const doc = await documentFile(c.id, coach.id, docId);
  if (!doc) return { ok: false, error: "Dokument nicht gefunden." };
  const target = importTarget(doc.category, doc.name);
  if (!target) return { ok: false, error: "Übernehmen geht nur mit einem Businessplan als .docx oder einem Finanzplan als .xlsx." };
  const data = await loadFile(doc.file_id);
  const result = target === "plan" ? await applyPlanDocx(coach, c, data, { document: doc.id, name: doc.name }) : await applyFinanceXlsx(coach, c, data, { document: doc.id, name: doc.name });
  revalidatePath(`/coach/coachees/${c.id}`);
  return result;
}
