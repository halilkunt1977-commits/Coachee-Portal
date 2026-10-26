"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { openInboxEntry, openThread } from "@/app/actions/posteingang";
import { Icon, type IconName } from "../shell/icons";
import { useT } from "../i18n/LangProvider";

type Props = {
  /** Eintrag in coachee_inbox, oder "nachrichten" für das Gespräch mit dem Coach */
  id: string;
  icon: IconName;
  tone: string;
  label: string;
  when: string;
  title: ReactNode;
  preview?: ReactNode;
  unread: number | boolean;
  done?: boolean;
  initiallyOpen?: boolean;
  children: ReactNode;
};

/** Ein Eintrag im Posteingang: zugeklappt Absender, Anlass und Vorschau; aufgeklappt Inhalt und Aktionen. Öffnen heißt gelesen. */
export function InboxCard(p: Props) {
  const t = useT();
  const [open, setOpen] = useState(Boolean(p.initiallyOpen));
  const [, start] = useTransition();
  const ref = useRef<HTMLLIElement>(null);
  const unread = typeof p.unread === "number" ? p.unread > 0 : p.unread;

  const markRead = () => start(() => (p.id === "nachrichten" ? openThread() : openInboxEntry(p.id)));

  useEffect(() => {
    if (!p.initiallyOpen) return;
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (unread) markRead();
    // nur beim ersten Anzeigen, z. B. nach Tippen auf eine Sofort-Meldung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) markRead();
  };

  return (
    <li ref={ref} id={`eintrag-${p.id}`} className={`card scroll-mt-24 !p-0 overflow-hidden transition ${unread ? "ring-1 ring-accent/25" : ""}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span className={`relative grid size-10 shrink-0 place-items-center rounded-xl ${p.tone}`}>
          <Icon name={p.icon} className="size-5" />
          {unread && <span aria-label={t("ungelesen")} className="absolute -top-1 -right-1 size-3 rounded-full bg-danger ring-2 ring-surface" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[11px] font-bold uppercase tracking-[0.12em] ${unread ? "text-accent" : "text-muted"}`}>
              {p.label}
              {typeof p.unread === "number" && p.unread > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 py-px text-[10px] text-white">{p.unread}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums">{p.when}</span>
          </span>
          <span className={`mt-0.5 block break-words [overflow-wrap:anywhere] ${unread ? "font-bold" : "font-semibold"} ${p.done ? "text-muted line-through" : ""}`}>{p.title}</span>
          {p.preview && <span className="mt-0.5 line-clamp-2 block break-words text-sm text-muted [overflow-wrap:anywhere]">{p.preview}</span>}
        </span>
        <span className="mt-1.5 flex shrink-0 items-center gap-1 text-xs font-semibold text-muted" title={open ? t("Zuklappen") : t("Öffnen")}>
          <span className="hidden sm:inline">{open ? t("Zuklappen") : t("Öffnen")}</span>
          <span className={`transition ${open ? "-rotate-90" : "rotate-90"}`} aria-hidden><Icon name="arrow" className="size-4" /></span>
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-line-soft px-4 pt-3 pb-4">{p.children}</div>}
    </li>
  );
}
