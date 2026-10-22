"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setFeature } from "@/app/actions/freigaben";

/** Schalter für eine Zusatzfunktion. Schaltet sofort um und speichert im Hintergrund; bei einem Fehler springt er zurück. */
export function FeatureToggle({ coacheeId, feature, on, label, showState = true }: { coacheeId: string; feature: string; on: boolean; label: string; showState?: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={label}
        title={error ?? `${label}: ${optimistic ? "freigegeben" : "gesperrt"}`}
        onClick={() => {
          const next = !optimistic;
          setError(null);
          start(async () => {
            setOptimistic(next);
            const r = await setFeature(coacheeId, feature, next).catch(() => ({ ok: false as const, error: "Nicht gespeichert, bitte noch einmal versuchen." }));
            if (!r.ok) setError(r.error);
          });
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[""] focus-visible:ring-4 focus-visible:ring-accent-2/20 focus-visible:outline-none ${optimistic ? "bg-ok" : "bg-line"} ${pending ? "opacity-70" : ""}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition ${optimistic ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
      {showState && <span className={`w-11 text-xs font-semibold ${optimistic ? "text-ok" : "text-muted"}`}>{optimistic ? "Frei" : "Aus"}</span>}
      {error && <span className="text-xs text-danger" role="alert">{error}</span>}
    </span>
  );
}
