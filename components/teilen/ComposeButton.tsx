"use client";
import { useActionState, useEffect, useState } from "react";
import { composeMessage } from "@/app/actions/teilen";
import type { FormState } from "@/lib/forms";
import { Icon } from "../shell/icons";
import { SubmitButton } from "../SubmitButton";
import { Sheet } from "./Sheet";

/** „Neue Nachricht“: Coachee an den eigenen Coach, Coach an einen Coachee aus der Auswahl. */
export function ComposeButton({ coachees, recipient, label = "Neue Nachricht", className = "btn btn-sm" }: { coachees?: { id: string; name: string }[]; recipient?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" className={className} onClick={() => { setRound((r) => r + 1); setOpen(true); }} aria-haspopup="dialog">
        <Icon name="chat" className="size-4" /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={coachees ? "Nachricht an Coachee" : `Nachricht an ${recipient ?? "deinen Coach"}`}>
        <ComposeForm key={round} coachees={coachees} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function ComposeForm({ coachees, onDone }: { coachees?: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(composeMessage, undefined);
  useEffect(() => {
    if (!state?.ok) return;
    const t = window.setTimeout(onDone, 1200);
    return () => window.clearTimeout(t);
  }, [state, onDone]);
  if (state?.ok) return <p role="status" className="rounded-xl bg-ok-soft px-3 py-3 text-sm font-semibold text-ok">✓ {state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      {coachees && (
        <label className="block">
          <span className="label">An wen?</span>
          <select name="coachee" className="input" required defaultValue="">
            <option value="" disabled>Coachee auswählen …</option>
            {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Nachricht</span>
        <textarea name="body" required rows={5} maxLength={10000} className="input" placeholder={coachees ? "Was möchtest du schreiben?" : "Fragen, Rückmeldungen oder ein kurzes Update …"} autoFocus />
      </label>
      {state?.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>Abbrechen</button>
        <SubmitButton pendingText="Wird gesendet …">Senden</SubmitButton>
      </div>
    </form>
  );
}
