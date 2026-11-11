import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/shell/icons";
import type { T } from "@/lib/i18n";

/*
 * Bausteine der Coachee-Startseite: helle, ruhige Karten in den Portalfarben (Nachtblau und Gold).
 * Aufbau: große Begrüßung, darunter „Deine nächsten Schritte“, rechts Aktivität, Fortschritt und zuletzt Erledigtes.
 */

/** Gezeichneter Weg nach oben mit Fahne: steht für das Ziel des Coachings */
export function SummitArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden>
      <defs>
        <linearGradient id="sa-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d9a6" />
          <stop offset="1" stopColor="#b8863f" />
        </linearGradient>
        <linearGradient id="sa-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3459a0" />
          <stop offset="1" stopColor="#1d3a66" />
        </linearGradient>
      </defs>
      <circle cx="176" cy="122" r="104" fill="#e8eef7" />
      <circle cx="176" cy="122" r="78" fill="#f4f2ec" opacity=".7" />
      {/* Stufen */}
      <rect x="62" y="170" width="44" height="40" rx="8" fill="url(#sa-navy)" opacity=".55" />
      <rect x="112" y="142" width="44" height="68" rx="8" fill="url(#sa-navy)" opacity=".7" />
      <rect x="162" y="112" width="44" height="98" rx="8" fill="url(#sa-navy)" opacity=".85" />
      <rect x="212" y="80" width="44" height="130" rx="8" fill="url(#sa-navy)" />
      {/* Weg */}
      <path d="M70 168 C 100 150, 118 146, 134 138 S 168 112, 184 108 S 218 82, 234 76" fill="none" stroke="url(#sa-gold)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
      {/* Fahne */}
      <line x1="234" y1="80" x2="234" y2="26" stroke="#0a1628" strokeWidth="4" strokeLinecap="round" />
      <path d="M236 28 L 276 38 L 236 50 Z" fill="url(#sa-gold)" />
      <text x="249" y="43" fontSize="11" fontWeight="800" fill="#0a1628" fontFamily="system-ui, sans-serif">G</text>
      {/* Sterne */}
      <path d="M92 70 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#b8863f" opacity=".8" />
      <path d="M290 120 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#3459a0" opacity=".6" />
      <circle cx="120" cy="104" r="3" fill="#b8863f" opacity=".6" />
      <circle cx="282" cy="186" r="3" fill="#1d3a66" opacity=".4" />
    </svg>
  );
}

export function Feature({ icon, title, hint }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; hint: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-soft bg-surface text-accent"><Icon name={icon} className="size-4" /></span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
    </div>
  );
}

/** Karte mit Kopfzeile (Titel links, Link rechts) */
export function Panel({ title, icon, action, children, className = "" }: { title: string; icon?: Parameters<typeof Icon>[0]["name"]; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2 flex items-center gap-2">{icon && <Icon name={icon} className="size-4 text-gold" />}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Tage in Folge aktiv und die laufende Woche als Punkte */
export function ActivityCard({ t, lang, days, streak, best }: { t: T; lang: "de" | "tr"; days: { label: string; active: boolean; today: boolean; future: boolean }[]; streak: number; best: number }) {
  const today = days.find((d) => d.today);
  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold-soft text-gold">
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.7 2-4.8.3 1.6 1.2 2.6 2.3 3C10.6 8.8 11 5 12 2z" /></svg>
        </span>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold"><span className="text-2xl tabular-nums">{streak}</span> {t(streak === 1 ? "Tag in Folge aktiv" : "Tage in Folge aktiv")}</p>
          <p className="text-sm text-muted">{today?.active ? t("Stark, heute schon dabei.") : t("Schau heute kurz rein, dann geht die Serie weiter.")}</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" aria-label={t("Diese Woche")}>
        {days.map((d) => (
          <div key={d.label} className="space-y-1.5">
            <p className={`text-[11px] font-semibold ${d.today ? "text-accent" : "text-muted"}`}>{d.label}</p>
            <span className={`mx-auto grid size-8 place-items-center rounded-full ${d.active ? "bg-accent text-white" : d.future ? "border border-dashed border-line" : "bg-line-soft"}`}>
              {d.active ? <Icon name="check" className="size-4" /> : <span className="size-1.5 rounded-full bg-line" />}
            </span>
          </div>
        ))}
      </div>
      <p className="flex justify-between border-t border-line-soft pt-3 text-sm text-muted">
        <span>{t("Längste Serie")}</span>
        <b className="text-ink">{t(best === 1 ? "{n} Tag" : "{n} Tage", { n: best.toLocaleString(lang === "tr" ? "tr-TR" : "de-DE") })}</b>
      </p>
    </section>
  );
}

export function StatTile({ icon, value, label, tone, href }: { icon: Parameters<typeof Icon>[0]["name"]; value: string; label: string; tone: "accent" | "gold" | "ok"; href?: string }) {
  const tones = { accent: "bg-tint text-accent", gold: "bg-gold-soft text-gold", ok: "bg-ok-soft text-ok" };
  const body = (
    <>
      <span className={`mx-auto grid size-9 place-items-center rounded-full ${tones[tone]}`}><Icon name={icon} className="size-4" /></span>
      <span className="block font-[family-name:var(--font-display)] text-base leading-tight font-bold tabular-nums sm:text-lg">{value}</span>
      <span className="block text-xs text-muted">{label}</span>
    </>
  );
  const cls = "block min-w-0 space-y-1.5 rounded-2xl border border-line-soft bg-surface-2 px-2 py-3 text-center";
  return href ? <Link href={href} className={`${cls} transition hover:border-accent/40 hover:bg-surface`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function DoneItem({ title, sub, when }: { title: string; sub: string; when: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-ok text-white"><Icon name="check" className="size-3.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{title}</span>
          <span className="shrink-0 text-xs text-muted">{when}</span>
        </span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </li>
  );
}

/** Große Karte für den nächsten Schritt mit Gesamtfortschritt */
export function StepCard({ t, eyebrow, title, hint, href, pct, cta }: { t: T; eyebrow: string; title: string; hint: string; href: string; pct: number; cta: string }) {
  return (
    <Link href={href} className="card card-hover group flex min-w-0 flex-col !p-0">
      <div className="relative overflow-hidden rounded-t-[inherit] bg-gradient-to-br from-tint via-surface-2 to-gold-soft px-5 pt-5 pb-6">
        <span className="inline-flex rounded-full border border-accent/15 bg-surface px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">{eyebrow}</span>
        <p className="mt-4 max-w-[16rem] font-[family-name:var(--font-display)] text-2xl leading-tight font-extrabold tracking-tight text-night uppercase">{title}</p>
        <SummitArt className="pointer-events-none absolute -right-8 -bottom-8 w-36 opacity-80" />
        <span className="absolute top-3 right-3 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-accent shadow-sm">{cta}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-sm text-muted">{hint}</p>
        <div className="mt-auto flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft"><span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pct}%` }} /></span>
          <b className="text-sm tabular-nums">{pct}%</b>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">{t("Weitermachen")} <span className="transition group-hover:translate-x-1"><Icon name="arrow" className="size-4" /></span></span>
      </div>
    </Link>
  );
}
