"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { setCoachingStatus } from "@/app/actions/dokumente";

/** Coaching abschließen oder wieder aufnehmen, mit Rückfrage. Steht unter Verwaltung, nicht bei den Alltags-Knöpfen. */
export default function CloseCoaching({ coacheeId, firstName, done }: { coacheeId: string; firstName: string; done: boolean }) {
  const [open, setOpen] = useState(false);
  const next = done ? "aktiv" : "abgeschlossen";
  if (!open)
    return (
      <button type="button" className="btn-ghost min-h-11 w-full sm:min-h-0" onClick={() => setOpen(true)}>
        {done ? "Coaching wieder aufnehmen …" : "Coaching abschließen …"}
      </button>
    );
  return (
    <form action={setCoachingStatus.bind(null, coacheeId, next)} className="space-y-3 rounded-xl bg-bg p-3">
      <p className="text-sm">
        {done
          ? `Das Coaching mit ${firstName} läuft dann wieder und erscheint im Dashboard und in den Erinnerungen.`
          : `${firstName} behält den Zugang mit Lebenslauf, Werkzeugen und Handbuch, kostenlos. Im Dashboard und bei den Erinnerungen taucht das Coaching nicht mehr auf. Du kannst es jederzeit wieder aufnehmen.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn min-h-11 sm:min-h-0" pendingText="Wird gespeichert …">{done ? "Ja, wieder aufnehmen" : "Ja, Coaching abschließen"}</SubmitButton>
        <button type="button" className="btn-ghost min-h-11 sm:min-h-0" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </form>
  );
}
