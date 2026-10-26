import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { mobileTabs, type NavGroup } from "@/lib/nav";
import { Heartbeat } from "@/components/presence/Heartbeat";
import { getT } from "@/lib/i18n-server";
import { Icon } from "./icons";
import { MobileNav, SideNav } from "./Nav";
import { Avatar } from "./Avatar";

export { Avatar, avatarStyle, initials } from "./Avatar";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#e9c88c] to-gold font-[family-name:var(--font-display)] text-[17px] font-extrabold text-night shadow-[0_6px_16px_-6px_rgba(184,134,63,.9)]">
        G
      </span>
      <span className="leading-none">
        <span className={`block font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}>gründarium</span>
        <span className={`block text-[10px] font-semibold uppercase tracking-[0.2em] ${light ? "text-white/50" : "text-muted"}`}>Portal</span>
      </span>
    </Link>
  );
}

type Props = {
  user: { name: string; role: "coach" | "coachee" };
  groups: NavGroup[];
  /** Zusätzlicher Bereich unter dem Menü, z. B. die aktiven Coachees */
  extra?: ReactNode;
  wide?: boolean;
  children: ReactNode;
};

/**
 * Rahmen jeder angemeldeten Seite: dunkle Seitenleiste am Rechner, oben Logo und unten eine Tab-Leiste am Handy.
 */
export async function AppShell({ user, groups, extra, wide, children }: Props) {
  const t = await getT();
  const sidebar = (
    <>
      <SideNav groups={groups} />
      {extra}
      <div className="mt-auto space-y-3 pt-6">
        <div className="glass flex items-center gap-3 p-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-[11px] text-white/50">{user.role === "coach" ? "Coach" : "Coachee"}</p>
          </div>
          <form action={logout}>
            <button title={t("Abmelden")} aria-label={t("Abmelden")} className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"><Icon name="logout" className="size-[18px]" /></button>
          </form>
        </div>
        <p className="flex gap-3 px-1 text-[11px] text-white/35">
          <Link href="/datenschutz" className="hover:text-white/70">{t("Datenschutz")}</Link>
          <Link href="/impressum" className="hover:text-white/70">{t("Impressum")}</Link>
        </p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      {user.role === "coachee" && <Heartbeat />}
      <aside className="night fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col overflow-y-auto px-5 py-6 scroll-soft lg:flex print:!hidden">
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex min-h-full flex-col">
          <div className="mb-8 px-1"><Brand light /></div>
          {sidebar}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line-soft bg-bg/85 px-4 py-3 backdrop-blur-xl lg:hidden print:hidden">
        <Brand />
        <Avatar name={user.name} size="size-8" />
      </header>

      <div className="lg:pl-[272px] print:!pl-0">
        <main className={`mx-auto px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16 ${wide ? "max-w-[96rem]" : "max-w-7xl"}`}>{children}</main>
      </div>

      {/* Beim Drucken (z. B. Gesprächsvorbereitung) nur der Inhalt, ohne Menüs */}
      <div className="print:hidden">
        <MobileNav tabs={mobileTabs(groups)}>
          <div className="mb-6"><Brand light /></div>
          {sidebar}
        </MobileNav>
      </div>
    </div>
  );
}

/** Seitenkopf: kleine Zeile, Titel, Beschreibung, Knöpfe rechts */
export function PageHeader({ eyebrow, title, description, actions, back }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="rise mb-6 space-y-3 lg:mb-8">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent">
          <span className="rotate-180"><Icon name="arrow" className="size-4" /></span>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="h1">{title}</h1>
          {description && <p className="max-w-2xl text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
