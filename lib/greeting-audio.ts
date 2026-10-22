import "server-only";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBuffer, encryptBuffer, sha256 } from "./crypto";
import { greetingText, type VideoLanguage } from "./erklaervideo";

/*
 * Gesprochene Begrüßung vor dem Erklärvideo („Hallo Stefan, …“) über die Sprachausgabe von ElevenLabs.
 * Übermittelt wird nur der Begrüßungssatz mit dem Vornamen, nie andere Angaben aus der Akte.
 * Erzeugt wird beim ersten Abruf; danach liegt die MP3 verschlüsselt in DATA_DIR/begruessung, wie die anderen Dateien.
 * Der Dateiname enthält eine Prüfsumme des Textes: Ändert sich der Vorname (oder der Text), entsteht eine neue Aufnahme.
 *
 * ELEVENLABS_API_KEY fehlt oder der Abruf scheitert: kein Ton, der Player zeigt die Begrüßung dann als Text.
 * Nur lokal (nicht in production): ELEVENLABS_FAKE=1 liefert drei Sekunden Stille statt eines echten Abrufs.
 */

const VOICES: Record<VideoLanguage, string> = {
  de: process.env.ELEVENLABS_VOICE_DE || "yamcvgNdKmgh0Ron7Bsz",
  tr: process.env.ELEVENLABS_VOICE_TR || "z2lmH5kDzVyopSU8HCxO",
};
const model = () => process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const fake = () => process.env.NODE_ENV !== "production" && process.env.ELEVENLABS_FAKE === "1";

export const greetingVoiceEnabled = () => Boolean(process.env.ELEVENLABS_API_KEY) || fake();

const dir = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "begruessung");
const prefix = (coacheeId: string, lang: VideoLanguage) => `${coacheeId}-${lang}-`;

// Fehlgeschlagene Abrufe nicht bei jedem Seitenaufruf wiederholen
const failedUntil = new Map<string, number>();
const running = new Map<string, Promise<Buffer | null>>();

async function synthesize(text: string, lang: VideoLanguage): Promise<Buffer | null> {
  if (fake()) return Buffer.from(SILENT_MP3, "base64");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICES[lang])}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Nur Status und Fehlertext von ElevenLabs ins Protokoll, nie den Namen
    console.error("[begruessung] ElevenLabs", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const data = Buffer.from(await res.arrayBuffer());
  return data.length > 0 ? data : null;
}

/** MP3 der Begrüßung für diesen Coachee und diese Sprache, oder null (dann ohne Ton) */
export async function greetingAudio(coacheeId: string, firstName: string, lang: VideoLanguage): Promise<Buffer | null> {
  if (!greetingVoiceEnabled()) return null;
  const text = greetingText(firstName, lang);
  const hash = sha256(`${fake() ? "stille" : `${VOICES[lang]}|${model()}`}|${text}`).slice(0, 24);
  const name = `${prefix(coacheeId, lang)}${hash}.bin`;
  const file = path.join(dir(), name);
  const stored = await readFile(file).then(decryptBuffer).catch(() => null);
  if (stored) return stored;

  if ((failedUntil.get(name) ?? 0) > Date.now()) return null;
  let job = running.get(name);
  if (!job) {
    job = (async () => {
      const audio = await synthesize(text, lang).catch((e) => {
        console.error("[begruessung]", (e as Error).name, (e as Error).message);
        return null;
      });
      if (!audio) {
        failedUntil.set(name, Date.now() + 10 * 60_000);
        return null;
      }
      await mkdir(dir(), { recursive: true });
      // Alte Aufnahmen (z. B. mit dem früheren Vornamen) entfernen
      await removeGreetingAudio(coacheeId, lang);
      await writeFile(file, encryptBuffer(audio));
      return audio;
    })().finally(() => running.delete(name));
    running.set(name, job);
  }
  return job;
}

/** Gespeicherte Begrüßungen eines Coachees löschen (beim Löschen der Akte), optional nur eine Sprache */
export async function removeGreetingAudio(coacheeId: string, lang?: VideoLanguage) {
  const start = lang ? prefix(coacheeId, lang) : `${coacheeId}-`;
  const names = await readdir(dir()).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(start)).map((n) => rm(path.join(dir(), n), { force: true })));
}

/** Drei Sekunden Stille (MP3, mit ffmpeg erzeugt) für lokale Tests mit ELEVENLABS_FAKE=1 */
const SILENT_MP3 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NYwAAAAAAAAAAAAEluZm8AAAAPAAAAVgAADMwAEBMWGRweISEkJyotLzIyNTg7PUBDQ0ZJS05RVFRXWlxfYmVlaGptcHN2dnh7foGEh4mJjI+SlZeamp2go6Woq6uusbS2uby8v8LEx8rNzdDS1djb3t7h4+bp7O/v8fT3+v3/AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDwAAAAAAAAAzMBiCkjgAAAAAAAAAAAAAA//MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVUxB//MYxBcAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxC4AAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxEUAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxFwAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxHMAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxIoAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxKEAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxLgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxM8AAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOYAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVUxB//MYxOgAAANIAAAAAE1FMy4xMDBVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MYxOgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
