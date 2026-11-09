"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newTraining } from "@/app/actions/training";
import { useT } from "@/components/i18n/LangProvider";

export function StartTrainingButton({ appId, again }: { appId: string; again: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await newTraining(appId);
            if (r.ok) router.push(`/mein-bereich/bewerbungen/${appId}/training?t=${r.id}`);
            else setError(t(r.error));
          })
        }
      >
        {busy ? t("Fragen werden vorbereitet …") : again ? t("Neues Training starten") : t("Training starten")}
      </button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
