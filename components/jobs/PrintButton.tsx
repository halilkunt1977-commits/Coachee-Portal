"use client";

/** Seite drucken oder als PDF sichern (über den Druckdialog des Browsers) */
export function PrintButton({ label = "Drucken" }: { label?: string }) {
  return (
    <button type="button" className="btn-ghost btn-sm tap print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
