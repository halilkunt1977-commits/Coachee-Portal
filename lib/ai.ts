import "server-only";
import OpenAI from "openai";
import type { Coachee } from "./access";
import type { User } from "./auth";
import { NOT_RELEASED, defaultMonthlyLimit, hasFeature, type FeatureKey } from "./features";
import { one, query } from "./db";

/*
 * KI über OpenAI (wie bei gründarium.de). OPENAI_API_KEY in Coolify, Modelle über OPENAI_MODEL und
 * OPENAI_TRANSCRIBE_MODEL änderbar. Namen von Coachees werden vor dem Senden durch Platzhalter ersetzt.
 */
// Nur für lokale Tests ohne Schlüssel: AI_MOCK=1 liefert feste Antworten. In der fertigen App (NODE_ENV=production) nie aktiv.
const mockAi = () => process.env.NODE_ENV !== "production" && process.env.AI_MOCK === "1";
export const aiEnabled = () => Boolean(process.env.OPENAI_API_KEY) || mockAi();
const MODEL = () => process.env.OPENAI_MODEL || "gpt-5.6-terra";
const TRANSCRIBE_MODEL = () => process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe";

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export class AiError extends Error {}
/** Meldung für den Coach, wenn die KI nicht eingerichtet ist (Einrichtung: OPENAI_API_KEY in den Einstellungen der App) */
export const AI_MISSING = "Die KI ist noch nicht eingerichtet. Der Zugang zur KI muss auf dem Server hinterlegt werden.";

/** Namen im Text durch Platzhalter ersetzen, damit die KI keine Klarnamen bekommt. */
export function pseudonymize(text: string, names: string[]) {
  let out = text;
  for (const name of names.filter((n) => n && n.length > 1)) {
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[Name]");
  }
  return out;
}

// Coachees sollen nicht merken, dass hinter den Hilfen eine KI steckt (Wunsch des Coachs): Meldungen an sie ohne „KI“.
type AiCheck =
  /** Schreibhilfen, Assistent und Vorschläge gibt es nur für den Coach. Coachees sehen davon nichts. */
  | { coachOnly: true }
  /** Zusatzfunktion, die der Coach dem Coachee freigeben muss (lib/features.ts). coachee: Zeile, falls schon geladen. */
  | { feature: FeatureKey; coachee?: Pick<Coachee, "features" | "ai_monthly_limit"> | null };

/**
 * Darf dieser Aufruf an die KI? Der Coach immer. Coachees nur mit freigegebener Zusatzfunktion und bis zur Monatsgrenze
 * (eigene Grenze in der Akte, sonst AI_COACHEE_MONTHLY_LIMIT, Standard 40 Aufrufe).
 */
export async function assertAiAllowed(user: User, opts: AiCheck) {
  if (user.role !== "coach") {
    if (!("feature" in opts)) throw new AiError("Diese Funktion steht nur deinem Coach zur Verfügung.");
    const c = opts.coachee ?? (await one<Pick<Coachee, "features" | "ai_monthly_limit">>("SELECT features, ai_monthly_limit FROM coachees WHERE user_id = $1", [user.id]));
    if (!c || !hasFeature(c, opts.feature)) throw new AiError(NOT_RELEASED);
    if (!aiEnabled()) throw new AiError("Diese Hilfe ist gerade nicht verfügbar. Dein Coach hilft dir gern weiter.");
    const limit = c.ai_monthly_limit ?? defaultMonthlyLimit();
    const row = await one<{ n: number }>("SELECT count(*)::int AS n FROM ai_usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())", [user.id]);
    if ((row?.n ?? 0) >= limit) throw new AiError("Die Hilfe ist für diesen Monat aufgebraucht. Dein Coach hilft dir gern weiter.");
    return;
  }
  if (!aiEnabled()) throw new AiError(AI_MISSING);
}

type Usage = { coacheeId: string | null; userId: string; purpose: string };

async function logUsage(u: Usage, model: string, input = 0, output = 0) {
  await query("INSERT INTO ai_usage (coachee_id, user_id, purpose, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5,$6)", [u.coacheeId, u.userId, u.purpose, model, input, output]).catch(() => {});
}

/** Antwort als JSON nach festem Schema (Structured Outputs). */
export async function jsonResponse<T>(opts: Usage & { instructions: string; input: string; schemaName: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<T> {
  if (!aiEnabled()) throw new AiError(AI_MISSING);
  if (mockAi()) {
    const { mockJson } = await import("./ai-mock");
    await logUsage(opts, "mock");
    return mockJson(opts.schemaName, opts.input) as T;
  }
  const model = MODEL();
  const response = await openai().responses.create({
    model,
    instructions: opts.instructions,
    input: opts.input,
    reasoning: { effort: "low" },
    max_output_tokens: opts.maxTokens ?? 6000,
    store: false,
    text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
  });
  await logUsage(opts, model, response.usage?.input_tokens, response.usage?.output_tokens);
  try {
    return JSON.parse(response.output_text) as T;
  } catch {
    throw new AiError("Es kam keine verwertbare Antwort. Bitte noch einmal versuchen.");
  }
}

/**
 * Foto (z. B. abfotografiertes Angebot, Notizzettel, Flyer) lesen: aller lesbare Text und eine kurze Beschreibung.
 * Das Bild wird nur für diese Anfrage gesendet und bei OpenAI nicht gespeichert.
 */
export async function readImage(data: Buffer, mime: string, usage: Usage): Promise<string> {
  if (!aiEnabled()) throw new AiError(AI_MISSING);
  if (mockAi()) {
    await logUsage(usage, "mock");
    return `Foto (Test ohne KI), ${Math.round(data.length / 1024)} KB.`;
  }
  const model = MODEL();
  const response = await openai().responses.create({
    model,
    instructions:
      "Lies das Bild für einen Gründungscoach aus. Gib zuerst allen lesbaren Text wörtlich wieder (Tabellen als Zeilen mit Spalten, Zahlen genau), danach in ein bis drei Sätzen, was zu sehen ist (z. B. Angebot, Preisliste, Flyer, Ladenlokal, Notizzettel). Beschreibe keine Personen. Lass Angaben zur Gesundheit weg. Antworte auf Deutsch, ohne Vorrede.",
    input: [{ role: "user", content: [{ type: "input_image", image_url: `data:${mime};base64,${data.toString("base64")}`, detail: "high" }] }],
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    store: false,
  });
  await logUsage(usage, model, response.usage?.input_tokens, response.usage?.output_tokens);
  return response.output_text.trim();
}

/** Sprache zu Text. Die Aufnahme wird nur im Arbeitsspeicher gehalten und nirgends abgelegt. */
export async function transcribe(file: File, usage: Usage) {
  if (!aiEnabled()) throw new AiError(AI_MISSING);
  const model = TRANSCRIBE_MODEL();
  const result = await openai().audio.transcriptions.create({ file, model, language: "de", response_format: "json" });
  await logUsage(usage, model);
  return result.text;
}

/** Antwort Stück für Stück (für den Chat). Liefert Textteile, protokolliert am Ende den Verbrauch. */
export async function* streamText(opts: Usage & { instructions: string; messages: { role: "user" | "assistant"; content: string }[]; maxTokens?: number; signal?: AbortSignal }) {
  if (!aiEnabled()) throw new AiError(AI_MISSING);
  const model = MODEL();
  const stream = await openai().responses.create(
    {
      model,
      instructions: opts.instructions,
      input: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      reasoning: { effort: "low" },
      max_output_tokens: opts.maxTokens ?? 4000,
      store: false,
      stream: true,
    },
    { signal: opts.signal },
  );
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;
  try {
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
      else if (event.type === "response.completed") usage = event.response.usage ?? undefined;
      else if (event.type === "error") throw new AiError("Die Antwort wurde abgebrochen. Bitte noch einmal versuchen.");
    }
  } finally {
    await logUsage(opts, model, usage?.input_tokens, usage?.output_tokens);
  }
}
