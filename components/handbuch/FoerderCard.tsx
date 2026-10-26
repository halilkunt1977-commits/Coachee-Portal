import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { EINSTIEGSGELD, GRUENDUNGSZUSCHUSS, STAND, type FoerderInfo } from "@/lib/handbuch/foerderung";

async function Details({ title, items, open }: { title: string; items: string[]; open?: boolean }) {
  const t = await getT();
  return (
    <details className="group px-4" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        {t(title)}
        <span className="text-muted transition group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <ul className="list-disc space-y-1.5 pb-4 pl-5 text-sm leading-relaxed">
        {items.map((p) => <li key={p}>{t(p)}</li>)}
      </ul>
    </details>
  );
}

/** Infos zu einer Förderart: Kennzahlen, Voraussetzungen und was danach wichtig ist */
export async function FoerderCard({ info, you = true, handbookHref }: { info: FoerderInfo; you?: boolean; handbookHref?: string }) {
  const t = await getT();
  return (
    <section className="card space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="h2">{you ? t("Deine Förderung: {titel}", { titel: t(info.title) }) : t(info.title)}</h2>
          <span className="badge">{info.law}</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t(info.who)}</p>
        <p className="text-sm text-muted">{t(info.lead)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {info.facts.map((f) => (
          <div key={f.label} className="rounded-2xl bg-tint p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t(f.label)}</p>
            <p className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{t(f.value)}</p>
            {f.hint && <p className="mt-1 text-xs text-muted">{t(f.hint)}</p>}
          </div>
        ))}
      </div>
      <div className="divide-y divide-line-soft rounded-2xl border border-line-soft">
        <Details title={t("Voraussetzungen")} items={info.requirements} />
        <Details title={you ? t("Danach für dich wichtig") : t("Nach der Bewilligung")} items={info.afterwards} />
        {info.plus && <Details title={info.plus.title} items={[info.plus.text]} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <a href={info.link.url} target="_blank" rel="noreferrer" className="link">{t(info.link.label)} ↗</a>
        {handbookHref && <Link href={handbookHref} className="link">{t("Alle Schritte im Handbuch")} →</Link>}
      </div>
      <p className="text-xs text-muted">{t("Allgemeine Informationen, Stand {stand}, keine Rechtsberatung. Verbindlich ist dein Bescheid.", { stand: t(STAND) })}</p>
    </section>
  );
}

/** Förderart noch offen: beide Wege kurz nebeneinander */
export async function FoerderWahl({ handbookHref }: { handbookHref?: string }) {
  const t = await getT();
  const items = [GRUENDUNGSZUSCHUSS, EINSTIEGSGELD];
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">{t("Förderung für deine Gründung")}</h2>
        <p className="text-sm text-muted">{t("Je nachdem, ob du Arbeitslosengeld oder Grundsicherungsgeld bekommst, gibt es eine andere Förderung. Welche zu dir passt, klären wir im Coaching.")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <div key={i.key} className="space-y-2 rounded-2xl border border-line-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{t(i.who)}</p>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold">{t(i.title)} <span className="text-xs font-semibold text-muted">{i.law}</span></p>
            <ul className="space-y-1 text-sm">
              {i.facts.map((f) => <li key={f.label}><span className="text-muted">{t(f.label)}:</span> <strong>{t(f.value)}</strong></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{t("Stand {stand}, keine Rechtsberatung.", { stand: t(STAND) })}</span>
        {handbookHref && <Link href={handbookHref} className="link">{t("Zum Handbuch")} →</Link>}
      </div>
    </section>
  );
}
