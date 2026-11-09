import { encrypt, decrypt } from "./crypto";
import { one, query } from "./db";

/*
 * Schlüssel für das echt wirkende Gegenüber im Interview-Training (Simli). Entweder SIMLI_API_KEY in Coolify oder
 * vom Coach im Portal eingetragen (verschlüsselt in app_settings). Der Schlüssel verlässt den Server nie.
 */
export const SIMLI_FACES = {
  f: process.env.SIMLI_FACE_F || "bf13113a-355a-4d97-8b90-4edccd1da7b2",
  m: process.env.SIMLI_FACE_M || "a36d66df-a23d-4569-996b-d0e990019857",
};

export async function simliKey(): Promise<string | null> {
  if (process.env.SIMLI_API_KEY) return process.env.SIMLI_API_KEY;
  const row = await one<{ value: string }>("SELECT value FROM app_settings WHERE key = 'simli_key'");
  if (!row) return null;
  try {
    return decrypt(row.value);
  } catch {
    return null;
  }
}

export const simliFromEnv = () => Boolean(process.env.SIMLI_API_KEY);

export async function saveSimliKey(key: string | null) {
  if (!key) return void (await query("DELETE FROM app_settings WHERE key = 'simli_key'"));
  await query(
    "INSERT INTO app_settings (key, value) VALUES ('simli_key', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [encrypt(key)],
  );
}

/** Sitzungsmarke bei Simli holen; wirft mit Simlis Antwort, wenn der Schlüssel abgelehnt wird */
export async function simliToken(key: string, faceId: string) {
  const res = await fetch("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-simli-api-key": key },
    // eine Sitzung je Gespräch; nach 3 Minuten ohne Ton beendet Simli sie selbst (spart Minuten)
    body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: 2400, maxIdleTime: 180 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Simli ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { session_token?: string };
  if (!data.session_token) throw new Error("Simli: keine Sitzungsmarke");
  return data.session_token;
}
