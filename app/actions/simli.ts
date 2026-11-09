"use server";
import { revalidatePath } from "next/cache";
import { audit, requireCoach } from "@/lib/auth";
import { SIMLI_FACES, saveSimliKey, simliToken } from "@/lib/simli";

export type SimliResult = { ok: true; message: string } | { ok: false; error: string };

/** Simli-Schlüssel prüfen und verschlüsselt speichern (leer = entfernen) */
export async function saveSimli(key: string): Promise<SimliResult> {
  const coach = await requireCoach();
  const k = key.trim();
  if (!k) {
    await saveSimliKey(null);
    await audit(coach.id, "simli_key_entfernt");
    revalidatePath("/coach/freigaben");
    return { ok: true, message: "Schlüssel entfernt. Im Training ist wieder die gezeichnete Person zu sehen." };
  }
  if (k.length > 300 || /\s/.test(k)) return { ok: false, error: "Das sieht nicht wie ein Simli-Schlüssel aus. Bitte nur den Schlüssel einfügen." };
  try {
    await simliToken(k, SIMLI_FACES.f);
  } catch (e) {
    const m = (e as Error).message;
    if (/Simli (401|403)/.test(m)) return { ok: false, error: "Simli lehnt diesen Schlüssel ab. Bitte in Simli noch einmal kopieren." };
    if (/Simli 402|credit|balance|minutes/i.test(m)) return { ok: false, error: "Der Schlüssel stimmt, aber bei Simli ist kein Guthaben mehr frei." };
    return { ok: false, error: "Simli ist gerade nicht erreichbar oder lehnt ab. Bitte gleich noch einmal versuchen." };
  }
  await saveSimliKey(k);
  await audit(coach.id, "simli_key_gesetzt");
  revalidatePath("/coach/freigaben");
  return { ok: true, message: "Schlüssel funktioniert und ist gespeichert. Im Interview-Training sitzt jetzt ein echt wirkender Mensch gegenüber." };
}
