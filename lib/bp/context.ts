import "server-only";
import type { Coachee } from "../access";
import { pseudonymize } from "../ai";
import { normalizeCv } from "../cv/types";
import { query, one } from "../db";
import { categoryLabel as docCategoryLabel } from "../documents";
import { categoryLabel } from "../profile";
import { normalizeSurvey } from "../survey/types";
import { financeSummary } from "./finance";
import { normalizeTurns, openProposal, VORHABEN, type ChatTurn } from "./notes";
import { SECTIONS, sourceList } from "./sections";
import { planFor, type PlanRow } from "./store";

/*
 * Material für die Schreibhilfe im Businessplan: alles, was im Coaching erarbeitet wurde, nach Wichtigkeit geordnet und
 * in der Länge begrenzt. Reihenfolge: Notizen des Coachs > Bausteine zum Kapitel > Gespräche > Unterlagen > andere Kapitel.
 * Gesundheitsangaben gehen nie an die KI: keine Bausteine der Kategorie Gesundheit, und in Gesprächen, Unterlagen und
 * Erfahrungsbogen fallen Sätze mit Gesundheitsbezug heraus. Namen werden am Ende durch [Name] ersetzt.
 */

// „Krankenversicherung“ und „Krankentagegeld“ gehören in jeden Gründungsplan und bleiben drin
const HEALTH = /gesundheit|krank(?!en(versicherung|kasse|tagegeld|kassen))|\breha|therap|diagnos|attest|arbeitsunfähig|psych|medikament|behinderung|arztbesuch/i;

/** Sätze mit Gesundheitsbezug entfernen */
export function withoutHealth(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.split(/(?<=[.!?;])\s+/).filter((s) => !HEALTH.test(s)).join(" "))
    .filter((l) => l.trim())
    .join("\n");
}

/** Begrenzter Platz fürs Material: wer zuerst kommt, bekommt zuerst */
export class Budget {
  out: string[] = [];
  constructor(private left: number) {}
  block(title: string, body: string, max: number) {
    const text = body.trim();
    if (!text) return;
    const room = Math.min(max, this.left - title.length - 10);
    if (room < 200) return;
    const cut = text.length > room ? `${text.slice(0, room).replace(/\s+\S*$/, "")} …` : text;
    this.out.push(`== ${title} ==\n${cut}`);
    this.left -= cut.length + title.length + 10;
  }
}

const date = (d: string) => new Date(d).toLocaleDateString("de-DE");
/** Kategorien der Akte, deren Text für den Plan taugt (Ideenpapiere, Angebote, Auskünfte von Kammern und Ämtern …) */
const DOC_CATEGORIES = ["businessplan", "sonstiges"];

const coachTurns = (turns: ChatTurn[]) => turns.filter((t) => t.role === "coach" && t.text.trim());

export async function loadChats(coacheeId: string) {
  const rows = await query<{ section: string; notes: string; history: unknown }>("SELECT section, notes, history FROM bp_notes WHERE coachee_id = $1", [coacheeId]);
  const chats: Record<string, ChatTurn[]> = {};
  let vorhaben = "";
  for (const r of rows) {
    if (r.section === VORHABEN) vorhaben = r.notes;
    else chats[r.section] = normalizeTurns(r.history);
  }
  return { chats, vorhaben };
}

/** message: was der Coach gerade geschrieben hat (Notiz oder Anweisung), noch nicht im gespeicherten Verlauf */
export async function chapterContext(c: Coachee, key: string, message: string, plan?: PlanRow) {
  const def = SECTIONS.find((s) => s.key === key)!;
  const all = key === "summary";
  plan ??= await planFor(c);
  const importedDoc = plan.imports.plan?.document ?? null;
  const [items, cv, survey, meetings, docs, notes] = await Promise.all([
    // Coach-Funktion: auch interne Bausteine, aber nie Gesundheit
    query<{ category: string; title: string; detail: string }>(
      "SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' AND ($2 OR category = ANY($3)) ORDER BY category, created_at",
      [c.id, all, def.from],
    ),
    key === "gruender" || all ? one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]) : null,
    key === "gruender" || all ? one<{ data: unknown }>("SELECT data FROM experience_surveys WHERE coachee_id = $1 AND status <> 'offen' ORDER BY created_at DESC LIMIT 1", [c.id]) : null,
    // Protokolle der Gespräche ohne die interne Notiz, dazu die offenen Fragen aus der Auswertung
    query<{ held_on: string; title: string; notes: string; results: string; next_steps: string; ai_questions: unknown }>(
      "SELECT held_on, title, notes, results, next_steps, ai_questions FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 30",
      [c.id],
    ),
    query<{ id: string; category: string; title: string; extracted_text: string }>(
      "SELECT id, category, title, extracted_text FROM documents WHERE coachee_id = $1 AND category = ANY($2) AND COALESCE(extracted_text, '') <> '' ORDER BY created_at DESC LIMIT 12",
      [c.id, DOC_CATEGORIES],
    ),
    loadChats(c.id),
  ]);

  const b = new Budget(all ? 70000 : 48000);

  // 1. Notizen des Coachs
  b.block("Notizen des Coachs zum ganzen Vorhaben", notes.vorhaben, 6000);
  const turns = notes.chats[key] ?? [];
  const own = coachTurns(turns);
  if (all) {
    const lines = SECTIONS.flatMap((s) => {
      const t = coachTurns(notes.chats[s.key] ?? []);
      return t.length ? [`${s.title}:`, ...t.map((x) => `- ${x.text.trim()}`)] : [];
    });
    b.block("Notizen des Coachs zu den Kapiteln", lines.join("\n"), 14000);
  } else if (own.length) {
    b.block("Bisherige Notizen und Anweisungen des Coachs zu diesem Kapitel (älteste zuerst)", own.map((t) => `- ${t.text.trim()}`).join("\n"), 10000);
  }

  // Für die Summary sind die fertigen Kapitel das Wichtigste
  const others = SECTIONS.filter((s) => s.key !== key && plan.sections[s.key].text.trim());
  if (all) b.block("Kapitel des Businessplans", others.map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim()}`).join("\n\n"), 30000);

  // 2. Steckbrief, Bausteine, Lebenslauf, Zahlen
  const head: string[] = [];
  if (plan.title || c.goal) head.push(`Vorhaben: ${plan.title || c.goal}`);
  for (const g of plan.glance.filter((g) => g.value.trim())) head.push(`- ${g.label}: ${g.value.replace(/\n/g, ", ")}`);
  b.block("Auf einen Blick", head.join("\n"), 3000);
  b.block("Bausteine aus den Coaching-Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 10000);
  if (cv) {
    const d = normalizeCv(cv.data);
    const lines: string[] = [];
    if (d.personal.headline) lines.push(`Beruf: ${d.personal.headline}`);
    for (const e of d.experience) lines.push(`- ${e.start || "?"} bis ${e.current ? "heute" : e.end || "?"}: ${e.title}, ${e.company}${e.bullets ? ` – ${e.bullets.replace(/\n/g, "; ")}` : ""}`);
    for (const e of d.education) lines.push(`- Ausbildung: ${e.degree}, ${e.school} (${e.end || e.start})`);
    for (const e of d.certificates) lines.push(`- Zertifikat: ${e.name}${e.year ? ` (${e.year})` : ""}`);
    if (d.skills.length) lines.push(`Kenntnisse: ${d.skills.map((s) => s.name).join(", ")}`);
    b.block("Lebenslauf", lines.join("\n"), 5000);
  }
  if (survey) {
    const s = normalizeSurvey(survey.data);
    const pick = (xs: { text: string; level: number; detail?: string }[]) => xs.filter((x) => x.level > 0).map((x) => `${x.text}${x.detail ? ` (${x.detail})` : ""}`);
    const lines = [
      ["Stärken", pick(s.strengths)],
      ["Nachweise und Scheine", pick(s.licences)],
      ["Software", pick(s.software)],
      ["Sprachen", pick(s.languages)],
    ]
      .filter(([, v]) => v.length)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`);
    b.block("Erfahrungsbogen (Selbstauskunft)", withoutHealth(lines.join("\n")), 2500);
  }
  if (def.finance || all || ["marketing", "organisation", "standort", "risiken"].includes(key)) b.block("Finanzplan", financeSummary(plan.finance), 6000);

  // 3. Gespräche
  const meetingText = meetings
    .map((m) => {
      const qs = Array.isArray(m.ai_questions) ? m.ai_questions.filter((q): q is string => typeof q === "string") : [];
      const body = withoutHealth([m.notes, m.results && `Ergebnis: ${m.results}`, m.next_steps && `Nächste Schritte: ${m.next_steps}`, qs.length ? `Noch offen: ${qs.join(" ")}` : ""].filter(Boolean).join("\n"));
      return body ? `### ${date(m.held_on)} ${m.title}\n${body.slice(0, 2500)}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  b.block("Protokolle der Coaching-Gespräche (neueste zuerst)", meetingText, all ? 8000 : 14000);

  // 4. Unterlagen aus der Akte
  const docText = docs
    .filter((d) => d.id !== importedDoc && !HEALTH.test(d.title))
    .map((d) => `### ${d.title} (${docCategoryLabel(d.category)})\n${withoutHealth(d.extracted_text).slice(0, 5000)}`)
    .join("\n\n");
  b.block("Unterlagen aus der Akte", docText, all ? 6000 : 12000);

  // 5. Andere Kapitel (für die Summary schon oben vollständig)
  if (!all) b.block("Andere Kapitel des Businessplans (gekürzt)", others.map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 700)}`).join("\n\n"), 9000);

  // Zuletzt, aber immer dabei: der bisherige Text, offener Vorschlag und die aktuelle Anweisung
  const current = plan.sections[key];
  const tail: string[] = [];
  tail.push(current.text.trim() ? `== Bisheriger Text dieses Kapitels ==\n${current.text.trim().slice(0, 20000)}` : "== Bisheriger Text dieses Kapitels ==\n(Das Kapitel ist noch leer.)");
  const src = sourceList(current.sources);
  if (src.length) tail.push(`== Bisherige Quellen dieses Kapitels ==\n${src.map((s) => `- ${s}`).join("\n")}`);
  const proposal = openProposal(turns);
  if (proposal) tail.push(`== Dein letzter Vorschlag (noch nicht übernommen) ==\n${proposal.text.slice(0, 20000)}${proposal.sources ? `\nQuellen: ${proposal.sources.replace(/\n/g, "; ")}` : ""}`);
  if (message.trim()) tail.push(`Neue Nachricht des Coachs (Notizen oder Anweisung): ${message.trim().replace(/\n+/g, " / ")}`);

  return pseudonymize([...b.out, ...tail].join("\n\n"), [c.first_name, c.last_name]);
}

/** Material für „Auf einen Blick“: Kapitel, Zahlen, Notizen und Bausteine */
export async function glanceContext(c: Coachee) {
  const plan = await planFor(c);
  const [items, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY category, created_at", [c.id]),
    loadChats(c.id),
  ]);
  const b = new Budget(40000);
  if (plan.title || c.goal) b.out.push(`Vorhaben: ${plan.title || c.goal}`);
  b.block("Notizen des Coachs zum ganzen Vorhaben", notes.vorhaben, 6000);
  b.block("Kapitel des Businessplans", SECTIONS.filter((s) => plan.sections[s.key].text.trim()).map((s) => `## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 3000)}`).join("\n\n"), 24000);
  b.block("Finanzplan", financeSummary(plan.finance), 5000);
  b.block("Bausteine aus den Coaching-Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 6000);
  b.block("Bisherige Angaben „Auf einen Blick“", plan.glance.map((g) => `- ${g.label}: ${g.value.replace(/\n/g, ", ") || "(leer)"}`).join("\n"), 3000);
  return { input: pseudonymize(b.out.join("\n\n"), [c.first_name, c.last_name]), plan };
}
