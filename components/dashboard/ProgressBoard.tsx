import Link from "next/link";
import { toggleMilestone } from "@/app/actions/dashboard";
import { formatDate, formatHours, formatUnits, ueToHours } from "@/components/ui";
import type { Links, Progress } from "@/lib/dashboard/progress";
import { Meter, Ring, WeekBars, toneFor } from "./Charts";

const de = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/** Unterrichtseinheiten: Ring mit Rest in der Mitte, Tempo bis zum Ende, Balken pro Woche. Coachees sehen Zeitstunden statt UE. */
export function UnitsCard({ p, href, you }: { p: Progress; href: string; you: boolean }) {
  const u = p.units;
  const low = u.rest != null && u.total ? u.rest / u.total <= 0.1 : false;
  const fmt = you ? formatHours : formatUnits;
  const num = (n: number) => de(you ? ueToHours(n) : n);
  const weeks = you ? p.weeks.map((w) => ({ ...w, units: ueToHours(w.units) })) : p.weeks;
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h2">{you ? "Deine Coaching-Stunden" : "Unterrichtseinheiten"}</h2>
        <Link href={href} className="link text-sm">Termine</Link>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <Ring pct={u.pct ?? 0} size={128} stroke={14} tone={low ? "danger" : "accent"}>
          {u.rest != null ? (
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">{num(u.rest)}</p>
              <p className="text-[11px] text-muted">{you ? "Stunden übrig" : "UE übrig"}</p>
            </div>
          ) : (
            <p className="text-xs text-muted">kein<br />Kontingent</p>
          )}
        </Ring>
        <dl className="grid min-w-0 flex-1 basis-40 grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted">Verbraucht</dt><dd className="font-semibold tabular-nums">{fmt(u.used)}</dd></div>
          <div><dt className="text-xs text-muted">Bewilligt</dt><dd className="font-semibold tabular-nums">{u.total != null ? fmt(u.total) : "–"}</dd></div>
          <div><dt className="text-xs text-muted">Noch Wochen</dt><dd className="font-semibold tabular-nums">{u.weeksLeft != null ? de(u.weeksLeft) : "–"}</dd></div>
          <div><dt className="text-xs text-muted">Nötig pro Woche</dt><dd className={`font-semibold tabular-nums ${u.perWeek && u.perWeek > 6 ? "text-danger" : ""}`}>{u.perWeek != null ? (you ? fmt(u.perWeek) : `${de(u.perWeek)} UE`) : "–"}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted">{you ? "Dein letzter Termin" : "Letzter Termin"}</dt><dd className="font-semibold">{formatDate(u.last)}</dd></div>
        </dl>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{you ? "Stunden pro Kalenderwoche" : "UE pro Kalenderwoche"}</p>
        <WeekBars weeks={weeks} height={96} unit={you ? "Stunden" : "UE"} />
      </div>
    </section>
  );
}

/** Gesamtstand plus je Baustein ein Ring */
export function PartsGrid({ p, links, overall = true }: { p: Progress; links: Links; overall?: boolean }) {
  const n = p.parts.length + (overall ? 1 : 0);
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${n >= 6 ? "lg:grid-cols-6" : n === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      {overall && <div className="rise night card col-span-2 !border-transparent flex items-center gap-4  sm:col-span-1 lg:col-span-1 lg:flex-col lg:justify-center lg:text-center">
        <Ring pct={p.overall} size={84} stroke={9} tone="white" track="rgba(255,255,255,.2)">
          <span className="font-[family-name:var(--font-display)] text-xl font-bold">{p.overall}%</span>
        </Ring>
        <div>
          <p className="font-semibold">Gesamtstand</p>
          <p className="text-xs text-white/70">Bausteine und Etappen</p>
        </div>
      </div>}
      {p.parts.map((x, i) => (
        <Link key={x.key} href={links[x.href]} style={{ ["--i" as string]: i + 1 }} className="rise card card-hover group flex flex-col items-center gap-2 !p-4 text-center">
          <Ring pct={x.pct} size={64} stroke={7} tone={toneFor(x.pct)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold group-hover:text-accent">{x.label}</p>
            <p className="text-xs text-muted">{x.detail}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Kapitel des Businessplans: fertig, angefangen, offen */
export function ChaptersCard({ p, href }: { p: Progress; href: string }) {
  const done = p.sections.filter((s) => s.done).length;
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h2">Businessplan</h2>
        <Link href={href} className="link text-sm">Öffnen</Link>
      </div>
      <Meter pct={(done / p.sections.length) * 100} />
      <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {p.sections.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? "bg-ok text-white" : s.chars ? "bg-[#fbf1e3] text-gold" : "bg-bg text-muted"}`}>{s.done ? "✓" : s.chars ? "…" : ""}</span>
            <span className={s.done ? "" : "text-muted"}>{s.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bewerbungen als Trichter: Vorschläge, verschickt, Gespräche, Zusagen */
export function JobsFunnel({ p, href }: { p: Progress; href: string }) {
  const j = p.jobs ?? { proposals: 0, applied: 0, talks: 0, offers: 0, due: 0 };
  const steps = [
    { label: "Vorschläge offen", n: j.proposals },
    { label: "Bewerbungen", n: j.applied },
    { label: "Gespräche", n: j.talks },
    { label: "Zusagen", n: j.offers },
  ];
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h2">Bewerbungen</h2>
        <Link href={href} className="link text-sm">Öffnen</Link>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 text-muted">{s.label}</span>
            <div className="h-6 min-w-0 flex-1 rounded-md bg-bg">
              {s.n > 0 && <div className="flex h-6 items-center rounded-md px-2 text-xs font-bold text-white" style={{ width: `${Math.max(12, (s.n / max) * 100)}%`, background: ["var(--gold)", "var(--accent)", "#3d6491", "var(--ok)"][i] }}>{s.n}</div>}
            </div>
          </div>
        ))}
      </div>
      {j.due > 0 && <p className="text-sm font-semibold text-danger">Nachfassen fällig: {j.due}</p>}
    </section>
  );
}

/** Etappen zum Abhaken, als senkrechte Zeitleiste */
export function MilestonesCard({ coacheeId, p, you }: { coacheeId: string; p: Progress; you: boolean }) {
  const next = p.milestones.find((m) => !m.done);
  const done = p.milestones.filter((m) => m.done).length;
  return (
    <section id="etappen" className="card scroll-mt-24 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h2">{you ? "Meine Etappen" : "Etappen"}</h2>
        <span className="text-sm text-muted">{done} von {p.milestones.length}</span>
      </div>
      <ol className="relative space-y-0.5">
        {p.milestones.map((m, i) => (
          <li key={m.key} className="relative flex gap-3 pb-2">
            {i < p.milestones.length - 1 && <span className={`absolute left-[11px] top-6 h-[calc(100%-16px)] w-0.5 ${m.done ? "bg-ok/40" : "bg-line-soft"}`} aria-hidden />}
            <form action={toggleMilestone.bind(null, coacheeId, m.key, !m.done)}>
              <button
                title={m.done ? (m.byPortal ? "Vom Portal erkannt" : "Zurücknehmen") : "Abhaken"}
                disabled={m.byPortal}
                className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition ${m.done ? "border-ok bg-ok text-white" : m === next ? "border-gold bg-surface text-gold hover:bg-[#fbf1e3]" : "border-line bg-surface text-transparent hover:border-accent hover:text-accent"}`}
              >
                ✓
              </button>
            </form>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm font-medium ${m.done ? "text-muted line-through decoration-ok/50" : ""} ${m === next ? "!text-ink" : ""}`}>
                {m.label}
                {m === next && <span className="ml-2 rounded-full bg-[#fbf1e3] px-2 py-0.5 text-[11px] font-semibold text-gold no-underline">als Nächstes</span>}
              </p>
              <p className="text-xs text-muted">{m.done ? (m.done_on ? `erledigt am ${formatDate(m.done_on)}` : "erledigt") : m.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
