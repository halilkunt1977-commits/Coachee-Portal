"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/forms";
import { Notice } from "../ui";

/** Formular mit Fehler-/Erfolgsmeldung. resetOnOk leert die Felder nach dem Speichern (z. B. neue Nachricht). */
export function ActionForm({ action, children, className = "space-y-4", resetOnOk = false }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; children: React.ReactNode; className?: string; resetOnOk?: boolean }) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      {children}
    </form>
  );
}
