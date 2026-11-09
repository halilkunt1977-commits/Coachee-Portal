import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { decryptBuffer, encryptBuffer, sha256 } from "./crypto";

/*
 * Natürliche Stimme für die Fragen im Interview-Training. Zuerst ElevenLabs (dieselben Stimmen wie die Begrüßung),
 * sonst die Sprachausgabe von OpenAI; geht beides nicht, liest der Browser selbst vor. Übermittelt wird nur der
 * Fragetext (ohne Namen). Fertige Aufnahmen liegen verschlüsselt in DATA_DIR/stimme und werden wiederverwendet.
 */
export type VoiceLang = "de" | "tr";
/** f = Interviewerin, m = Interviewer */
export type VoiceGender = "f" | "m";

// Fertige Stimmen von ElevenLabs (sprechen mit eleven_multilingual_v2 auch Deutsch und Türkisch), über Umgebungsvariablen änderbar
const EL_VOICES: Record<VoiceGender, string> = {
  f: process.env.ELEVENLABS_VOICE_F || "EXAVITQu4vr4xnSDxMaL",
  m: process.env.ELEVENLABS_VOICE_M || "JBFqnCBsd6RMkjVDRZzb",
};
const EL_MODEL = () => process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
// OpenAI: erst das neuere Modell mit Sprechanweisung, sonst das ältere
const OA_TRIES: Record<VoiceGender, { model: string; voice: string }[]> = {
  f: [{ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: process.env.OPENAI_TTS_VOICE_F || "coral" }, { model: "tts-1", voice: "nova" }],
  m: [{ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: process.env.OPENAI_TTS_VOICE_M || "ash" }, { model: "tts-1", voice: "onyx" }],
};

const dir = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "stimme");
const failedUntil = new Map<string, number>();
const running = new Map<string, Promise<Buffer | null>>();

async function elevenlabs(text: string, gender: VoiceGender): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(EL_VOICES[gender])}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    // etwas lebendiger als die Standardwerte, damit es wie ein Gesprächspartner klingt
    body: JSON.stringify({ text, model_id: EL_MODEL(), voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.error("[stimme] ElevenLabs", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const data = Buffer.from(await res.arrayBuffer());
  return data.length ? data : null;
}

async function openaiVoice(text: string, lang: VoiceLang, gender: VoiceGender): Promise<Buffer | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const style =
    lang === "tr"
      ? `Bir mülakatta soru soran, sıcak ve profesyonel bir ${gender === "f" ? "kadın" : "erkek"} insan kaynakları uzmanı gibi konuş. Doğal Türkçe, sakin tempo.`
      : gender === "f"
        ? "Sprich wie eine freundliche, professionelle Personalerin im Vorstellungsgespräch. Natürliches Hochdeutsch, ruhiges Tempo."
        : "Sprich wie ein freundlicher, professioneller Personaler im Vorstellungsgespräch. Natürliches Hochdeutsch, ruhiges Tempo."
  for (const t of OA_TRIES[gender]) {
    try {
      const res = await client.audio.speech.create({
        model: t.model,
        voice: t.voice,
        input: text,
        ...(t.model.startsWith("gpt-") ? { instructions: style } : {}),
        response_format: "mp3",
      } as Parameters<typeof client.audio.speech.create>[0]);
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length) return data;
    } catch (e) {
      console.error("[stimme] OpenAI", t.model, (e as Error).message?.slice(0, 200));
    }
  }
  return null;
}

export const voiceEnabled = () => Boolean(process.env.ELEVENLABS_API_KEY || process.env.OPENAI_API_KEY);

/** MP3 des Textes oder null (dann liest der Browser vor) */
export async function speech(text: string, lang: VoiceLang, gender: VoiceGender = "f"): Promise<Buffer | null> {
  const clean = text.trim().slice(0, 600);
  if (!clean || !voiceEnabled()) return null;
  const engine = process.env.ELEVENLABS_API_KEY ? `el|${EL_VOICES[gender]}|${EL_MODEL()}` : `oa|${OA_TRIES[gender][0].model}|${OA_TRIES[gender][0].voice}`;
  const name = `${sha256(`${engine}|${lang}|${clean}`).slice(0, 32)}.bin`;
  const file = path.join(dir(), name);
  const stored = await readFile(file).then(decryptBuffer).catch(() => null);
  if (stored) return stored;
  if ((failedUntil.get(name) ?? 0) > Date.now()) return null;
  let job = running.get(name);
  if (!job) {
    job = (async () => {
      let audio = await elevenlabs(clean, gender).catch((e) => (console.error("[stimme] ElevenLabs", (e as Error).message), null));
      audio ??= await openaiVoice(clean, lang, gender).catch((e) => (console.error("[stimme] OpenAI", (e as Error).message), null));
      if (!audio) {
        failedUntil.set(name, Date.now() + 10 * 60_000);
        return null;
      }
      await mkdir(dir(), { recursive: true });
      await writeFile(file, encryptBuffer(audio)).catch(() => undefined);
      return audio;
    })().finally(() => running.delete(name));
    running.set(name, job);
  }
  return job;
}
