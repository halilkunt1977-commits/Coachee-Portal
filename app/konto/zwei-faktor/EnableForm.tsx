"use client";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { enableTotp } from "../actions";

export default function EnableForm() {
  const [state, action] = useActionState(enableTotp, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Code aus der App" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <SubmitButton className="btn w-full">Zwei-Faktor aktivieren</SubmitButton>
    </form>
  );
}
