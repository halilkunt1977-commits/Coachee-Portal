"use client";
import { sendMessage } from "@/app/actions/akte";
import { SubmitButton } from "../SubmitButton";
import { ActionForm } from "./ActionForm";

export function MessageForm({ coacheeId }: { coacheeId: string }) {
  return (
    <ActionForm action={sendMessage.bind(null, coacheeId)} resetOnOk className="space-y-2">
      <textarea name="body" required rows={3} className="input" placeholder="Nachricht schreiben …" />
      <div className="flex justify-end"><SubmitButton pendingText="Wird gesendet …">Senden</SubmitButton></div>
    </ActionForm>
  );
}
