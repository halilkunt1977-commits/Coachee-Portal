"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";

/** Zweistufiger Knopf für Unumkehrbares: erst „Löschen“, dann „Wirklich löschen?“. Steht in einem <form>. */
export function ConfirmButton({ label = "Löschen", confirm = "Wirklich löschen?" }: { label?: string; confirm?: string }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) return <button type="button" className="btn-ghost btn-sm hover:!border-danger hover:!text-danger" onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="inline-flex gap-1">
      <button type="submit" className="btn btn-sm !bg-danger" disabled={pending}>{pending ? "Wird gelöscht …" : confirm}</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)}>Nein</button>
    </span>
  );
}
