"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Knopf „…“ im Kopf der Akte: seltenere Aktionen und Kontaktdaten. Schließt bei Klick daneben, Esc oder nach einer Auswahl. */
export default function MoreMenu({ children, label = "Mehr" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" aria-label={label} title={label} onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold transition hover:bg-white/20 sm:min-h-9 sm:text-xs">
        <span aria-hidden className="text-lg leading-none">⋯</span><span className="sr-only sm:not-sr-only">{label}</span>
      </button>
      {open && (
        <div role="menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a,button")) setOpen(false); }}
          className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-0.5 rounded-xl bg-surface p-1.5 text-sm text-ink shadow-xl ring-1 ring-line-soft">
          {children}
        </div>
      )}
    </div>
  );
}
