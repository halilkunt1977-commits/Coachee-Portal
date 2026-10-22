"use client";
import { useEffect } from "react";
import { StatusFrame } from "@/components/StatusFrame";

/** Unerwarteter Fehler auf einer Seite. „/“ leitet je nach Rolle weiter (Coach, Mein Bereich oder Anmeldung). */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusFrame
      code="Fehler"
      title="Da ist etwas schiefgegangen"
      home="/"
      actions={<button type="button" className="btn-ghost min-h-11" onClick={() => retry()}>Noch einmal versuchen</button>}
    >
      <p>Bitte versuch es gleich noch einmal. Deine gespeicherten Daten sind sicher.</p>
      {error.digest && <p className="text-xs">Fehlernummer: {error.digest}</p>}
    </StatusFrame>
  );
}
