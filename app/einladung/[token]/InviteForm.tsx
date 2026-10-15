"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInvite } from "./actions";

export default function InviteForm({ token, consent }: { token: string; consent: boolean }) {
  const [state, action] = useActionState(acceptInvite.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Neues Passwort" name="password" type="password" autoComplete="new-password" minLength={10} required hint="Mindestens 10 Zeichen. Ein Satz aus mehreren Wörtern ist sicher und leicht zu merken." />
      <Field label="Passwort wiederholen" name="password2" type="password" autoComplete="new-password" minLength={10} required />
      {consent && (
        <div className="space-y-3 rounded-xl bg-bg p-4 text-sm">
          <label className="flex gap-3">
            <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
            <span>Ich habe die <Link href="/datenschutz" target="_blank" className="link">Datenschutzerklärung</Link> gelesen und bin einverstanden, dass meine Daten aus dem Coaching im Portal gespeichert werden.</span>
          </label>
          <label className="flex gap-3">
            <input type="checkbox" name="consent_special" className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
            <span className="text-muted">Freiwillig: Ich bin einverstanden, dass auch gesundheitliche Themen, die ich im Coaching anspreche, vertraulich dokumentiert werden dürfen. Ich kann das jederzeit widerrufen.</span>
          </label>
        </div>
      )}
      <SubmitButton className="btn w-full">Passwort speichern</SubmitButton>
    </form>
  );
}
