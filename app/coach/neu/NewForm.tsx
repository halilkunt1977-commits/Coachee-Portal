"use client";
import { useActionState } from "react";
import { CoacheeFields } from "@/components/CoacheeFields";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createCoachee } from "../actions";

export default function NewForm() {
  const [state, action] = useActionState(createCoachee, undefined);
  return (
    <form action={action} className="card space-y-6">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <CoacheeFields />
      <label className="flex items-start gap-3 rounded-xl bg-bg p-4 text-sm">
        <input type="checkbox" name="invite" defaultChecked className="mt-1 size-4 accent-[var(--accent)]" />
        <span><strong>Gleich einladen.</strong> Der Coachee bekommt eine E-Mail mit einem Link, über den er sein Passwort festlegt.</span>
      </label>
      <SubmitButton>Coachee anlegen</SubmitButton>
    </form>
  );
}
