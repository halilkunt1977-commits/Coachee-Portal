"use server";
import { revalidatePath } from "next/cache";
import { audit, requireCoach } from "@/lib/auth";
import { startBackup } from "@/lib/backup/run";
import type { FormState } from "@/lib/forms";

/** „Jetzt sichern“: läuft im Hintergrund weiter, die Seite zeigt den Fortschritt */
export async function backupNow(): Promise<FormState> {
  const coach = await requireCoach();
  const r = await startBackup({ trigger: "manuell", userId: coach.id });
  if (!r.ok) return { error: r.error };
  await audit(coach.id, "backup_started");
  revalidatePath("/coach/datensicherung");
  return { ok: "Sicherung gestartet. Das Ergebnis steht gleich unten bei „Letzte Läufe“." };
}
