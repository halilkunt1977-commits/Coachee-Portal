"use client";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/i18n/LangProvider";
import { enableTotp } from "../actions";

export default function EnableForm() {
  const t = useT();
  const [state, action] = useActionState(enableTotp, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label={t("Code aus der App")} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <SubmitButton className="btn w-full">{t("Zwei-Faktor aktivieren")}</SubmitButton>
    </form>
  );
}
