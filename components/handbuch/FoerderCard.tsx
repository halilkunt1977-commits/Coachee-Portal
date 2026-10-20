import Link from "next/link";
import { EINSTIEGSGELD, GRUENDUNGSZUSCHUSS, STAND, type FoerderInfo } from "@/lib/handbuch/foerderung";

function Details({ title, items, open }: { title: string; items: string[]; open?: boolean }) {
  return (
    <details className="group px-4" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-muted transition group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <ul className="list-disc space-y-1.5 pb-4 pl-5 text-sm leading-relaxed">
        {items.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </details>
  );
}

/** Infos zu einer Förderart: Kennzahlen, Voraussetzungen und was danach wichtig ist */
export function FoerderCard({ info, you = true, handbookHref }: { info: FoerderInfo; you?: boolean; handbookHref?: string }) {
  return (
    <section className="card space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="h2">{you ? `Deine Förderung: ${info.title}` : info.title}</h2>
          <span className="badge">{info.law}</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold">{info.who}</p>
        <p className="text-sm text-muted">{info.lead}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {info.facts.map((f) => (
          <div key={f.label} className="rounded-2xl bg-tint p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{f.label}</p>
            <p className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{f.value}</p>
            {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="divide-y divide-line-soft rounded-2xl border border-line-soft">
        <Details title="Voraussetzungen" items={info.requirements} />
        <Details title={you ? "Danach für dich wichtig" : "Nach der Bewilligung"} items={info.afterwards} />
        {info.plus && <Details title={info.plus.title} items={[info.plus.text]} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <a href={info.link.url} target="_blank" rel="noreferrer" className="link">{info.link.label} ↗</a>
        {handbookHref && <Link href={handbookHref} className="link">Alle Schritte im Handbuch →</Link>}
      </div>
      <p className="text-xs text-muted">Allgemeine Informationen, Stand {STAND}, keine Rechtsberatung. Verbindlich ist dein Bescheid.</p>
    </section>
  );
}

/** Förderart noch offen: beide Wege kurz nebeneinander */
export function FoerderWahl({ handbookHref }: { handbookHref?: string }) {
  const items = [GRUENDUNGSZUSCHUSS, EINSTIEGSGELD];
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">Förderung für deine Gründung</h2>
        <p className="text-sm text-muted">Je nachdem, ob du Arbeitslosengeld oder Grundsicherungsgeld bekommst, gibt es eine andere Förderung. Welche zu dir passt, klären wir im Coaching.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <div key={i.key} className="space-y-2 rounded-2xl border border-line-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{i.who}</p>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold">{i.title} <span className="text-xs font-semibold text-muted">{i.law}</span></p>
            <ul className="space-y-1 text-sm">
              {i.facts.map((f) => <li key={f.label}><span className="text-muted">{f.label}:</span> <strong>{f.value}</strong></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Stand {STAND}, keine Rechtsberatung.</span>
        {handbookHref && <Link href={handbookHref} className="link">Zum Handbuch →</Link>}
      </div>
    </section>
  );
}
