"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../shell/icons";
import { useT } from "../i18n/LangProvider";

/** Kleines Fenster für Senden und Schreiben: am Handy als Blatt von unten, am Rechner mittig. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Tippen neben das Fenster schließt es
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(calc(100vw-2rem),460px)] max-w-none overflow-visible rounded-2xl border border-line-soft bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40 max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      {open && (
        <div className="max-h-[85dvh] space-y-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-3">
            <h2 className="h2">{title}</h2>
            <button type="button" aria-label={t("Schließen")} className="-m-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" onClick={onClose}>
              <Icon name="close" className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
