"use client";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requestReset } from "./actions";

export default function ResetForm() {
  const [state, action] = useActionState(requestReset, undefined);
  if (state?.ok) return <Notice tone="ok">{state.ok}</Notice>;
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="E-Mail" name="email" type="email" autoComplete="email" required autoFocus />
      <SubmitButton className="btn w-full">Link schicken</SubmitButton>
    </form>
  );
}
