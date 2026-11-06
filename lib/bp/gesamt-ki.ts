import "server-only";
import { fullName, type Coachee } from "../access";
import { AiError, jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { one, query } from "../db";
import { categoryLabel } from "../profile";
import { Budget, chapterContext, loadChats, withoutHealth } from "./context";
import { financeSummary } from "./finance";
import { DRAFT_SCHEMA, instructions, proposeGlance } from "./schreibhilfe";
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

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "chapters", "glance"],
  properties: {
    answer: { type: "string" },
    glance: { type: "boolean" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "action", "todo", "rating", "assessment", "questions"],
        properties: {
          key: { type: "string", enum: SECTIONS.map((s) => s.key) },
          action: { type: "string", enum: ["neu", "anpassen", "lassen"] },
          todo: { type: "string" },
          rating: { type: "string", enum: ["gut", "ausbaufaehig", "fehlt"] },
          assessment: { type: "string" },
          questions: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const CHECK_INSTRUCTIONS = `Du bist erfahrene Gründungsberaterin und betreust zusammen mit dem Gründungscoach den kompletten Businessplan einer Gründung in Deutschland (Vorlage des Coachs, 14 Kapitel, eingereicht bei der fachkundigen Stelle für den Gründungszuschuss und bei Banken). Ihr arbeitet in einem Chat: Der Coach schreibt oder spricht dir Nachrichten. Das können Fragen sein (Analyse, Bewertung, Plausibilität, „was fehlt?“), neue Angaben, Zahlen, Daten und Fakten, Antworten auf deine Rückfragen, oder Aufträge („schreib Kapitel 5 neu“, „gleiche alles mit dem Finanzplan ab“, „schätze realistische Zahlen“).

Entscheide zuerst, was der Coach will:
- Eine reine Frage oder Bitte um Bewertung: Beantworte sie im Feld answer und setze alle Kapitel auf "lassen". Ändere den Plan nur, wenn der Coach es will.
- Neue Angaben, Antworten auf Rückfragen, Zahlen, Fakten oder ein Auftrag: Prüfe den ganzen Plan und entscheide für JEDES der 14 Kapitel, ob es geändert wird. Neue Angaben gelten für alle Kapitel, die sie direkt oder indirekt berühren (z. B. neuer Preis betrifft Leistungen, Marketing, Finanzen und Summary).
- Eine leere Nachricht heißt: alles mit dem aktuellen Material abgleichen und verbessern.

Für jedes Kapitel:
- action: "neu" (leer, sehr dünn oder veraltet), "anpassen" (im Kern gut, aber etwas stimmt nicht mehr, fehlt, widerspricht dem Finanzplan oder anderen Kapiteln, oder das Material beantwortet inzwischen einen Platzhalter in eckigen Klammern), "lassen" (stimmig oder keine Änderung gewünscht).
- todo: bei "neu"/"anpassen" ein konkreter Schreibauftrag (was genau, welche Zahlen und Fakten gelten, was ergänzt wird), sonst ein kurzer Grund.
- rating und assessment: deine ehrliche Bewertung des Kapitels in seinem Stand NACH deinen Änderungen, wie die fachkundige Stelle es sehen würde: "gut", "ausbaufaehig" oder "fehlt"; assessment in einem Satz.
- questions: Was im Kapitel noch fehlt und nur der Coach oder die gründende Person beantworten kann, als konkrete, kurze Rückfragen (höchstens drei, z. B. „Wie viele Malerbetriebe gibt es im Landkreis Fürth und woher stammt die Zahl?“). Keine Fragen, deren Antwort schon im Material steht. Bei einem guten Kapitel eine leere Liste.

Regeln:
- Zahlen im Plan müssen mit dem Finanzplan übereinstimmen. Weicht ein Kapitel ab, ist es "anpassen".
- Die Executive Summary (summary) wird angepasst, sobald ein anderes Kapitel geändert wird.
- glance = true, wenn sich Angaben für „Auf einen Blick“ ändern (Start, Standort, Rechtsform, Investitionen, Finanzierung, Personal …).
- Ändere nichts ohne Grund: Ein stimmiges Kapitel bleibt.
- Bittet der Coach ausdrücklich darum, Zahlen, Daten oder Fakten zu schätzen oder zu ergänzen, darfst du realistische Annahmen vorschlagen; sag im todo, dass sie im Text als Annahme gekennzeichnet werden. Sonst erfindest du nichts.
- answer: Antwort an den Coach, per du, auf Deutsch, ohne Floskeln. Bei einer Frage ausführlich und konkret mit Bezug auf Kapitel (mit Nummer) und Zahlen aus dem Finanzplan; gliedere mit kurzen Absätzen, „- “-Listen und **fett**. Bei Änderungen zwei bis drei Sätze: was du änderst und was noch fehlt. Die Rückfragen stehen schon bei den Kapiteln, wiederhole sie nicht einzeln.
- Beziehe dich auf das bisherige Gespräch, wenn der Coach etwa „mach das so“ schreibt.
- Namen sind durch [Name] ersetzt. Keine Angaben zur Gesundheit.`;

const MAX_PARALLEL = 4;

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

const RATINGS = new Set(["gut", "ausbaufaehig", "fehlt"]);

/** Läuft im Hintergrund; Fehler landen im Durchgang, nicht beim Aufrufer */
export async function executeRun(runId: string, user: User, c: Coachee, message: string) {
  const name = fullName(c);
  const fill = (s: string) => s.replaceAll("[Name]", name).trim();
  const progress: RunProgress = { phase: "pruefen", chapters: [] };
  try {
    const earlier = (await query<{ message: string }>("SELECT message FROM bp_runs WHERE coachee_id = $1 AND id <> $2 AND kind = 'aendern' AND message <> '' AND undone_at IS NULL ORDER BY created_at", [c.id, runId])).map((r) => r.message);
    const files = (await one<{ files: string[] }>("SELECT files FROM bp_runs WHERE id = $1", [runId]))?.files ?? [];
    const attached = await attachedDocs(c.id, files);
    const check = await jsonResponse<{ answer: string; glance: boolean; chapters: { key: string; action: RunAction; todo: string; rating: string; assessment: string; questions: string[] }[] }>({
      coacheeId: c.id,
      userId: user.id,
      purpose: "businessplan",
      schemaName: "bp_pruefung",
      schema: CHECK_SCHEMA,
      maxTokens: 12000,
      instructions: CHECK_INSTRUCTIONS,
      input: await checkInput(c, runId, message, earlier, attached),
    });
    const byKey = new Map(check.chapters.map((x) => [x.key, x]));
    const review: ChapterReview[] = SECTIONS.flatMap((s) => {
      const x = byKey.get(s.key);
      if (!x) return [];
      return [{ key: s.key, rating: (RATINGS.has(x.rating) ? x.rating : "ausbaufaehig") as ChapterReview["rating"], text: fill(x.assessment ?? "").slice(0, 600), questions: (x.questions ?? []).map(fill).filter(Boolean).slice(0, 3).map((q) => q.slice(0, 400)) }];
    });
    progress.chapters = SECTIONS.map((s) => {
      const x = byKey.get(s.key);
      const action: RunAction = x?.action ?? "lassen";
      return { key: s.key, action, reason: fill(x?.todo ?? ""), status: action === "lassen" ? "fertig" : "wartet" };
    });
    const note = fill(check.answer).slice(0, 20000);
    const changing = progress.chapters.some((x) => x.action !== "lassen");

    // Nur eine Frage: antworten, nichts ändern
    if (!changing && !check.glance) {
      progress.phase = "fertig";
      const result: RunResult = { note, glance: 0, review };
      await query("UPDATE bp_runs SET status = 'fertig', kind = 'frage', progress = $2, result = $3, finished_at = now() WHERE id = $1", [runId, JSON.stringify(progress), JSON.stringify(result)]);
      return;
    }

    // Wird irgendein Kapitel geändert, kommt die Summary immer mit
    const summary = progress.chapters.find((x) => x.key === "summary")!;
    if (summary.action === "lassen" && changing) Object.assign(summary, { action: "anpassen", status: "wartet", reason: "An die geänderten Kapitel angleichen." });
    progress.phase = "schreiben";
    await saveProgress(runId, progress);

    // Stand vorher für „Verwerfen“ und die markierten Änderungen
    const plan = await planFor(c);
    const before: { sections: Record<string, SectionState>; glance: GlanceItem[] } = { sections: {}, glance: plan.glance };
    for (const x of progress.chapters) if (x.action !== "lassen") before.sections[x.key] = plan.sections[x.key];
    await query("UPDATE bp_runs SET before = $2 WHERE id = $1", [runId, JSON.stringify(before)]);

    const rewrite = async (x: RunChapter) => {
      x.status = "schreibt";
      await saveProgress(runId, progress);
      const order = `${x.action === "neu" ? "Schreib dieses Kapitel neu." : "Überarbeite dieses Kapitel und behalte, was weiter stimmt."} Auftrag aus der Prüfung des ganzen Plans: ${x.reason || "mit dem aktuellen Material abgleichen und konkreter machen"}${message.trim() ? `\nNeue Nachricht des Coachs (gilt für den ganzen Plan): ${message.trim()}` : ""}${attached.length ? `\nMitgegebene Dateien und Fotos des Coachs (nutze, was zu diesem Kapitel passt):\n${attachedBlock(attached, 12000)}` : ""}`;
      try {
        const out = await jsonResponse<{ text: string; sources: string[]; note: string }>({
          coacheeId: c.id,
          userId: user.id,
          purpose: "businessplan",
          schemaName: "kapitel",
          schema: DRAFT_SCHEMA,
          maxTokens: 10000,
          instructions: instructions(x.key),
          input: await chapterContext(c, x.key, order),
        });
        const text = fill(out.text);
        if (!text) throw new Error("leer");
        const old = before.sections[x.key];
        const sources = out.sources.map(fill).filter(Boolean).join("\n") || old?.sources || "";
        await writeSection(c.id, x.key, user.id, text, sources);
        await saveAfter(runId, x.key, text.slice(0, 60000));
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
          await saveAfter(runId, BLICK_KEY, next);
          glance = items.length;
        }
      } catch (e) {
        if (!(e instanceof AiError)) console.error("Businessplan-KI Auf einen Blick", e);
      }
    }

    progress.phase = "fertig";
    const result: RunResult = { note, glance, review };
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
