import "server-only";
import { randomUUID } from "node:crypto";
import { fullName, type Coachee } from "../access";
import { AiError, jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { one, query } from "../db";
import { categoryLabel } from "../profile";
import { Budget, chapterContext, loadChats, withoutHealth } from "./context";
import { financeSummary } from "./finance";
import { DRAFT_SCHEMA, appendTurns, instructions, proposeGlance } from "./schreibhilfe";
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
export type RunResult = { note: string; glance: number };
export type RunView = {
  id: string;
  status: "laeuft" | "fertig" | "fehler";
  message: string;
  progress: RunProgress;
  result: RunResult | null;
  error: string | null;
  undone: boolean;
  at: string;
};

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note", "chapters", "glance"],
  properties: {
    note: { type: "string" },
    glance: { type: "boolean" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "action", "todo"],
        properties: { key: { type: "string", enum: SECTIONS.map((s) => s.key) }, action: { type: "string", enum: ["neu", "anpassen", "lassen"] }, todo: { type: "string" } },
      },
    },
  },
};

const CHECK_INSTRUCTIONS = `Du betreust den kompletten Businessplan einer Gründung in Deutschland (Vorlage des Gründungscoachs, 14 Kapitel, eingereicht bei der fachkundigen Stelle und Banken). Der Coach gibt dir neue Angaben, Zahlen, Notizen oder Wünsche, oder er möchte einfach, dass du alles mit dem aktuellen Stand abgleichst.

Deine Aufgabe in diesem Schritt: Prüfe den ganzen Plan Kapitel für Kapitel gegen das Material und entscheide für JEDES der 14 Kapitel:
- "neu": Das Kapitel ist leer oder so dünn bzw. veraltet, dass es neu geschrieben werden muss.
- "anpassen": Das Kapitel passt im Kern, aber etwas stimmt nicht mehr oder fehlt (neue Zahlen aus dem Finanzplan, neue Angaben oder Notizen des Coachs, Widerspruch zu anderen Kapiteln, Platzhalter in eckigen Klammern, die das Material inzwischen beantwortet, deutlich zu kurz).
- "lassen": Das Kapitel ist stimmig, vollständig und passt zu allen Zahlen und Angaben.
Im Feld todo schreibst du für "neu" und "anpassen" einen konkreten Auftrag (was genau zu ändern oder zu ergänzen ist, welche Zahlen gelten), bei "lassen" einen kurzen Grund.

Regeln:
- Die neuen Angaben des Coachs gelten immer und für alle Kapitel, die sie berühren. Prüfe auch, welche Kapitel indirekt betroffen sind (z. B. neuer Preis betrifft Leistungen, Marketing, Finanzen, Summary).
- Zahlen im Plan müssen mit dem Finanzplan übereinstimmen. Weicht ein Kapitel davon ab, ist es "anpassen".
- Die Executive Summary (summary) ist "anpassen" oder "neu", sobald irgendein anderes Kapitel geändert wird.
- glance = true, wenn sich Angaben für „Auf einen Blick“ ändern (Start, Standort, Rechtsform, Investitionen, Finanzierung, Personal …).
- Ändere nichts ohne Grund: Ein stimmiges Kapitel bleibt.
- Im Feld note sagst du dem Coach in zwei bis drei kurzen Sätzen (per du), was du anpasst und welche Angaben im ganzen Plan noch fehlen.
- Namen sind durch [Name] ersetzt. Keine Angaben zur Gesundheit.`;

const MAX_PARALLEL = 4;

/** Material für die Prüfung: alles auf einmal, die Kapitel vollständig */
/** Material zum ganzen Plan als Textblöcke (noch nicht pseudonymisiert) */
async function planMaterial(c: Coachee, earlier: string[]) {
  const plan = await planFor(c);
  const [items, meetings, notes] = await Promise.all([
    query<{ category: string; title: string; detail: string }>("SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND category <> 'gesundheit' ORDER BY category, created_at", [c.id]),
    query<{ held_on: string; title: string; notes: string; results: string }>("SELECT held_on, title, notes, results FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 15", [c.id]),
    loadChats(c.id),
  ]);
  const b = new Budget(110000);
  if (plan.title || c.goal) b.out.push(`Vorhaben: ${plan.title || c.goal}`);
  b.block("Notizen des Coachs zum ganzen Vorhaben", notes.vorhaben, 8000);
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

async function checkInput(c: Coachee, message: string, earlier: string[]) {
  const tail = message.trim() ? `Neue Angaben des Coachs: ${message.trim()}` : "Neue Angaben des Coachs: keine. Gleiche den ganzen Plan mit dem aktuellen Material und Finanzplan ab.";
  return pseudonymize([...(await planMaterial(c, earlier)), tail].join("\n\n"), [c.first_name, c.last_name]);
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

/** Läuft im Hintergrund; Fehler landen im Durchgang, nicht beim Aufrufer */
export async function executeRun(runId: string, user: User, c: Coachee, message: string) {
  const name = fullName(c);
  const fill = (s: string) => s.replaceAll("[Name]", name).trim();
  const progress: RunProgress = { phase: "pruefen", chapters: [] };
  try {
    const earlier = (await query<{ message: string }>("SELECT message FROM bp_runs WHERE coachee_id = $1 AND id <> $2 AND message <> '' AND undone_at IS NULL ORDER BY created_at", [c.id, runId])).map((r) => r.message);
    const check = await jsonResponse<{ note: string; glance: boolean; chapters: { key: string; action: RunAction; todo: string }[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "businessplan",
      schemaName: "bp_pruefung",
      schema: CHECK_SCHEMA,
      maxTokens: 6000,
      instructions: CHECK_INSTRUCTIONS,
      input: await checkInput(c, message, earlier),
    });
    const byKey = new Map(check.chapters.map((x) => [x.key, x]));
    progress.chapters = SECTIONS.map((s) => {
      const x = byKey.get(s.key);
      const action: RunAction = x?.action ?? "lassen";
      return { key: s.key, action, reason: fill(x?.todo ?? ""), status: action === "lassen" ? "fertig" : "wartet" };
    });
    // Wird irgendein Kapitel geändert, kommt die Summary immer mit
    const summary = progress.chapters.find((x) => x.key === "summary")!;
    if (summary.action === "lassen" && progress.chapters.some((x) => x.action !== "lassen")) Object.assign(summary, { action: "anpassen", status: "wartet", reason: "An die geänderten Kapitel angleichen." });
    progress.phase = "schreiben";
    await saveProgress(runId, progress);

    // Stand vorher für „Rückgängig“
    const plan = await planFor(c);
    const before: { sections: Record<string, SectionState>; glance: GlanceItem[] } = { sections: {}, glance: plan.glance };
    for (const x of progress.chapters) if (x.action !== "lassen") before.sections[x.key] = plan.sections[x.key];
    await query("UPDATE bp_runs SET before = $2 WHERE id = $1", [runId, JSON.stringify(before)]);

    const rewrite = async (x: RunChapter) => {
      x.status = "schreibt";
      await saveProgress(runId, progress);
      const order = `${x.action === "neu" ? "Schreib dieses Kapitel neu." : "Pass dieses Kapitel an und behalte, was weiter stimmt."} Auftrag aus der Prüfung des ganzen Plans: ${x.reason || "mit dem aktuellen Material abgleichen"}${message.trim() ? ` Neue Angaben des Coachs (gelten für den ganzen Plan): ${message.trim()}` : ""}`;
      try {
        const out = await jsonResponse<{ text: string; sources: string[]; note: string }>({
          coacheeId: c.id,
          userId: user.id,
          purpose: "businessplan",
          schemaName: "kapitel",
          schema: DRAFT_SCHEMA,
          maxTokens: 8000,
          instructions: instructions(x.key),
          input: await chapterContext(c, x.key, order),
        });
        const text = fill(out.text);
        if (!text) throw new Error("leer");
        const old = before.sections[x.key];
        const sources = out.sources.map(fill).filter(Boolean).join("\n") || old?.sources || "";
        await writeSection(c.id, x.key, user.id, text, sources);
        x.status = "fertig";
      } catch (e) {
        if (!(e instanceof AiError)) console.error("Businessplan-KI Kapitel", x.key, e);
        x.status = "fehler";
      }
      await saveProgress(runId, progress);
    };

    // Kapitel parallel, die Summary danach aus den neuen Kapiteln
    const queue = progress.chapters.filter((x) => x.action !== "lassen" && x.key !== "summary");
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
        for (let x = queue.shift(); x; x = queue.shift()) await rewrite(x);
      }),
    );
    if (summary.action !== "lassen") await rewrite(summary);

    let glance = 0;
    if (check.glance) {
      progress.phase = "blick";
      await saveProgress(runId, progress);
      try {
        const items = await proposeGlance(user, c);
        if (items.length) {
          const now = (await planFor(c)).glance;
          const map = new Map(items.map((g) => [g.label, g.value]));
          const next = [...now.map((g) => (map.has(g.label) ? { ...g, value: map.get(g.label)! } : g)), ...items.filter((g) => !now.some((n) => n.label === g.label))];
          await query("UPDATE business_plans SET glance = $2, updated_at = now() WHERE coachee_id = $1", [c.id, JSON.stringify(next)]);
          glance = items.length;
        }
      } catch (e) {
        if (!(e instanceof AiError)) console.error("Businessplan-KI Auf einen Blick", e);
      }
    }

    progress.phase = "fertig";
    const result: RunResult = { note: fill(check.note).slice(0, 2000), glance };
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
export async function createRun(user: User, c: Coachee, message: string): Promise<{ id: string; fresh: boolean; message: string }> {
  await query("UPDATE bp_runs SET status = 'fehler', error = 'Abgebrochen (der Server wurde neu gestartet). Bitte noch einmal starten.', finished_at = now() WHERE coachee_id = $1 AND status = 'laeuft' AND created_at <= now() - interval '20 minutes'", [c.id]);
  const running = await one<{ id: string }>("SELECT id FROM bp_runs WHERE coachee_id = $1 AND status = 'laeuft' ORDER BY created_at DESC LIMIT 1", [c.id]);
  if (running) return { id: running.id, fresh: false, message: "" };
  const text = message.trim().slice(0, 8000);
  const row = await one<{ id: string }>("INSERT INTO bp_runs (coachee_id, message, created_by) VALUES ($1, $2, $3) RETURNING id", [c.id, text, user.id]);
  return { id: row!.id, fresh: true, message: text };
}

const view = (r: { id: string; status: RunView["status"]; message: string; progress: unknown; result: unknown; error: string | null; undone_at: Date | null; created_at: Date }): RunView => ({
  id: r.id,
  status: r.status,
  message: r.message,
  progress: { phase: "pruefen", chapters: [], ...(r.progress as Partial<RunProgress>) },
  result: (r.result as RunResult | null) ?? null,
  error: r.error,
  undone: Boolean(r.undone_at),
  at: new Date(r.created_at).toISOString(),
});

export async function getRun(coacheeId: string, id?: string): Promise<RunView | null> {
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return null;
  await query("UPDATE bp_runs SET status = 'fehler', error = 'Abgebrochen (der Server wurde neu gestartet). Bitte noch einmal starten.', finished_at = now() WHERE coachee_id = $1 AND status = 'laeuft' AND created_at <= now() - interval '20 minutes'", [coacheeId]);
  const r = await one<Parameters<typeof view>[0]>(
    `SELECT id, status, message, progress, result, error, undone_at, created_at FROM bp_runs WHERE coachee_id = $1 ${id ? "AND id = $2" : ""} ORDER BY created_at DESC LIMIT 1`,
    id ? [coacheeId, id] : [coacheeId],
  );
  return r ? view(r) : null;
}

/** Die letzten Angaben des Coachs an die KI, neueste zuerst */
export async function recentRuns(coacheeId: string) {
  const rows = await query<Parameters<typeof view>[0]>("SELECT id, status, message, progress, result, error, undone_at, created_at FROM bp_runs WHERE coachee_id = $1 ORDER BY created_at DESC LIMIT 8", [coacheeId]);
  return rows.map(view);
}

/** Stand vor dem Durchgang wiederherstellen */
export async function undoRun(user: User, coacheeId: string, id: string) {
  const r = await one<{ before: unknown; undone_at: Date | null; status: string }>("SELECT before, undone_at, status FROM bp_runs WHERE id = $1 AND coachee_id = $2", [id, coacheeId]);
  if (!r || r.undone_at || r.status === "laeuft") return false;
  const before = r.before as { sections?: unknown; glance?: unknown };
  const sections = normalizeSections(before.sections ?? {});
  for (const key of Object.keys((before.sections as object) ?? {})) if (SECTIONS.some((s) => s.key === key)) await writeSection(coacheeId, key, user.id, sections[key].text, sections[key].sources);
  if (Array.isArray(before.glance)) await query("UPDATE business_plans SET glance = $2 WHERE coachee_id = $1", [coacheeId, JSON.stringify(normalizeGlance(before.glance))]);
  await query("UPDATE bp_runs SET undone_at = now() WHERE id = $1", [id]);
  return true;
}

// ---------- Chat zum ganzen Plan: Fragen, Analyse, Bewertung (ändert nichts) ----------

export const CHAT_KEY = "gesamt_chat";

const CHAT_INSTRUCTIONS = `Du bist erfahrene Gründungsberaterin und begutachtest den kompletten Businessplan einer Gründung in Deutschland, so wie ihn die fachkundige Stelle (Gründungszuschuss der Agentur für Arbeit) oder eine Bank prüfen würde. Der Gründungscoach stellt dir Fragen: Analyse, Bewertung, Schwachstellen, Tragfähigkeit, Plausibilität der Zahlen, was fehlt, wie man etwas verbessert.

- Antworte konkret und ehrlich, auch kritisch, per du an den Coach, auf Deutsch. Beziehe dich auf Kapitel (mit Nummer) und auf Zahlen aus dem Finanzplan.
- Prüfe auf Widersprüche zwischen Kapiteln und Finanzplan, unrealistische Annahmen (Preise, Mengen, Auslastung, Kosten, Lebensunterhalt), fehlende Angaben und Platzhalter.
- Bei einer Bewertung: kurze Gesamteinschätzung, dann Stärken, Schwächen und konkrete nächste Schritte. Eine Note oder Ampel nur, wenn der Coach danach fragt.
- Gliedere mit kurzen Absätzen, Aufzählungen mit „- “ und **fett** für das Wichtigste. Keine Floskeln, keine Wiederholung der Frage.
- Erfinde keine Fakten. Was nicht im Material steht, benennst du als offen.
- Du änderst den Plan hier nicht. Wenn sich etwas verbessern lässt, formuliere es so, dass der Coach es direkt als Auftrag übernehmen kann.
- Namen sind durch [Name] ersetzt. Keine Angaben zur Gesundheit.`;

export async function askPlan(user: User, c: Coachee, question: string) {
  const text = question.trim().slice(0, 4000);
  const history = (await loadChats(c.id)).chats[CHAT_KEY] ?? [];
  const earlier = (await query<{ message: string }>("SELECT message FROM bp_runs WHERE coachee_id = $1 AND message <> '' AND undone_at IS NULL ORDER BY created_at", [c.id])).map((r) => r.message);
  const talk = history.slice(-10).map((t) => `${t.role === "coach" ? "Coach" : "Du"}: ${t.text.slice(0, 3000)}`).join("\n\n");
  const input = pseudonymize(
    [...(await planMaterial(c, earlier)), talk ? `== Bisheriges Gespräch ==\n${talk}` : "", `Neue Frage des Coachs: ${text}`].filter(Boolean).join("\n\n"),
    [c.first_name, c.last_name],
  );
  const now = new Date().toISOString();
  let turns = await appendTurns(c.id, CHAT_KEY, user.id, [{ id: randomUUID(), role: "coach", text, at: now }]);
  const out = await jsonResponse<{ answer: string }>({
    coacheeId: c.id,
    userId: user.id,
    purpose: "businessplan",
    schemaName: "bp_chat",
    schema: { type: "object", additionalProperties: false, required: ["answer"], properties: { answer: { type: "string" } } },
    maxTokens: 6000,
    instructions: CHAT_INSTRUCTIONS,
    input,
  });
  const answer = out.answer.replaceAll("[Name]", fullName(c)).trim();
  if (answer) turns = await appendTurns(c.id, CHAT_KEY, user.id, [{ id: randomUUID(), role: "ki", text: answer.slice(0, 20000), at: new Date().toISOString() }]);
  return turns;
}
