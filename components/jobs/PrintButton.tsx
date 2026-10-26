"use client";
import { useT } from "../i18n/LangProvider";

/** Seite drucken oder als PDF sichern (über den Druckdialog des Browsers) */
export function PrintButton({ label = "Drucken" }: { label?: string }) {
  const t = useT();
  return (
    <button type="button" className="btn-ghost btn-sm tap print:hidden" onClick={() => window.print()}>
      {t(label)}
    </button>
  );
}
