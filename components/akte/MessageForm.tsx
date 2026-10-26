"use client";
import { sendMessage } from "@/app/actions/akte";
import { SubmitButton } from "../SubmitButton";
import { ActionForm } from "./ActionForm";
import { useT } from "../i18n/LangProvider";

export function MessageForm({ coacheeId, placeholder, defaultValue }: { coacheeId: string; placeholder?: string; /** vorbereiteter Text, z. B. der Link zum Erklärvideo */ defaultValue?: string }) {
  const t = useT();
  return (
    <ActionForm action={sendMessage.bind(null, coacheeId)} resetOnOk className="space-y-2">
      <textarea name="body" required rows={3} className="input" placeholder={placeholder ?? t("Nachricht schreiben …")} defaultValue={defaultValue} />
      <div className="flex justify-end"><SubmitButton pendingText={t("Wird gesendet …")}>{t("Senden")}</SubmitButton></div>
    </ActionForm>
  );
}
