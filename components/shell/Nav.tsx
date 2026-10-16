"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { NavGroup, NavItem } from "@/lib/nav";
import { Icon } from "./icons";

const isActive = (path: string, i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));

const Badge = ({ n, light }: { n?: number; light?: boolean }) =>
  n ? <span className={`ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${light ? "bg-gold text-night" : "bg-danger text-white"}`}>{n > 99 ? "99+" : n}</span> : null;

/** Menü der Seitenleiste (dunkel) */
export function SideNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi} className="space-y-1">
          {g.label && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{g.label}</p>}
          {g.items.map((i) => {
            const active = isActive(path, i);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${active ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
              >
                {active && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-[#f0cf94] to-gold" />}
                <Icon name={i.icon} className={`size-[18px] shrink-0 ${active ? "text-[#f0cf94]" : "text-white/50 group-hover:text-white/80"}`} />
                <span className="truncate">{i.label}</span>
                <Badge n={i.badge} light />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Leiste unten am Handy plus ausklappbares Menü */
export function MobileNav({ tabs, children }: { tabs: NavItem[]; children: ReactNode }) {
  const path = usePathname();
  // Das Menü gilt nur für die Seite, auf der es geöffnet wurde: nach einem Klick auf einen Eintrag ist es zu
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === path;
  const setOpen = (v: boolean) => setOpenedAt(v ? path : null);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((i) => {
            const active = isActive(path, i);
            return (
              <Link key={i.href} href={i.href} className={`relative flex flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[10.5px] font-medium ${active ? "text-accent" : "text-muted"}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-tint" : ""}`}><Icon name={i.icon} className="size-5" /></span>
                <span className="max-w-full truncate">{i.label}</span>
                {i.badge ? <span className="absolute top-1 right-[22%] size-2 rounded-full bg-danger ring-2 ring-surface" /> : null}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[10.5px] font-medium text-muted">
            <span className="grid h-7 w-12 place-items-center rounded-full"><Icon name="menu" className="size-5" /></span>
            Menü
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button aria-label="Menü schließen" onClick={() => setOpen(false)} className="absolute inset-0 bg-night/50 backdrop-blur-sm" />
          <div className="night absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col overflow-y-auto px-5 pt-[max(20px,env(safe-area-inset-top))] pb-6 shadow-2xl" style={{ animation: "rise .25s ease-out both" }}>
            <button onClick={() => setOpen(false)} aria-label="Schließen" className="mb-4 self-end rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"><Icon name="close" /></button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
