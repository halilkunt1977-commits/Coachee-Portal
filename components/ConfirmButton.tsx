"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "./i18n/LangProvider";

/** Zweistufiger Knopf für Unumkehrbares: erst „Löschen“, dann „Wirklich löschen?“. Steht in einem <form>. */
export function ConfirmButton({ label = "Löschen", confirm = "Wirklich löschen?" }: { label?: string; confirm?: string }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) return <button type="button" className="btn-ghost btn-sm tap hover:!border-danger hover:!text-danger" onClick={() => setArmed(true)}>{t(label)}</button>;
  return (
    <span className="inline-flex gap-1">
      <button type="submit" className="btn btn-sm tap !bg-danger" disabled={pending}>{pending ? t("Wird gelöscht …") : t(confirm)}</button>
      <button type="button" className="btn-ghost btn-sm tap" onClick={() => setArmed(false)}>{t("Nein")}</button>
    </span>
  );
}
