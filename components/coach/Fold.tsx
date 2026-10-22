"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/shell/icons";

/**
 * Aufklappbarer Block fürs Coach-Dashboard. Standard: zu. Ob er offen ist, merkt sich der Browser (localStorage),
 * fehlt der Speicher (privates Fenster), bleibt es einfach beim Standard.
 */
export function Fold({ id, title, icon, iconClass = "bg-tint text-accent", summary, action, children }: { id: string; title: string; icon: IconName; iconClass?: string; summary?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const key = `coach-fold:${id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gespeicherten Zustand erst nach dem Laden übernehmen (Server kennt ihn nicht)
      if (window.localStorage.getItem(key) === "1") setOpen(true);
    } catch {}
  }, [key]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {}
  };
  return (
    <section className="card !p-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`fold-${id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${iconClass}`}><Icon name={icon} className="size-4" /></span>
          <span className="h2 min-w-0">{title}</span>
          {summary && <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">{summary}</span>}
          <span className={`ml-auto shrink-0 text-muted transition ${open ? "-rotate-90" : "rotate-90"}`} aria-hidden><Icon name="arrow" className="size-4" /></span>
          <span className="sr-only">{open ? "zuklappen" : "aufklappen"}</span>
        </button>
        {action}
      </div>
      {open && <div id={`fold-${id}`} className="border-t border-line-soft px-4 py-4 sm:px-6">{children}</div>}
    </section>
  );
}
