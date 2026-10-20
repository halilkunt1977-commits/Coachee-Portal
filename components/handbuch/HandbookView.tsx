import Link from "next/link";
import { Ring } from "@/components/dashboard/Charts";
import { Icon } from "@/components/shell/icons";
import type { Block, Chapter, Handbook } from "@/lib/handbuch/content";
import { Checklist } from "./Checklist";
import { Rich } from "./Rich";

type Props = { book: Handbook; name: string; done: string[]; total: number; coacheeId: string; editable: boolean; pdfHref: string; embedded?: boolean };

const chapterChecks = (c: Chapter) => c.blocks.flatMap((b) => (b.kind === "check" ? b.items.map((i) => i.key) : []));

/** Kleines Buch als Blickfang im Kopf: Einband in Nachtblau mit Goldprägung */
function BookMark({ title, badge }: { title: string; badge: string }) {
  return (
    <div aria-hidden className="relative mx-auto h-56 w-40 shrink-0 rotate-[-4deg] sm:h-64 sm:w-44">
      <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-r-xl rounded-l-sm bg-[#e9e3d6]" />
      <div className="absolute inset-0 flex flex-col overflow-hidden rounded-r-xl rounded-l-sm bg-gradient-to-br from-[#16325a] to-[#0a1628] shadow-[0_24px_40px_-18px_rgba(0,0,0,.7)] ring-1 ring-white/10">
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="mx-4 mt-5 h-px bg-gradient-to-r from-transparent via-[#e2bd7d] to-transparent" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#e9c88c] to-gold font-[family-name:var(--font-display)] text-lg font-extrabold text-night">G</span>
          <span className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold text-[#f3d9a6]">{title}</span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/50">{badge}</span>
        </div>
        <div className="mx-4 mb-5 h-px bg-gradient-to-r from-transparent via-[#e2bd7d] to-transparent" />
      </div>
    </div>
  );
}

function BlockView({ b, coacheeId, done, editable }: { b: Block; coacheeId: string; done: string[]; editable: boolean }) {
  switch (b.kind) {
    case "text":
      return <p className="text-[15px] leading-relaxed hyphens-auto sm:text-justify"><Rich text={b.text} /></p>;
    case "quote":
      return (
        <figure className="rounded-r-2xl border-l-4 border-gold bg-gold-soft/60 px-4 py-3">
          <figcaption className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">{b.label}</figcaption>
          <blockquote className="mt-1 whitespace-pre-wrap font-[family-name:var(--font-display)] text-lg leading-snug">{b.text}</blockquote>
        </figure>
      );
    case "check":
      return (
        <div className="space-y-2">
          {b.title && <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">{b.title}</h3>}
          <Checklist coacheeId={coacheeId} items={b.items} done={done.filter((d) => b.items.some((i) => i.key === d))} editable={editable} />
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          {b.title && <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">{b.title}</h3>}
          <ul className="space-y-2">
            {b.items.map((t) => (
              <li key={t} className="flex gap-3 text-[15px] leading-relaxed">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold" />
                <span className="min-w-0 hyphens-auto sm:text-justify"><Rich text={t} /></span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "facts":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          {b.items.map((f) => (
            <div key={f.label} className="rounded-2xl bg-tint p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{f.label}</p>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{f.value}</p>
              {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
            </div>
          ))}
        </div>
      );
    case "dates":
      return (
        <div className="space-y-2">
          {b.title && <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">{b.title}</h3>}
          <ol className="relative space-y-3 border-l-2 border-gold/30 pl-5">
            {b.items.map((d) => (
              <li key={d.when} className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-gold bg-surface" />
                <p className="text-sm font-bold text-accent">{d.when}</p>
                <p className="text-[15px] leading-relaxed text-ink/90">{d.what}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "contacts":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {b.items.map((c) => (
            <div key={c.name} className="space-y-1 rounded-2xl border border-line-soft p-4">
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm">{c.what}</p>
              <p className="text-sm text-muted">{c.how}</p>
              {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="link text-sm break-all">{c.url.replace(/^https:\/\/(www\.)?/, "")} ↗</a>}
            </div>
          ))}
        </div>
      );
    case "tools":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {b.items.map((t) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-sm text-muted">{t.text}</span>
                </span>
                {editable && <span className="text-accent transition group-hover:translate-x-1"><Icon name="arrow" className="size-4" /></span>}
              </>
            );
            return editable ? (
              <Link key={t.label} href={t.href} className="group flex items-center gap-3 rounded-2xl border border-line-soft p-3.5 transition hover:border-accent/30 hover:bg-tint/40">{inner}</Link>
            ) : (
              <div key={t.label} className="flex items-center gap-3 rounded-2xl border border-line-soft p-3.5">{inner}</div>
            );
          })}
        </div>
      );
    case "tip":
      return (
        <aside className="flex gap-3 rounded-2xl bg-tint p-4">
          <span className="mt-0.5 shrink-0 text-accent"><Icon name="bulb" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-accent">{b.title}</p>
            <p className="text-sm leading-relaxed hyphens-auto sm:text-justify"><Rich text={b.text} /></p>
          </div>
        </aside>
      );
  }
}

/** Das Handbuch als Webseite: Einband, Inhaltsverzeichnis, Kapitel mit Checklisten. Für Coachee (abhaken) und Coach (lesen). */
export function HandbookView({ book, name, done, total, coacheeId, editable, pdfHref, embedded = false }: Props) {
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  return (
    <div className="space-y-6">
      <section className={`rise night relative overflow-hidden px-5 pt-8 pb-8 sm:px-9 sm:py-10 ${embedded ? "rounded-[24px]" : "-mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-[28px]"}`}>
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e2bd7d]">{book.title} · {book.badge}</p>
            <h1 className="font-[family-name:var(--font-display)] text-[32px] leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">{book.subtitle}</h1>
            <p className="text-white/70">für <span className="font-semibold text-white">{name}</span> · Stand {book.stand}</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href={pdfHref} className="btn-gold"><Icon name="book" className="size-4" /> Als Büchlein (PDF) laden</a>
              {total > 0 && (
                <div className="glass flex items-center gap-3 py-2 pr-4 pl-2">
                  <Ring pct={pct} size={44} stroke={5} tone="white" track="rgba(255,255,255,.15)"><span className="text-[11px] font-bold">{pct}%</span></Ring>
                  <span className="text-sm"><span className="font-semibold">{done.length} von {total}</span> <span className="text-white/60">Schritten erledigt</span></span>
                </div>
              )}
            </div>
          </div>
          <div className="hidden md:block"><BookMark title={book.subtitle} badge={book.badge} /></div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Inhalt" className="lg:sticky lg:top-6">
          <p className="eyebrow mb-2 hidden lg:block">Inhalt</p>
          <ol className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {book.chapters.map((c, i) => {
              const keys = chapterChecks(c);
              const n = keys.filter((k) => done.includes(k)).length;
              return (
                <li key={c.key} className="shrink-0">
                  <a href={`#${c.key}`} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-line-soft transition hover:text-accent lg:bg-transparent lg:ring-0 lg:hover:bg-surface">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-tint text-[11px] font-bold text-accent">{i + 1}</span>
                    <span className="min-w-0 whitespace-nowrap lg:flex-1 lg:truncate">{c.title}</span>
                    {keys.length > 0 && <span className={`text-[11px] font-semibold tabular-nums ${n === keys.length ? "text-ok" : "text-muted"}`}>{n === keys.length ? "✓" : `${n}/${keys.length}`}</span>}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {book.chapters.map((c, i) => (
            <article key={c.key} id={c.key} className="card scroll-mt-24 space-y-5 sm:p-8">
              <header className="space-y-1 border-b border-line-soft pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Kapitel {i + 1}</p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-balance sm:text-[28px]">{c.title}</h2>
                <p className="text-muted">{c.lead}</p>
              </header>
              {c.blocks.map((b, j) => <BlockView key={j} b={b} coacheeId={coacheeId} done={done} editable={editable} />)}
            </article>
          ))}
          <p className="px-1 text-xs text-muted">Allgemeine Informationen, Stand {book.stand}, keine Rechts- oder Steuerberatung. Verbindlich ist immer dein Bescheid.</p>
        </div>
      </div>
    </div>
  );
}
