import "server-only";
import { statusLabel } from "./jobs/shared";
import { notFound } from "next/navigation";
import { coacheeFor, type Coachee } from "./access";
import { pseudonymize } from "./ai";
import type { User } from "./auth";
import { one, query } from "./db";
import { financeSummary, normalizeFinance } from "./bp/finance";
import { SECTIONS, normalizeSections } from "./bp/sections";
import { normalizeCv } from "./cv/types";
import { PERIOD_LABEL, categoryLabel, euro, type FinanceItem } from "./profile";

export type Chat = { id: string; title: string; updated_at: string; user_id: string | null; author_name: string | null };
export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; created_at: string };

/**
 * Der Coach sieht alle Unterhaltungen der Akte, der Coachee nur seine eigenen.
 * Das steht auch so im Assistenten des Coachees.
 */
export async function chatsFor(user: User, coacheeId: string) {
  return query<Chat>(
    `SELECT ch.id, ch.title, ch.updated_at, ch.user_id, u.name AS author_name FROM ai_chats ch LEFT JOIN users u ON u.id = ch.user_id
      WHERE ch.coachee_id = $1 AND ($2 = 'coach' OR ch.user_id = $3) ORDER BY ch.updated_at DESC LIMIT 100`,
    [coacheeId, user.role, user.id],
  );
}

export async function chatFor(user: User, chatId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(chatId)) notFound();
  const chat = await one<{ id: string; coachee_id: string; user_id: string | null; title: string }>("SELECT id, coachee_id, user_id, title FROM ai_chats WHERE id = $1", [chatId]);
  if (!chat) notFound();
  const coachee = await coacheeFor(user, chat.coachee_id);
  if (user.role !== "coach" && chat.user_id !== user.id) notFound();
  return { chat, coachee };
}

export const chatMessages = (chatId: string) => query<ChatMessage>("SELECT id, role, content, created_at FROM ai_messages WHERE chat_id = $1 ORDER BY id", [chatId]);

/** Vorschläge zum Einstieg für den Coach, je nach Coaching-Art */
export const COACH_STARTERS = {
  job: [
    { label: "Anschreiben schreiben", prompt: "Schreib ein Anschreiben des Coachees für diese Stelle. Hier ist die Stellenanzeige:\n\n" },
    { label: "Nächstes Gespräch vorbereiten", prompt: "Bereite mein nächstes Gespräch vor: Was ist offen, welche Fragen stelle ich, und welche Übung passt jetzt?" },
    { label: "Stärken und Belege", prompt: "Welche drei Stärken sollte der Coachee im Vorstellungsgespräch betonen, und mit welchen Beispielen aus der Akte lassen sie sich belegen?" },
    { label: "Passende Berufe finden", prompt: "Welche Berufe und Branchen passen zu Kompetenzen und Wünschen des Coachees? Nenne fünf mit kurzer Begründung und den Suchbegriffen für Jobbörsen." },
    { label: "Verlaufsbericht entwerfen", prompt: "Entwirf einen kurzen, sachlichen Verlaufsbericht für den Kostenträger: Ausgangslage, bisherige Inhalte, Fortschritte, nächste Schritte." },
    { label: "Verdeckte Kompetenzen", prompt: "Welche verdeckten Kompetenzen stecken in dem, was der Coachee bisher erzählt hat, und wie frage ich im nächsten Gespräch gezielt nach?" },
  ],
  gruendung: [
    { label: "Geschäftsidee beschreiben", prompt: "Formuliere die Geschäftsidee des Coachees für den Businessplan: Angebot, Kundennutzen und Alleinstellung." },
    { label: "Nächstes Gespräch vorbereiten", prompt: "Bereite mein nächstes Gespräch vor: Welche Teile des Businessplans fehlen noch, welche Zahlen brauche ich, welche Fragen stelle ich?" },
    { label: "Preise prüfen", prompt: "Prüfe die Preise und Zahlen des Coachees auf Plausibilität. Rechne nach, ob sich die Gründung trägt, und zeig Lücken." },
    { label: "Fragen der Fachstelle", prompt: "Welche kritischen Fragen stellt die fachkundige Stelle oder die Bank zu diesem Plan, und wie bereiten wir die Antworten vor?" },
    { label: "Verlaufsbericht entwerfen", prompt: "Entwirf einen kurzen, sachlichen Verlaufsbericht für den Kostenträger: Ausgangslage, Stand des Businessplans, Fortschritte, nächste Schritte." },
    { label: "Risiken einschätzen", prompt: "Wo liegen die größten Risiken dieser Gründung, und was kann der Coachee jetzt schon dagegen tun?" },
  ],
} as const;

/** Vorschläge zum Einstieg für den Coachee, je nach Coaching-Art */
export const STARTERS = {
  job: [
    { label: "Anschreiben schreiben", prompt: "Schreib mir ein Anschreiben für diese Stelle. Hier ist die Stellenanzeige:\n\n" },
    { label: "Stärken herausarbeiten", prompt: "Welche drei Stärken sollte ich im Vorstellungsgespräch betonen, und mit welchen Beispielen aus meiner Erfahrung kann ich sie belegen?" },
    { label: "Vorstellungsgespräch üben", prompt: "Lass uns ein Vorstellungsgespräch üben. Stell mir nacheinander typische Fragen und gib mir nach jeder Antwort kurzes Feedback." },
    { label: "Lücke im Lebenslauf erklären", prompt: "Wie erkläre ich eine Lücke in meinem Lebenslauf ehrlich und souverän? Gib mir zwei kurze Formulierungen." },
    { label: "Passende Berufe finden", prompt: "Welche Berufe und Branchen passen zu meinen Kompetenzen und Wünschen? Nenne fünf mit kurzer Begründung." },
    { label: "LinkedIn-Profil", prompt: "Schreib mir einen kurzen Info-Text für mein LinkedIn- oder XING-Profil." },
  ],
  gruendung: [
    { label: "Geschäftsidee beschreiben", prompt: "Formuliere meine Geschäftsidee für den Businessplan: Angebot, Kundennutzen und was mich von anderen unterscheidet." },
    { label: "Zielgruppe schärfen", prompt: "Beschreibe meine Zielgruppe genauer und stell mir die Fragen, die dafür noch fehlen." },
    { label: "Wettbewerb analysieren", prompt: "Wie analysiere ich meinen Wettbewerb vor Ort? Mach mir eine Tabelle zum Ausfüllen und sag, wo ich die Infos finde." },
    { label: "Preise kalkulieren", prompt: "Hilf mir, meinen Preis zu kalkulieren. Rechne mit den Zahlen, die schon da sind, und frag nach dem, was fehlt." },
    { label: "Marketing für den Start", prompt: "Wie gewinne ich meine ersten zehn Kunden? Gib mir einen konkreten Plan für die ersten drei Monate." },
    { label: "Fragen der Fachstelle", prompt: "Welche kritischen Fragen stellt die fachkundige Stelle oder die Bank zu meinem Plan, und wie beantworte ich sie?" },
  ],
} as const;

/** Was der Assistent über die Akte weiß. Gesundheit und interne Notizen des Coachs gehen nie an die KI. */
export async function assistantInstructions(user: User, c: Coachee) {
  const coach = user.role === "coach";
  const [profile, finance, meetings, cv, planRow, apps] = await Promise.all([
    query<{ category: string; title: string; detail: string; level: number | null }>(
      "SELECT category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' AND (NOT internal OR $2) ORDER BY category, created_at",
      [c.id, coach],
    ),
    c.coaching_type === "gruendung" ? query<FinanceItem>("SELECT section, label, amount, period, note FROM finance_items WHERE coachee_id = $1 ORDER BY section, created_at", [c.id]) : Promise.resolve([] as FinanceItem[]),
    query<{ held_on: string; title: string; notes: string; results: string; next_steps: string }>(
      "SELECT held_on, title, notes, results, next_steps FROM meetings WHERE coachee_id = $1 AND (shared OR $2) ORDER BY held_on DESC LIMIT 6",
      [c.id, coach],
    ),
    one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
    c.coaching_type === "gruendung" ? one<{ title: string; sections: unknown; finance: unknown }>("SELECT title, sections, finance FROM business_plans WHERE coachee_id = $1", [c.id]) : null,
    c.coaching_type === "job"
      ? query<{ title: string; employer: string; location: string; status: string; applied_on: string | null; next_on: string | null; next_note: string }>(
          "SELECT title, employer, location, status, applied_on::text, next_on::text, next_note FROM applications WHERE coachee_id = $1 AND status <> 'verworfen' ORDER BY updated_at DESC LIMIT 25",
          [c.id],
        )
      : Promise.resolve([]),
  ]);
  const plan = planRow ? { title: planRow.title, sections: normalizeSections(planRow.sections), finance: normalizeFinance(planRow.finance) } : null;

  const lines: string[] = [];
  lines.push(`Coaching-Art: ${c.coaching_type === "job" ? "Jobcoaching (berufliche Neuorientierung, Bewerbung)" : "Gründungscoaching (Weg in die Selbstständigkeit, Businessplan)"}`);
  if (c.goal) lines.push(`Ziel des Coachings: ${c.goal}`);
  if (profile.length) {
    lines.push(c.coaching_type === "job" ? "\nKompetenzprofil aus den Gesprächen:" : "\nBausteine für den Businessplan aus den Gesprächen:");
    for (const p of profile) lines.push(`- ${categoryLabel(c.coaching_type, p.category)}: ${p.title}${p.level ? ` (Stufe ${p.level}/5)` : ""}${p.detail ? ` – ${p.detail}` : ""}`);
  }
  if (finance.length) {
    lines.push("\nZahlen für den Finanzplan:");
    for (const f of finance) lines.push(`- ${f.section}: ${f.label} ${euro(f.amount)} ${PERIOD_LABEL[f.period]}${f.note ? ` (${f.note})` : ""}`);
  }
  if (plan) {
    const written = SECTIONS.filter((s) => plan.sections[s.key].text.trim());
    lines.push(`\nBusinessplan „${plan.title || "ohne Titel"}“: ${written.length} von ${SECTIONS.length} Abschnitten begonnen.`);
    for (const s of written) lines.push(`## ${s.title}\n${plan.sections[s.key].text.trim().slice(0, 900)}`);
    lines.push("\n" + financeSummary(plan.finance));
  }
  if (cv) {
    const d = normalizeCv(cv.data);
    lines.push("\nAktueller Lebenslauf:");
    if (d.personal.headline) lines.push(`Berufsbezeichnung: ${d.personal.headline}`);
    for (const e of d.experience) lines.push(`- ${e.start || "?"} bis ${e.current ? "heute" : e.end || "?"}: ${e.title}, ${e.company}${e.bullets ? ` – ${e.bullets.replace(/\n/g, "; ")}` : ""}`);
    for (const e of d.education) lines.push(`- Ausbildung: ${e.degree}, ${e.school} (${e.end || e.start})`);
    if (d.skills.length) lines.push(`Kenntnisse: ${d.skills.map((s) => s.name).join(", ")}`);
    if (d.languages.length) lines.push(`Sprachen: ${d.languages.map((l) => `${l.name} ${l.level}`).join(", ")}`);
  }
  if (apps.length) {
    lines.push("\nStellen und Bewerbungen (Stand im Bewerbungs-Tracker):");
    for (const a of apps) lines.push(`- ${a.title}${a.employer ? `, ${a.employer}` : ""}${a.location ? ` (${a.location})` : ""}: ${statusLabel(a.status)}${a.applied_on ? `, beworben am ${a.applied_on}` : ""}${a.next_on ? `, nächster Schritt ${a.next_on}${a.next_note ? ` ${a.next_note}` : ""}` : ""}`);
  }
  if (meetings.length) {
    lines.push("\nLetzte Gespräche (neueste zuerst):");
    for (const m of meetings) lines.push(`- ${m.held_on} ${m.title}: ${[m.notes, m.results && `Ergebnis: ${m.results}`, m.next_steps && `Nächste Schritte: ${m.next_steps}`].filter(Boolean).join(" ").slice(0, 1200)}`);
  }
  const akte = pseudonymize(lines.join("\n"), [c.first_name, c.last_name]);

  const who = coach
    ? "Du sprichst mit dem Coach, der mit dem Coachee arbeitet und Texte, Ideen und Einschätzungen für diese Arbeit braucht. Sprich den Coach mit „du“ an und den Coachee in der dritten Person als „der Coachee“."
    : "Du sprichst direkt mit dem Coachee. Sprich die Person freundlich mit „du“ an, ermutigend und klar, ohne Fachjargon. Bei Fragen, die ins Coaching gehören, verweise auf das nächste Gespräch mit dem Coach.";

  return `Du bist der KI-Assistent im Coaching-Portal von Gründarium (Kunt Solutions, Nürnberg). ${who}

So arbeitest du:
- Antworte auf Deutsch, konkret und auf diese Person zugeschnitten. Nutze das Wissen aus der Akte unten.
- Erfinde keine Tatsachen über die Person. Wenn etwas fehlt, frag kurz nach oder setze einen Platzhalter in eckigen Klammern.
- Namen sind im Wissen durch [Name] ersetzt. Schreib in Texten [Name], wo der Name stehen muss.
- Fertige Texte (Anschreiben, Profiltexte, Businessplan-Abschnitte) gibst du vollständig und ohne Vorrede aus.
- Für Bewerbungen: DIN-5008-Stil, keine Floskeln wie „hiermit bewerbe ich mich“, Stärken mit Belegen.
- Für Businesspläne: so, wie es die fachkundige Stelle für den Gründungszuschuss und Banken erwarten, mit realistischen Zahlen.
- Keine Rechts- oder Steuerberatung im Einzelfall; sag dann, wen man fragen sollte.
- Gliedere mit kurzen Absätzen, Aufzählungen mit „- “ und **fett** für Wichtiges. Keine Tabellen über fünf Spalten.

Wissen aus der Akte:
${akte || "(noch nichts erfasst)"}`;
}
