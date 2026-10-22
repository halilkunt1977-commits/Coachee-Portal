"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Zugeklappter Bereich „Mehr anzeigen“ auf der Startseite. Öffnet sich von selbst,
 * wenn ein Link auf etwas darin zeigt (z. B. #etappen), damit kein Sprungziel im Verborgenen liegt.
 */
export function MoreSection({ id = "mehr", label, children }: { id?: string; label: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const reveal = (hash: string) => {
      const el = ref.current;
      if (!el || !hash || hash === "#") return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target || !el.contains(target)) return;
      el.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    reveal(window.location.hash);
    const onHash = () => reveal(window.location.hash);
    // Links innerhalb der Seite setzen die Adresse ohne „hashchange“; deshalb auch Klicks auf #-Links abfangen
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      const href = a?.getAttribute("href");
      if (href?.startsWith("#")) reveal(href);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} id={id} className="group scroll-mt-24">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Weniger anzeigen</span>
        <svg viewBox="0 0 16 16" className="size-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
      </summary>
      <div className="space-y-6 pt-6">{children}</div>
    </details>
  );
}
