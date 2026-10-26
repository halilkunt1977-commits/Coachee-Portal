"use client";
import { useActionState } from "react";
import { updateOwnContact } from "@/app/actions/lebenslauf";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";
import { useT } from "../i18n/LangProvider";

/** „Meine Daten“: Name und E-Mail fest, Telefon frei, Geburtsdatum einmalig selbst eintragbar */
export function OwnContactForm({ name, email, phone, birthDate }: { name: string; email: string; phone: string; birthDate: string | null }) {
  const t = useT();
  const [state, action] = useActionState(updateOwnContact, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Notice tone="error">{t(state.error)}</Notice>}
      {state?.ok && <Notice tone="ok">{t(state.ok)}</Notice>}
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs text-muted">{t("Name")}</dt><dd className="font-medium">{name}</dd></div>
        <div><dt className="text-xs text-muted">{t("E-Mail")}</dt><dd className="font-medium break-all">{email}</dd></div>
      </dl>
      <label className="block">
        <span className="label">{t("Telefon")}</span>
        <input name="phone" type="tel" className="input" defaultValue={phone} autoComplete="tel" maxLength={50} />
      </label>
      {birthDate ? (
        <div className="text-sm"><p className="text-xs text-muted">{t("Geburtsdatum")}</p><p className="font-medium">{birthDate}</p></div>
      ) : (
        <label className="block">
          <span className="label">{t("Geburtsdatum")} <span className="font-normal text-muted">({t("freiwillig")})</span></span>
          <input name="birth_date" type="date" className="input" />
          <span className="hint block">{t("Kannst du einmal selbst eintragen.")}</span>
        </label>
      )}
      <p className="text-xs text-muted">{t("Diese Angaben stehen in jedem Lebenslauf und Anschreiben. Name, E-Mail und ein eingetragenes Geburtsdatum ändert dein Coach für dich.")}</p>
      <SubmitButton className="btn-ghost w-full" pendingText={t("Wird gespeichert …")}>{t("Speichern")}</SubmitButton>
    </form>
  );
}
