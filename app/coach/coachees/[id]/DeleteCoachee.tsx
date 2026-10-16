"use client";
import { useState } from "react";
import { ActionForm } from "@/components/akte/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteCoachee } from "../../actions";

/** Akte endgültig löschen, z. B. Test-Coachees. Erst aufklappen, dann Nachnamen eintippen. */
export default function DeleteCoachee({ coacheeId, lastName }: { coacheeId: string; lastName: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="text-sm text-danger hover:underline" onClick={() => setOpen(true)}>Coachee löschen …</button>;
  return (
    <ActionForm action={deleteCoachee.bind(null, coacheeId)} className="space-y-3">
      <p className="text-sm">Die Akte wird mit allem gelöscht: Gespräche, Anwesenheit, Dokumente, Lebensläufe, Businessplan, Nachrichten und der Zugang. Das lässt sich nicht rückgängig machen.</p>
      <label className="block">
        <span className="label">Zum Bestätigen den Nachnamen „{lastName}“ eintippen</span>
        <input name="confirm" className="input" autoComplete="off" required />
      </label>
      <div className="flex gap-2">
        <SubmitButton className="btn !bg-danger" pendingText="Wird gelöscht …">Endgültig löschen</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </ActionForm>
  );
}
