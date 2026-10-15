import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Logo } from "./ui";

export function AppHeader({ name, links }: { name: string; links: { href: string; label: string }[] }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo />
        <nav className="order-3 -mx-3 flex w-full flex-wrap items-center gap-1 text-sm font-medium sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-muted hover:bg-bg hover:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm sm:ml-0">
          <span className="hidden text-muted sm:inline">{name}</span>
          <form action={logout}><button className="btn-ghost btn-sm">Abmelden</button></form>
        </div>
      </div>
    </header>
  );
}
