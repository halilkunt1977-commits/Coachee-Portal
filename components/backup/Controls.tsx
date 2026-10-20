"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ActionForm } from "@/components/akte/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { backupNow } from "@/app/actions/datensicherung";

export function BackupNow({ running }: { running: boolean }) {
  return (
    <ActionForm action={backupNow} className="space-y-2">
      {running ? (
        <button type="button" className="btn" disabled>Sicherung läuft …</button>
      ) : (
        <SubmitButton className="btn" pendingText="Wird gestartet …">Jetzt sichern</SubmitButton>
      )}
    </ActionForm>
  );
}

/** Solange eine Sicherung läuft, alle paar Sekunden neu laden */
export function RefreshWhileRunning({ running }: { running: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);
  return null;
}
