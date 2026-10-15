"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coacheeFor } from "@/lib/access";
import { AiError, aiEnabled, jsonResponse, pseudonymize } from "@/lib/ai";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { numberOrNull, text, type FormState } from "@/lib/forms";
import { FINANCE_SECTIONS, PERIOD_LABEL, categoriesFor, type FinanceItem, type ProfileItem } from "@/lib/profile";

const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/mein-bereich");
};

// ---------- Einträge von Hand ----------

function readProfile(fd: FormData, type: "job" | "gruendung") {
  const cats = categoriesFor(type);
  const category = cats.find((c) => c.key === text(fd, "category", 40)) ?? cats[0];
  const level = numberOrNull(fd, "level");
  return {
    category: category.key,
    title: text(fd, "title", 300),
    detail: text(fd, "detail", 5000),
    evidence: text(fd, "evidence", 2000),
    level: category.leveled && level && level >= 1 && level <= 5 ? Math.round(level) : null,
    internal: Boolean(category.internal) || fd.get("internal") === "on",
  };
}

export async function saveProfileItem(coacheeId: string, itemId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const p = readProfile(fd, c.coaching_type);
  if (!p.title) return { error: "Bitte einen kurzen Titel eingeben." };
  if (p.category === "gesundheit" && !c.consent_special_at) return { error: "Für Gesundheitsthemen fehlt die Einwilligung des Coachees." };
  if (itemId) {
    await query("UPDATE profile_items SET category=$3, title=$4, detail=$5, evidence=$6, level=$7, internal=$8, updated_at=now() WHERE id=$1 AND coachee_id=$2", [itemId, coacheeId, p.category, p.title, p.detail, p.evidence, p.level, p.internal]);
  } else {
    await query("INSERT INTO profile_items (coachee_id, category, title, detail, evidence, level, internal, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [coacheeId, p.category, p.title, p.detail, p.evidence, p.level, p.internal, coach.id]);
  }
  await audit(coach.id, itemId ? "profile_updated" : "profile_created", coacheeId);
  refresh(coacheeId);
  return { ok: "Gespeichert." };
}

export async function deleteProfileItem(coacheeId: string, itemId: string) {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  await query("DELETE FROM profile_items WHERE id = $1 AND coachee_id = $2", [itemId, coacheeId]);
  await audit(coach.id, "profile_deleted", coacheeId);
  refresh(coacheeId);
}

function readFinance(fd: FormData) {
  const sectionRaw = text(fd, "section", 30);
  const periodRaw = text(fd, "period", 20);
  return {
    section: FINANCE_SECTIONS.some((s) => s.key === sectionRaw) ? sectionRaw : "kosten",
    label: text(fd, "label", 300),
    amount: numberOrNull(fd, "amount"),
    period: periodRaw in PERIOD_LABEL ? periodRaw : "monatlich",
    note: text(fd, "note", 2000),
  };
}

export async function saveFinanceItem(coacheeId: string, itemId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  const f = readFinance(fd);
  if (!f.label) return { error: "Bitte eine Bezeichnung eingeben, z. B. „Miete Büro“." };
  if (f.amount === null) return { error: "Bitte einen Betrag in Euro eingeben." };
  if (itemId) {
    await query("UPDATE finance_items SET section=$3, label=$4, amount=$5, period=$6, note=$7, updated_at=now() WHERE id=$1 AND coachee_id=$2", [itemId, coacheeId, f.section, f.label, f.amount, f.period, f.note]);
  } else {
    await query("INSERT INTO finance_items (coachee_id, section, label, amount, period, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [coacheeId, f.section, f.label, f.amount, f.period, f.note, coach.id]);
  }
  await audit(coach.id, itemId ? "finance_updated" : "finance_created", coacheeId);
  refresh(coacheeId);
  return { ok: "Gespeichert." };
}

export async function deleteFinanceItem(coacheeId: string, itemId: string) {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  await query("DELETE FROM finance_items WHERE id = $1 AND coachee_id = $2", [itemId, coacheeId]);
  await audit(coach.id, "finance_deleted", coacheeId);
  refresh(coacheeId);
}

// ---------- KI wertet ein Gespräch aus ----------

type Analysis = {
  profile: { category: string; title: string; detail: string; evidence: string; level: number | null; sensitive: boolean }[];
  finance: { section: string; label: string; amount: number; period: string; note: string }[];
  questions: string[];
};

function analysisSchema(type: "job" | "gruendung") {
  const str = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["profile", "finance", "questions"],
    properties: {
      profile: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "title", "detail", "evidence", "level", "sensitive"],
          properties: {
            category: { type: "string", enum: categoriesFor(type).map((c) => c.key) },
            title: str,
            detail: str,
            evidence: str,
            level: { type: ["integer", "null"] },
            sensitive: { type: "boolean" },
          },
        },
      },
      finance: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["section", "label", "amount", "period", "note"],
          properties: {
            section: { type: "string", enum: FINANCE_SECTIONS.map((s) => s.key) },
            label: str,
            amount: { type: "number" },
            period: { type: "string", enum: Object.keys(PERIOD_LABEL) },
            note: str,
          },
        },
      },
      questions: { type: "array", items: str },
    },
  };
}

function instructions(type: "job" | "gruendung") {
  const cats = categoriesFor(type).map((c) => `- ${c.key}: ${c.label} (${c.hint})`).join("\n");
  const common = `Du hilfst einem erfahrenen Coach, Gesprächsnotizen auszuwerten. Antworte auf Deutsch.
Lies die Notizen und schlage Einträge für den Wissensspeicher des Coachees vor. Der Coach prüft jeden Vorschlag einzeln.
Regeln:
- Nur was in den Notizen steht oder sich klar daraus ergibt. Nichts erfinden, nicht übertreiben.
- Ein Eintrag = eine Aussage. Titel kurz (2 bis 6 Wörter), detail ein bis zwei Sätze, evidence die Fundstelle aus den Notizen in eigenen Worten.
- Keine Dopplungen mit den schon vorhandenen Einträgen. Wenn sich etwas geändert hat, schlage den neuen Stand vor und schreibe das ins detail.
- Gesundheit, Behinderung, psychische Themen, Schulden, Familienkonflikte: sensitive = true.
- questions: 2 bis 5 konkrete Fragen fürs nächste Gespräch, die Lücken schließen.`;
  if (type === "job") {
    return `${common}
- Es ist ein Jobcoaching. Ermittle Kompetenzen, Stärken, Erfahrungen, Wünsche und Rahmenbedingungen. Achte besonders auf verdeckte Kompetenzen aus Ehrenamt, Familie, Hobbys.
- level (1 bis 5) nur bei Kompetenzen, wenn die Notizen eine Einschätzung erlauben, sonst null.
- finance bleibt leer.
Kategorien:
${cats}`;
  }
  return `${common}
- Es ist ein Gründungscoaching. Ordne Aussagen den Businessplan-Kapiteln zu.
- Alle Geldbeträge gehören zusätzlich als finance-Eintrag dazu: Anschaffungen = kapitalbedarf (einmalig), Eigenkapital/Kredit/Zuschuss = finanzierung, Miete/Versicherung/Fahrzeug = kosten, Preis mal Menge = umsatz (monatlich, Rechnung in note), Lebenshaltung = privat. Beträge in Euro, keine Spannen (bei Spanne den Mittelwert und die Spanne in note).
- level ist immer null.
Kategorien:
${cats}`;
}

export async function analyzeMeeting(coacheeId: string, meetingId: string): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  if (!aiEnabled()) return { error: "Die KI ist noch nicht eingerichtet. Trage OPENAI_API_KEY in Coolify ein." };
  const meeting = await one<{ title: string; held_on: string; notes: string; results: string; next_steps: string }>("SELECT title, held_on, notes, results, next_steps FROM meetings WHERE id = $1 AND coachee_id = $2", [meetingId, coacheeId]);
  if (!meeting) return { error: "Gespräch nicht gefunden." };
  if (meeting.notes.trim().length < 20) return { error: "Die Notizen sind zu kurz für eine Auswertung." };

  const [items, finance] = await Promise.all([
    query<ProfileItem>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1", [coacheeId]),
    query<FinanceItem>("SELECT section, label, amount, period FROM finance_items WHERE coachee_id = $1", [coacheeId]),
  ]);
  const names = [c.first_name, c.last_name];
  const known = [
    ...items.map((i) => `- [${i.category}] ${i.title}: ${i.detail}`),
    ...finance.map((f) => `- [finanz/${f.section}] ${f.label}: ${f.amount} € ${f.period}`),
  ].join("\n");
  const input = pseudonymize(
    `Ziel des Coachings: ${c.goal ?? "nicht angegeben"}

Schon im Wissensspeicher:
${known || "(noch nichts)"}

Gespräch „${meeting.title}“ vom ${meeting.held_on}
Notizen:
${meeting.notes}

Ergebnisse:
${meeting.results || "-"}

Nächste Schritte:
${meeting.next_steps || "-"}`,
    names,
  );

  let result: Analysis;
  try {
    result = await jsonResponse<Analysis>({ coacheeId, userId: coach.id, purpose: "meeting_analysis", instructions: instructions(c.coaching_type), input, schemaName: "auswertung", schema: analysisSchema(c.coaching_type) });
  } catch (error) {
    console.error("[ai] analyze", error);
    return { error: error instanceof AiError ? error.message : "Die KI ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen." };
  }

  await query("DELETE FROM ai_suggestions WHERE meeting_id = $1 AND status = 'offen'", [meetingId]);
  for (const p of result.profile) {
    const category = p.sensitive && c.coaching_type === "job" ? "gesundheit" : p.category;
    await query("INSERT INTO ai_suggestions (coachee_id, meeting_id, target, payload) VALUES ($1,$2,'profile',$3)", [coacheeId, meetingId, { ...p, category }]);
  }
  for (const f of result.finance) {
    await query("INSERT INTO ai_suggestions (coachee_id, meeting_id, target, payload) VALUES ($1,$2,'finance',$3)", [coacheeId, meetingId, f]);
  }
  await query("UPDATE meetings SET ai_questions = $2, analyzed_at = now() WHERE id = $1", [meetingId, JSON.stringify(result.questions.slice(0, 6))]);
  await audit(coach.id, "meeting_analyzed", coacheeId, { meetingId, profile: result.profile.length, finance: result.finance.length });
  refresh(coacheeId);
  redirect(`/coach/coachees/${coacheeId}?tab=wissen&neu=${result.profile.length + result.finance.length}`);
}

export async function acceptSuggestion(coacheeId: string, suggestionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const c = await coacheeFor(coach, coacheeId);
  const s = await one<{ target: "profile" | "finance"; meeting_id: string | null }>("SELECT target, meeting_id FROM ai_suggestions WHERE id = $1 AND coachee_id = $2 AND status = 'offen'", [suggestionId, coacheeId]);
  if (!s) return { error: "Dieser Vorschlag ist schon erledigt." };
  if (s.target === "profile") {
    const p = readProfile(fd, c.coaching_type);
    if (!p.title) return { error: "Bitte einen Titel eingeben." };
    if (p.category === "gesundheit" && !c.consent_special_at) return { error: "Für Gesundheitsthemen fehlt die Einwilligung des Coachees. Bitte verwerfen." };
    await query("INSERT INTO profile_items (coachee_id, category, title, detail, evidence, level, internal, source_meeting_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [coacheeId, p.category, p.title, p.detail, p.evidence, p.level, p.internal, s.meeting_id, coach.id]);
  } else {
    const f = readFinance(fd);
    if (!f.label || f.amount === null) return { error: "Bitte Bezeichnung und Betrag prüfen." };
    await query("INSERT INTO finance_items (coachee_id, section, label, amount, period, note, source_meeting_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [coacheeId, f.section, f.label, f.amount, f.period, f.note, s.meeting_id, coach.id]);
  }
  await query("UPDATE ai_suggestions SET status = 'angenommen', decided_by = $2, decided_at = now() WHERE id = $1", [suggestionId, coach.id]);
  await audit(coach.id, "suggestion_accepted", coacheeId);
  refresh(coacheeId);
  return { ok: "Übernommen." };
}

export async function rejectSuggestion(coacheeId: string, suggestionId: string) {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  await query("UPDATE ai_suggestions SET status = 'verworfen', decided_by = $3, decided_at = now() WHERE id = $1 AND coachee_id = $2 AND status = 'offen'", [suggestionId, coacheeId, coach.id]);
  refresh(coacheeId);
}

export async function rejectAllSuggestions(coacheeId: string) {
  const coach = await requireCoach();
  await coacheeFor(coach, coacheeId);
  await query("UPDATE ai_suggestions SET status = 'verworfen', decided_by = $2, decided_at = now() WHERE coachee_id = $1 AND status = 'offen'", [coacheeId, coach.id]);
  refresh(coacheeId);
}
