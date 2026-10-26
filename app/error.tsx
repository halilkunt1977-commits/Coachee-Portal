"use client";
import { useEffect } from "react";
import { StatusFrame } from "@/components/StatusFrame";
import { useT } from "@/components/i18n/LangProvider";

/** Unerwarteter Fehler auf einer Seite. „/“ leitet je nach Rolle weiter (Coach, Mein Bereich oder Anmeldung). */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusFrame
      code={t("Fehler")}
      title={t("Da ist etwas schiefgegangen")}
      home="/"
      homeLabel={t("Zur Startseite")}
      actions={<button type="button" className="btn-ghost min-h-11" onClick={() => retry()}>{t("Noch einmal versuchen")}</button>}
    >
      <p>{t("Bitte versuch es gleich noch einmal. Deine gespeicherten Daten sind sicher.")}</p>
      {error.digest && <p className="text-xs">{t("Fehlernummer:")} {error.digest}</p>}
    </StatusFrame>
  );
}
