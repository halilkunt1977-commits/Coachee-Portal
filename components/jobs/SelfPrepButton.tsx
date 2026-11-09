"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { coacheeGenerateInterview } from "@/app/actions/gespraechsvorbereitung";
import { useT } from "@/components/i18n/LangProvider";

/** Coachee mit Freigabe: Gesprächsvorbereitung für diese Stelle (neu) erstellen lassen */
export function SelfPrepButton({ appId, again }: { appId: string; again: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setAsk(false);
    const r = await coacheeGenerateInterview(appId).catch(() => ({ ok: false as const, error: "Keine Verbindung." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {again && ask ? (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {t("Alles neu erstellen?")}
          <button type="button" className="btn btn-sm" onClick={() => void run()}>{t("Ja, neu erstellen")}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAsk(false)}>{t("Abbrechen")}</button>
        </span>
      ) : (
        <button type="button" className={again ? "btn-ghost btn-sm tap" : "btn"} disabled={busy} onClick={() => (again ? setAsk(true) : void run())}>
          {busy ? t("Wird erstellt … das dauert etwa eine Minute") : again ? t("Neu erstellen") : t("Vorbereitung erstellen")}
        </button>
      )}
      {error && <span className="text-sm text-danger" role="alert">{t(error)}</span>}
    </span>
  );
}
