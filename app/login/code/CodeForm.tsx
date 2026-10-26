"use client";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/i18n/LangProvider";
import { verifyCode } from "../actions";

export default function CodeForm() {
  const t = useT();
  const [state, action] = useActionState(verifyCode, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label={t("Code aus der Authenticator-App")} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      <SubmitButton className="btn w-full">{t("Bestätigen")}</SubmitButton>
    </form>
  );
}
