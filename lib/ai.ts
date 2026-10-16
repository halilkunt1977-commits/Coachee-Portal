import "server-only";
import OpenAI from "openai";
import type { User } from "./auth";
import { one, query } from "./db";

/*
 * KI über OpenAI (wie bei gründarium.de). OPENAI_API_KEY in Coolify, Modelle über OPENAI_MODEL und
 * OPENAI_TRANSCRIBE_MODEL änderbar. Namen von Coachees werden vor dem Senden durch Platzhalter ersetzt.
 */
export const aiEnabled = () => Boolean(process.env.OPENAI_API_KEY);
const MODEL = () => process.env.OPENAI_MODEL || "gpt-5.6-terra";
const TRANSCRIBE_MODEL = () => process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe";

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export class AiError extends Error {}

/** Namen im Text durch Platzhalter ersetzen, damit die KI keine Klarnamen bekommt. */
export function pseudonymize(text: string, names: string[]) {
  let out = text;
  for (const name of names.filter((n) => n && n.length > 1)) {
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[Name]");
  }
  return out;
}

/** Coachees dürfen die KI nur begrenzt nutzen (AI_COACHEE_MONTHLY_LIMIT Aufrufe pro Monat, Standard 40). */
export async function assertAiAllowed(user: User) {
  if (!aiEnabled()) throw new AiError("Die KI ist noch nicht eingerichtet (OPENAI_API_KEY fehlt).");
  if (user.role === "coach") return;
  const limit = Number(process.env.AI_COACHEE_MONTHLY_LIMIT || 40);
  const row = await one<{ n: number }>("SELECT count(*)::int AS n FROM ai_usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())", [user.id]);
  if ((row?.n ?? 0) >= limit) throw new AiError("Die KI-Hilfe ist für diesen Monat aufgebraucht. Dein Coach hilft dir gern weiter.");
}

type Usage = { coacheeId: string | null; userId: string; purpose: string };

async function logUsage(u: Usage, model: string, input = 0, output = 0) {
  await query("INSERT INTO ai_usage (coachee_id, user_id, purpose, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5,$6)", [u.coacheeId, u.userId, u.purpose, model, input, output]).catch(() => {});
}

/** Antwort als JSON nach festem Schema (Structured Outputs). */
export async function jsonResponse<T>(opts: Usage & { instructions: string; input: string; schemaName: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<T> {
  if (!aiEnabled()) throw new AiError("Die KI ist noch nicht eingerichtet (OPENAI_API_KEY fehlt).");
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
    throw new AiError("Die KI hat keine verwertbare Antwort geliefert. Bitte noch einmal versuchen.");
  }
}

/** Sprache zu Text. Die Aufnahme wird nur im Arbeitsspeicher gehalten und nirgends abgelegt. */
export async function transcribe(file: File, usage: Usage) {
  if (!aiEnabled()) throw new AiError("Die KI ist noch nicht eingerichtet (OPENAI_API_KEY fehlt).");
  const model = TRANSCRIBE_MODEL();
  const result = await openai().audio.transcriptions.create({ file, model, language: "de", response_format: "json" });
  await logUsage(usage, model);
  return result.text;
}
