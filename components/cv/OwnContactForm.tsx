"use client";
import { useActionState } from "react";
import { updateOwnContact } from "@/app/actions/lebenslauf";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";

/** „Meine Daten“: Name und E-Mail fest, Telefon frei, Geburtsdatum einmalig selbst eintragbar */
export function OwnContactForm({ name, email, phone, birthDate }: { name: string; email: string; phone: string; birthDate: string | null }) {
  const [state, action] = useActionState(updateOwnContact, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{state.ok}</Notice>}
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs text-muted">Name</dt><dd className="font-medium">{name}</dd></div>
        <div><dt className="text-xs text-muted">E-Mail</dt><dd className="font-medium break-all">{email}</dd></div>
      </dl>
      <label className="block">
        <span className="label">Telefon</span>
        <input name="phone" type="tel" className="input" defaultValue={phone} autoComplete="tel" maxLength={50} />
      </label>
      {birthDate ? (
        <div className="text-sm"><p className="text-xs text-muted">Geburtsdatum</p><p className="font-medium">{birthDate}</p></div>
      ) : (
        <label className="block">
          <span className="label">Geburtsdatum <span className="font-normal text-muted">(freiwillig)</span></span>
          <input name="birth_date" type="date" className="input" />
          <span className="hint block">Kannst du einmal selbst eintragen.</span>
        </label>
      )}
      <p className="text-xs text-muted">Diese Angaben stehen in jedem Lebenslauf und Anschreiben. Name, E-Mail und ein eingetragenes Geburtsdatum ändert dein Coach für dich.</p>
      <SubmitButton className="btn-ghost w-full" pendingText="Wird gespeichert …">Speichern</SubmitButton>
    </form>
  );
}
