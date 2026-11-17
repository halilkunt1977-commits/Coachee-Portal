import "server-only";
import { fullName, type Coachee } from "../access";
import { AiError, jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { one, query } from "../db";
import { categoryLabel } from "../profile";
import { Budget, loadChats, withoutHealth } from "./context";
import { brancheOf, brancheText } from "./branchen";
import { financeSummary } from "./finance";
import { SECTIONS, chapterProgress, normalizeGlance, normalizeSections, type GlanceItem, type SectionState } from "./sections";
import { planFor } from "./store";

/*
 * Eine KI für den ganzen Businessplan (nur Coach). Ein Durchgang:
 *  1. Prüfen: Die KI liest den ganzen Plan mit Finanzplan, Notizen, Gesprächen und den neuen Angaben des Coachs
 *     und entscheidet für jedes Kapitel, ob es neu geschrieben, angepasst oder gelassen wird, mit Auftrag.
 *  2. Schreiben: Die betroffenen Kapitel werden parallel überarbeitet und direkt gespeichert, die Executive
 *     Summary zum Schluss aus den neuen Kapiteln, dazu „Auf einen Blick“.
 * Der Stand davor liegt in bp_runs.before und lässt sich mit einem Klick zurückholen.
 * Läuft im Hintergrund des App-Prozesses; der Editor fragt den Stand regelmäßig ab.
 */

export type RunAction = "neu" | "anpassen" | "lassen";
export type RunChapter = { key: string; action: RunAction; reason: string; status: "wartet" | "schreibt" | "fertig" | "fehler" };
export type RunProgress = { phase: "pruefen" | "schreiben" | "blick" | "fertig"; chapters: RunChapter[] };
/** Bewertung eines Kapitels mit Rückfragen, wenn etwas fehlt */
export type ChapterReview = { key: string; rating: "gut" | "ausbaufaehig" | "fehlt"; text: string; questions: string[] };
export type RunResult = { note: string; glance: number; review?: ChapterReview[] };
export type Decision = "offen" | "uebernommen" | "verworfen";
/** Eine Änderung der KI: Kapitel (oder „blick“ für Auf einen Blick) vorher und nachher */
export type RunChange = { key: string; before: string; after: string; decision: Decision };
export const BLICK_KEY = "blick";
export type RunView = {
  id: string;
  status: "laeuft" | "fertig" | "fehler";
  kind: "aendern" | "frage";
  message: string;
  progress: RunProgress;
  result: RunResult | null;
  error: string | null;
  undone: boolean;
  changes: RunChange[];
  at: string;
};

const WRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "chapters", "glance"],
  properties: {
    reply: { type: "string" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "text"],
        properties: { key: { type: "string", enum: SECTIONS.map((s) => s.key) }, text: { type: "string" } },
      },
    },
    glance: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } },
    },
  },
};

const WRITE_INSTRUCTIONS = `Du bist eine erfahrene Gründungsberaterin und schreibst zusammen mit dem Gründungscoach Businesspläne für Gründungen in Deutschland (eingereicht bei der fachkundigen Stelle für den Gründungszuschuss, beim Jobcenter und bei Banken). Ihr arbeitet wie in einem Chat bei ChatGPT: Der Coach schreibt dir, was er will, und gibt dir Unterlagen. Du lieferst sofort das fertige Ergebnis.

Grundsatz: Du stellst KEINE Rückfragen und lässt nichts offen. Fehlt eine Angabe, triffst du eine realistische, branchenübliche Annahme für eine kleine Gründung in Deutschland und kennzeichnest sie im Text mit „(Annahme)“. Keine Platzhalter in eckigen Klammern (außer [Name]). Statistiken, Studien, Quellen und Namen erfindest du nie.

Was der Coach will:
- „Fertigstellen“, „schreib den Plan“, „komplett“, „neu“, eine leere Nachricht oder ein noch weitgehend leerer Plan: Du schreibst ALLE 14 Kapitel vollständig und abgabereif und füllst „Auf einen Blick“.
- Mitgegebene Unterlagen (z. B. ein Businessplan aus einem anderen Programm, Notizen, Fotos): Übernimm ihre Inhalte vollständig in die passenden Kapitel und schreib alle betroffenen Kapitel neu.
- Ein Änderungswunsch („Start ist April“, „Preis 65 €“, „kürzer“, „mehr zum Marketing“): Setz ihn überall um, wo er hingehört, und schreib jedes betroffene Kapitel komplett neu (nicht nur den geänderten Satz). Die Executive Summary passt du an, sobald sich etwas Wesentliches ändert.
- Eine reine Frage oder Bitte um Einschätzung: Antworte in reply, chapters bleibt leer.

So schreibst du die Kapitel:
- Jedes Kapitel in chapters enthält den kompletten neuen Kapiteltext (ohne Kapitelüberschrift). Kapitel, die du nicht änderst, lässt du weg.
- Halte dich an die Pflichtangaben je Kapitel und den Umfang aus dem Material (Wörter je Kapitel), eher ausführlich als knapp. Das Kapitel Finanzen ist das ausführlichste.
- Sachlich in der dritten Person („[Name] plant …“, „Das Unternehmen …“), keine Ich-Form, keine Werbesprache. Absätze mit zwei bis vier Sätzen, getrennt durch eine Leerzeile. Zwischenüberschriften mit „### “, Aufzählungen mit „- “, Tabellen im Markdown-Format, wo sie helfen (z. B. Mitbewerber, Preise, Zielgruppen).
- Konkret und prüfbar: Ort, Zeitpunkt, Preise, Mengen, Stundensätze, Kundengruppen, Maßnahmen mit Kosten. Keine leeren Sätze wie „hohe Qualität“ oder „wachsender Markt“ ohne Beleg.
- Zahlen müssen mit dem Finanzplan übereinstimmen (Umsatz, Kosten, Ergebnis Jahr 1 bis 3, Investitionen, Kapitalbedarf, Finanzierung). Ist der Finanzplan leer, nimm plausible Zahlen an und kennzeichne sie.
- Alle Kapitel passen zusammen: gleiche Zahlen, gleicher Starttermin, gleiche Bezeichnungen.
- Die Angaben des Coachs (Nachrichten, Notizen) haben Vorrang vor allem anderen Material.

glance: „Auf einen Blick“ als Liste (label, value), z. B. Gründer, Gründungsvorhaben, Standort, Rechtsform, Start, Zielgruppe, Kapitalbedarf, Finanzierung, Umsatz Jahr 1. Nur ausfüllen, wenn sich dort etwas ändert, sonst leer lassen.

reply: Antwort an den Coach, per du, auf Deutsch, ohne Floskeln. Bei Änderungen zwei bis vier Sätze: was du geschrieben oder geändert hast und welche wichtigen Annahmen du getroffen hast. Bei einer Frage eine konkrete Antwort mit Bezug auf Kapitel und Zahlen.

Namen sind durch [Name] ersetzt. Angaben zur Gesundheit gehören nicht in den Plan.`;


/** Material für die Prüfung: alles auf einmal, die Kapitel vollständig */
type Attached = { title: string; text: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Vom Coach mitgegebene Dateien und Fotos (liegen unter Dokumente) */
async function attachedDocs(coacheeId: string, ids: string[]): Promise<Attached[]> {
  const ok = ids.filter((x) => UUID.test(x)).slice(0, 10);
  if (!ok.length) return [];
  const rows = await query<{ title: string; extracted_text: string | null }>("SELECT title, extracted_text FROM documents WHERE coachee_id = $1 AND id = ANY($2::uuid[])", [coacheeId, ok]);
  return rows.map((r) => ({ title: r.title, text: withoutHealth(r.extracted_text ?? "") })).filter((r) => r.text.trim());
}
const attachedBlock = (a: Attached[], max: number) => a.map((d) => `### ${d.title}\n${d.text.slice(0, Math.floor(max / Math.max(1, a.length)))}`).join("\n\n");

/** Material zum ganzen Plan als Textblöcke (noch nicht pseudonymisiert) */
async function planMaterial(c: Coachee, earlier: string[], attached: Attached[] = []) {
  const plan = await planFor(c);
  const [items, meetings, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY category, created_at", [c.id]),
    query<{ held_on: string; title: string; notes: string; results: string }>("SELECT held_on, title, notes, results FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 15", [c.id]),
    loadChats(c.id),
  ]);
  const b = new Budget(110000);
  if (plan.title || c.goal) b.out.push(`Vorhaben: ${plan.title || c.goal}`);
  b.block("Notizen des Coachs zum ganzen Vorhaben", notes.vorhaben, 8000);
  b.block("Standard des Coachs: Pflichtangaben und Umfang je Kapitel", SECTIONS.map((s, i) => `${i + 1}. ${s.title} [${s.key}], ${s.words[0]}–${s.words[1]} Wörter: ${s.must.join("; ")}`).join("\n"), 6000);
  b.block("Branchenprofil", brancheText(brancheOf(plan.branche)), 5000);
  b.block("Vom Coach gerade mitgegebene Dateien und Fotos (wichtig, gehören zu seiner Nachricht)", attachedBlock(attached, 24000), 24000);
  b.block("Frühere Angaben des Coachs an dich (älteste zuerst, gelten weiter)", earlier.map((m) => `- ${m}`).join("\n"), 8000);
  b.block("Finanzplan (maßgebliche Zahlen)", financeSummary(plan.finance), 8000);
  b.block(
    "Kapitel des Businessplans",
    SECTIONS.map((s, i) => {
      const sec = plan.sections[s.key];
      const p = chapterProgress(sec.text, s);
      return `## ${i + 1}. ${s.title} [key: ${s.key}] – ${p.words} Wörter (Vorlage ${s.words[0]}–${s.words[1]}), ${p.open} Platzhalter\n${sec.text.trim() || "(leer)"}`;
    }).join("\n\n"),
    70000,
  );
  b.block("Auf einen Blick", plan.glance.map((g) => `- ${g.label}: ${g.value.replace(/\n/g, ", ") || "(leer)"}`).join("\n"), 3000);
  b.block("Bausteine aus den Coaching-Gesprächen", items.map((i) => `- ${categoryLabel("gruendung", i.category)}: ${i.title}${i.detail ? ` – ${i.detail}` : ""}`).join("\n"), 8000);
  b.block(
    "Protokolle der Coaching-Gespräche (neueste zuerst, gekürzt)",
    meetings.map((m) => withoutHealth([m.notes, m.results].filter(Boolean).join("\n")).slice(0, 1200)).filter(Boolean).join("\n\n"),
    6000,
  );
  return b.out;
}

/** Bisheriges Gespräch im Chat: frühere Nachrichten des Coachs und deine Antworten (älteste zuerst) */
async function dialogue(coacheeId: string, runId: string) {
  const rows = await query<{ message: string; result: RunResult | null }>(
    "SELECT message, result FROM bp_runs WHERE coachee_id = $1 AND id <> $2 AND NOT hidden AND status = 'fertig' ORDER BY created_at DESC LIMIT 8",
    [coacheeId, runId],
  );
  const legacy = (await loadChats(coacheeId)).chats[CHAT_KEY] ?? [];
  const lines = [
    ...legacy.slice(-6).map((t) => `${t.role === "coach" ? "Coach" : "Du"}: ${t.text.slice(0, 2500)}`),
    ...rows.reverse().flatMap((r) => [r.message.trim() ? `Coach: ${r.message.slice(0, 2500)}` : "Coach: (ganzen Plan abgleichen)", r.result?.note ? `Du: ${r.result.note.slice(0, 2500)}` : ""]),
  ].filter(Boolean);
  return lines.join("\n\n");
}

async function checkInput(c: Coachee, runId: string, message: string, earlier: string[], attached: Attached[]) {
  const talk = await dialogue(c.id, runId);
  const tail = message.trim() ? `Neue Nachricht des Coachs: ${message.trim()}` : "Neue Nachricht des Coachs: (leer) Gleiche den ganzen Plan mit dem aktuellen Material und Finanzplan ab und verbessere ihn.";
  return pseudonymize([...(await planMaterial(c, earlier, attached)), talk ? `== Bisheriges Gespräch im Chat ==\n${talk}` : "", tail].filter(Boolean).join("\n\n"), [c.first_name, c.last_name]);
}

async function saveProgress(id: string, progress: RunProgress) {
  await query("UPDATE bp_runs SET progress = $2 WHERE id = $1", [id, JSON.stringify(progress)]);
}

async function writeSection(coacheeId: string, key: string, userId: string, text: string, sources: string) {
  await query(
    `UPDATE business_plans
        SET sections = jsonb_set(sections, ARRAY[$2::text], jsonb_build_object('text', $3::text, 'sources', $5::text, 'version', COALESCE((sections->($2::text)->>'version')::int, 0) + 1, 'updated_at', now(), 'updated_by', $4::text)),
            updated_at = now()
      WHERE coachee_id = $1`,
    [coacheeId, key, text.slice(0, 60000), userId, sources.slice(0, 8000)],
  );
}

/** Neuen Stand eines Kapitels (oder von „Auf einen Blick“) im Durchgang festhalten, für die markierten Änderungen */
async function saveAfter(runId: string, key: string, value: unknown) {
  await query("UPDATE bp_runs SET after = after || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1", [runId, key, JSON.stringify(value)]);
}


/**
 * Läuft im Hintergrund; Fehler landen im Durchgang, nicht beim Aufrufer.
 * Ein einziger Aufruf wie in einem Chat: Die KI sieht alles (Plan, Finanzplan, Unterlagen, Gespräch) und gibt die
 * geänderten Kapitel komplett zurück. Der Stand davor bleibt im Durchgang für „Rückgängig“.
 */
export async function executeRun(runId: string, user: User, c: Coachee, message: string) {
  const name = fullName(c);
  const fill = (s: string) => s.replaceAll("[Name]", name).trim();
  const progress: RunProgress = { phase: "schreiben", chapters: [] };
  try {
    await saveProgress(runId, progress);
    const earlier = (await query<{ message: string }>("SELECT message FROM bp_runs WHERE coachee_id = $1 AND id <> $2 AND kind = 'aendern' AND message <> '' AND undone_at IS NULL ORDER BY created_at", [c.id, runId])).map((r) => r.message);
    const files = (await one<{ files: string[] }>("SELECT files FROM bp_runs WHERE id = $1", [runId]))?.files ?? [];
    const attached = await attachedDocs(c.id, files);
    const out = await jsonResponse<{ reply: string; chapters: { key: string; text: string }[]; glance: { label: string; value: string }[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "businessplan",
      schemaName: "businessplan_chat",
      schema: WRITE_SCHEMA,
      maxTokens: 40000,
      instructions: WRITE_INSTRUCTIONS,
      input: await checkInput(c, runId, message, earlier, attached),
    });
    const note = fill(out.reply ?? "").slice(0, 20000);
    const chapters = (out.chapters ?? []).filter((x) => SECTIONS.some((s) => s.key === x.key) && fill(x.text));
    const glanceItems = (out.glance ?? []).map((g) => ({ label: fill(g.label).slice(0, 80), value: fill(g.value).slice(0, 600) })).filter((g) => g.label && g.value);

    if (!chapters.length && !glanceItems.length) {
      progress.phase = "fertig";
      await query("UPDATE bp_runs SET status = 'fertig', kind = 'frage', progress = $2, result = $3, finished_at = now() WHERE id = $1", [runId, JSON.stringify(progress), JSON.stringify({ note, glance: 0 } satisfies RunResult)]);
      return;
    }

    // Stand vorher für „Rückgängig“ und die Markierung im Dokument
    const plan = await planFor(c);
    const before: { sections: Record<string, SectionState>; glance: GlanceItem[] } = { sections: {}, glance: plan.glance };
    for (const x of chapters) before.sections[x.key] = plan.sections[x.key];
    await query("UPDATE bp_runs SET before = $2 WHERE id = $1", [runId, JSON.stringify(before)]);

    for (const x of chapters) {
      const text = fill(x.text);
      await writeSection(c.id, x.key, user.id, text, plan.sections[x.key]?.sources ?? "");
      await saveAfter(runId, x.key, text.slice(0, 60000));
    }
    progress.chapters = SECTIONS.map((s) => ({ key: s.key, action: chapters.some((x) => x.key === s.key) ? "neu" : "lassen", reason: "", status: "fertig" }));

    let glance = 0;
    if (glanceItems.length) {
      const map = new Map(glanceItems.map((g) => [g.label, g.value]));
      const next = [...plan.glance.map((g) => (map.has(g.label) ? { ...g, value: map.get(g.label)! } : g)), ...glanceItems.filter((g) => !plan.glance.some((n) => n.label === g.label))];
      await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [c.id, JSON.stringify(next)]);
      await saveAfter(runId, BLICK_KEY, next);
      glance = glanceItems.length;
    }

    progress.phase = "fertig";
    const result: RunResult = { note, glance };
    await query("UPDATE bp_runs SET status = 'fertig', progress = $2, result = $3, finished_at = now() WHERE id = $1", [runId, JSON.stringify(progress), JSON.stringify(result)]);
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-KI", e);
    const error = e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen.";
    await query("UPDATE bp_runs SET status = 'fehler', progress = $2, error = $3, finished_at = now() WHERE id = $1", [runId, JSON.stringify(progress), error]);
  }
}

/**
 * Einen Durchgang anlegen; läuft schon einer (jünger als 20 Minuten), kommt dieser zurück (fresh: false).
 * Den neuen startet der Aufrufer mit executeRun im Hintergrund (after()).
 */
export async function createRun(user: User, c: Coachee, message: string, files: string[] = []): Promise<{ id: string; fresh: boolean; message: string }> {
  await query("UPDATE bp_runs SET status = 'fehler', error = 'Abgebrochen (der Server wurde neu gestartet). Bitte noch einmal starten.', finished_at = now() WHERE coachee_id = $1 AND status = 'laeuft' AND created_at <= now() - interval '20 minutes'", [c.id]);
  const running = await one<{ id: string }>("SELECT id FROM bp_runs WHERE coachee_id = $1 AND status = 'laeuft' ORDER BY created_at DESC LIMIT 1", [c.id]);
  if (running) return { id: running.id, fresh: false, message: "" };
  const text = message.trim().slice(0, 8000);
  const ids = files.filter((x) => UUID.test(x)).slice(0, 10);
  const row = await one<{ id: string }>("INSERT INTO bp_runs (coachee_id, message, created_by, files) VALUES ($1, $2, $3, $4::uuid[]) RETURNING id", [c.id, text, user.id, ids]);
  return { id: row!.id, fresh: true, message: text };
}

type RunRow = { id: string; status: RunView["status"]; kind: RunView["kind"]; message: string; progress: unknown; result: unknown; error: string | null; undone_at: Date | null; created_at: Date; before: unknown; after: unknown; decisions: unknown };
const RUN_COLS = "id, status, kind, message, progress, result, error, undone_at, created_at, before, after, decisions";
const glanceText = (raw: unknown) => normalizeGlance(Array.isArray(raw) ? raw : []).filter((g) => g.value.trim()).map((g) => `${g.label}: ${g.value.replace(/\n/g, ", ")}`).join("\n\n");

const view = (r: RunRow): RunView => {
  const before = (r.before ?? {}) as { sections?: Record<string, { text?: string }>; glance?: unknown };
  const after = (r.after ?? {}) as Record<string, unknown>;
  const decisions = (r.decisions ?? {}) as Record<string, Decision>;
  const fallback: Decision = r.undone_at ? "verworfen" : "offen";
  const changes: RunChange[] = [
    ...SECTIONS.filter((s) => typeof after[s.key] === "string").map((s) => ({ key: s.key, before: String(before.sections?.[s.key]?.text ?? ""), after: String(after[s.key]), decision: decisions[s.key] ?? fallback })),
    ...(Array.isArray(after[BLICK_KEY]) ? [{ key: BLICK_KEY, before: glanceText(before.glance), after: glanceText(after[BLICK_KEY]), decision: decisions[BLICK_KEY] ?? fallback }] : []),
  ].filter((x) => x.before.trim() !== x.after.trim());
  return {
    id: r.id,
    status: r.status,
    kind: r.kind ?? "aendern",
    message: r.message,
    progress: { phase: "pruefen", chapters: [], ...(r.progress as Partial<RunProgress>) },
    result: (r.result as RunResult | null) ?? null,
    error: r.error,
    undone: Boolean(r.undone_at),
    changes,
    at: new Date(r.created_at).toISOString(),
  };
};

const expire = (coacheeId: string) =>
  query("UPDATE bp_runs SET status = 'fehler', error = 'Abgebrochen (der Server wurde neu gestartet). Bitte noch einmal starten.', finished_at = now() WHERE coachee_id = $1 AND status = 'laeuft' AND created_at <= now() - interval '20 minutes'", [coacheeId]);

export async function getRun(coacheeId: string, id?: string): Promise<RunView | null> {
  if (id && !UUID.test(id)) return null;
  await expire(coacheeId);
  const r = await one<RunRow>(`SELECT ${RUN_COLS} FROM bp_runs WHERE coachee_id = $1 ${id ? "AND id = $2" : ""} ORDER BY created_at DESC LIMIT 1`, id ? [coacheeId, id] : [coacheeId]);
  return r ? view(r) : null;
}

/** Der Chat: die letzten Nachrichten an die KI mit Antworten und Änderungen, älteste zuerst */
export async function recentRuns(coacheeId: string, limit = 12) {
  await expire(coacheeId);
  const rows = await query<RunRow>(`SELECT ${RUN_COLS} FROM bp_runs WHERE coachee_id = $1 AND NOT hidden ORDER BY created_at DESC LIMIT $2`, [coacheeId, limit]);
  return rows.reverse().map(view);
}

/** Chat leeren: Durchgänge ausblenden (Änderungen am Plan bleiben), alten Fragen-Verlauf löschen */
export async function clearChat(coacheeId: string) {
  await query("UPDATE bp_runs SET hidden = true WHERE coachee_id = $1 AND status <> 'laeuft'", [coacheeId]);
  await query("DELETE FROM bp_notes WHERE coachee_id = $1 AND section = $2", [coacheeId, CHAT_KEY]);
}

/**
 * Entscheidung des Coachs zu einer Änderung (key) oder zu allen offenen (key leer).
 * „verworfen“ holt den Stand vor dem Durchgang zurück, „uebernommen“ behält ihn und nimmt die Markierung weg.
 */
export async function decide(user: User, coacheeId: string, id: string, key: string | null, decision: "uebernommen" | "verworfen") {
  if (!UUID.test(id)) return false;
  const r = await one<RunRow>(`SELECT ${RUN_COLS} FROM bp_runs WHERE id = $1 AND coachee_id = $2`, [id, coacheeId]);
  if (!r || r.status === "laeuft") return false;
  const v = view(r);
  const targets = v.changes.filter((x) => (key ? x.key === key : x.decision === "offen"));
  if (!targets.length) return false;
  const before = (r.before ?? {}) as { sections?: unknown; glance?: unknown };
  const decisions = { ...((r.decisions ?? {}) as Record<string, Decision>) };
  if (decision === "verworfen") {
    const sections = normalizeSections(before.sections ?? {});
    for (const x of targets) {
      if (x.decision === "verworfen") continue;
      if (x.key === BLICK_KEY) {
        if (Array.isArray(before.glance)) await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [coacheeId, JSON.stringify(normalizeGlance(before.glance))]);
      } else await writeSection(coacheeId, x.key, user.id, sections[x.key].text, sections[x.key].sources);
    }
  } else {
    // Übernehmen nach Verwerfen: den Text der KI wieder einsetzen
    const after = (r.after ?? {}) as Record<string, unknown>;
    for (const x of targets) {
      if (x.decision !== "verworfen") continue;
      if (x.key === BLICK_KEY) await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [coacheeId, JSON.stringify(normalizeGlance(after[BLICK_KEY]))]);
      else {
        const cur = await one<{ sources: string | null }>("SELECT sections->($2::text)->>'sources' AS sources FROM business_plans WHERE coachee_id = $1", [coacheeId, x.key]);
        await writeSection(coacheeId, x.key, user.id, x.after, cur?.sources ?? "");
      }
    }
  }
  for (const x of targets) decisions[x.key] = decision;
  const allRejected = v.changes.every((x) => decisions[x.key] === "verworfen");
  await query(`UPDATE bp_runs SET decisions = $2${allRejected ? ", undone_at = COALESCE(undone_at, now())" : ", undone_at = NULL"} WHERE id = $1`, [id, JSON.stringify(decisions)]);
  return true;
}

// Alter Verlauf aus „Fragen & Bewertung“ (vor dem gemeinsamen Chat); wird im Chat noch angezeigt
export const CHAT_KEY = "gesamt_chat";
