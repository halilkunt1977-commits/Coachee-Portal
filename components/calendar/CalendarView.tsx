import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import {
  addDays,
  addMonths,
  dayLong,
  dayNum,
  isoWeek,
  KINDS,
  minutes,
  monthTitle,
  monthWeeks,
  relativeDay,
  weekday,
  weekdayShort,
  weekStart,
} from "@/lib/calendar/dates";
import type { CalItem } from "@/lib/calendar/store";

export type View = "monat" | "woche" | "liste";
export const isView = (v: unknown): v is View => v === "monat" || v === "woche" || v === "liste";

/** Zeitraum, den eine Ansicht braucht */
export function rangeFor(view: View, day: string) {
  if (view === "woche") return { from: weekStart(day), to: addDays(weekStart(day), 6) };
  if (view === "liste") return { from: day, to: addDays(day, 41) };
  const weeks = monthWeeks(day);
  return { from: weeks[0][0], to: weeks.at(-1)![6] };
}

type Props = { items: CalItem[]; view: View; day: string; today: string; path: string; selected?: string | null };

const link = (path: string, p: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => Boolean(e[1])));
  return `${path}?${qs}`;
};

const OUTLOOK = { label: "Outlook", short: "Outlook", dot: "bg-[#0f6cbd]", chip: "border-[#0f6cbd]/20 bg-[#e8f1fb] text-[#0b4f8a]" };
const TASK = { label: "Aufgabe", short: "Aufgabe", dot: "bg-danger", chip: "border-dashed border-line bg-surface text-muted" };
export const styleOf = (k: CalItem["kind"]) => (k === "outlook" ? OUTLOOK : k === "task" ? TASK : KINDS[k]);

export function CalendarView({ items, view, day, today, path, selected }: Props) {
  const step = view === "monat" ? (n: number) => addMonths(day, n) : (n: number) => addDays(day, n * (view === "woche" ? 7 : 42));
  const title = view === "monat" ? monthTitle(day) : view === "woche" ? `KW ${isoWeek(day)} · ${monthTitle(weekStart(day))}` : `Ab ${dayLong(day)}`;
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);

  return (
    <section className="card overflow-hidden !p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-line bg-surface">
            <Link href={link(path, { ansicht: view, datum: step(-1) })} aria-label="Zurück" className="grid size-9 place-items-center rounded-l-xl text-muted transition hover:bg-surface-2 hover:text-accent">
              <span className="rotate-180"><Icon name="arrow" className="size-4" /></span>
            </Link>
            <Link href={link(path, { ansicht: view, datum: step(1) })} aria-label="Weiter" className="grid size-9 place-items-center rounded-r-xl border-l border-line text-muted transition hover:bg-surface-2 hover:text-accent">
              <Icon name="arrow" className="size-4" />
            </Link>
          </div>
          <Link href={link(path, { ansicht: view, datum: today })} className="btn-ghost btn-sm !py-2">Heute</Link>
          <h2 className="h2 ml-1 capitalize">{title}</h2>
        </div>
        <nav className="flex rounded-xl bg-surface-2 p-1 text-sm font-semibold" aria-label="Ansicht">
          {(["monat", "woche", "liste"] as const).map((v) => (
            <Link key={v} href={link(path, { ansicht: v, datum: day })} className={`rounded-lg px-3 py-1.5 transition ${v === view ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-ink"}`}>
              {{ monat: "Monat", woche: "Woche", liste: "Liste" }[v]}
            </Link>
          ))}
        </nav>
      </header>
      {view === "monat" && <Month byDay={byDay} day={day} today={today} path={path} selected={selected} />}
      {view === "woche" && <Week byDay={byDay} day={day} today={today} path={path} selected={selected} />}
      {view === "liste" && <Agenda items={items} today={today} selected={selected} />}
    </section>
  );
}

function Chip({ it, selected, compact = false }: { it: CalItem; selected?: string | null; compact?: boolean }) {
  const s = styleOf(it.kind);
  const cls = `group flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] leading-tight transition hover:brightness-95 ${s.chip} ${it.cancelled || it.done ? "line-through opacity-60" : ""} ${selected === it.key ? "ring-2 ring-accent/50" : ""}`;
  const inner = (
    <>
      {it.kind === "task" ? <Icon name="check" className="size-3 shrink-0" /> : <span className={`size-1.5 shrink-0 rounded-full ${s.dot}`} />}
      {it.start && !compact && <span className="hidden shrink-0 font-semibold tabular-nums 2xl:inline">{it.start}</span>}
      <span className="truncate">{it.title}</span>
    </>
  );
  if (!it.href) return <span className={cls}>{inner}</span>;
  return it.external ? <a href={it.href} target="_blank" rel="noreferrer" className={cls} title={`${it.start ?? ""} ${it.title}`.trim()}>{inner}</a> : <Link href={it.href} scroll={false} className={cls} title={`${it.start ?? ""} ${it.title}`.trim()}>{inner}</Link>;
}

function Month({ byDay, day, today, path, selected }: { byDay: Map<string, CalItem[]>; day: string; today: string; path: string; selected?: string | null }) {
  const weeks = monthWeeks(day);
  const month = day.slice(0, 7);
  const picked = byDay.get(day) ?? [];
  return (
    <>
      <div className="grid grid-cols-7 border-b border-line-soft bg-surface-2/60 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
        {weeks[0].map((d) => <div key={d} className="py-2">{weekdayShort(d)}</div>)}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
        {weeks.flat().map((d, i) => {
          const list = byDay.get(d) ?? [];
          const other = d.slice(0, 7) !== month;
          const isToday = d === today;
          const weekend = weekday(d) >= 5;
          return (
            <div key={d} className={`relative min-h-[64px] border-line-soft p-1 sm:min-h-[112px] sm:p-1.5 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${other ? "bg-surface-2/50" : weekend ? "bg-surface-2/25" : ""} ${d === day ? "bg-tint/50" : ""}`}>
              <Link href={link(path, { ansicht: "monat", datum: d })} scroll={false} className={`mb-1 inline-grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums transition hover:bg-tint ${isToday ? "bg-gradient-to-br from-[#e2bd7d] to-gold text-night shadow-sm" : other ? "text-muted/60" : "text-ink"}`}>
                {dayNum(d)}
              </Link>
              {/* Am Handy nur Punkte, ab Tablet die Einträge */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 4).map((it) => <span key={it.key} className={`size-1.5 rounded-full ${styleOf(it.kind).dot} ${it.cancelled ? "opacity-40" : ""}`} />)}
              </div>
              <div className="hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((it) => <Chip key={it.key} it={it} selected={selected} />)}
                {list.length > 3 && (
                  <Link href={link(path, { ansicht: "woche", datum: d })} className="block px-1 text-[11px] font-semibold text-accent hover:underline">+{list.length - 3} weitere</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Gewählter Tag als Liste, vor allem fürs Handy */}
      <div className="border-t border-line-soft px-4 py-4 sm:hidden">
        <p className="eyebrow mb-2">{relativeDay(day, today)}</p>
        {picked.length ? <div className="space-y-2">{picked.map((it) => <AgendaRow key={it.key} it={it} selected={selected} />)}</div> : <p className="text-sm text-muted">Keine Termine an diesem Tag.</p>}
      </div>
    </>
  );
}

const HOURS = { from: 7, to: 20 };

function Week({ byDay, day, today, path, selected }: { byDay: Map<string, CalItem[]>; day: string; today: string; path: string; selected?: string | null }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
  const span = (HOURS.to - HOURS.from) * 60;
  const pos = (hm: string) => Math.min(Math.max(((minutes(hm) - HOURS.from * 60) / span) * 100, 0), 100);
  return (
    <div className="overflow-x-auto scroll-soft">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line-soft bg-surface-2/60">
          <div />
          {days.map((d) => (
            <Link key={d} href={link(path, { ansicht: "woche", datum: d })} scroll={false} className={`border-l border-line-soft px-2 py-2 text-center transition hover:bg-tint/60 ${d === day ? "bg-tint/50" : ""}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{weekdayShort(d)}</p>
              <p className={`mx-auto mt-0.5 grid size-8 place-items-center rounded-full text-[15px] font-bold tabular-nums ${d === today ? "bg-gradient-to-br from-[#e2bd7d] to-gold text-night" : ""}`}>{dayNum(d)}</p>
            </Link>
          ))}
        </div>
        {/* Ganztägiges und Aufgaben */}
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line-soft">
          <div className="px-1 py-1.5 text-right text-[10px] leading-tight text-muted">ganzer Tag</div>
          {days.map((d) => (
            <div key={d} className="min-h-8 space-y-0.5 border-l border-line-soft p-1">
              {(byDay.get(d) ?? []).filter((it) => !it.start).map((it) => <Chip key={it.key} it={it} selected={selected} />)}
            </div>
          ))}
        </div>
        <div className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height: (HOURS.to - HOURS.from) * 52 }}>
          <div className="relative">
            {Array.from({ length: HOURS.to - HOURS.from }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-muted" style={{ top: `${(h / (HOURS.to - HOURS.from)) * 100}%` }}>{h ? `${HOURS.from + h}:00` : ""}</span>
            ))}
          </div>
          {days.map((d) => {
            const timed = (byDay.get(d) ?? []).filter((it) => it.start && it.end);
            return (
              <div key={d} className={`relative border-l border-line-soft ${weekday(d) >= 5 ? "bg-surface-2/40" : ""}`}>
                {Array.from({ length: HOURS.to - HOURS.from }, (_, h) => <div key={h} className="border-t border-line-soft/70" style={{ height: `${100 / (HOURS.to - HOURS.from)}%` }} />)}
                {d === today && <NowLine pos={pos} />}
                {timed.map((it, i) => {
                  const top = pos(it.start!);
                  const height = Math.max(pos(it.end!) - top, 3.2);
                  // Überschneidungen nebeneinander
                  const overlap = timed.filter((o) => o.start! < it.end! && o.end! > it.start!);
                  const col = overlap.indexOf(it);
                  const w = 100 / overlap.length;
                  const s = styleOf(it.kind);
                  const body = (
                    <>
                      <p className="truncate font-semibold">{it.title}</p>
                      <p className="truncate opacity-80 tabular-nums">{it.start}–{it.end}{it.sub ? ` · ${it.sub}` : ""}</p>
                    </>
                  );
                  const cls = `absolute overflow-hidden rounded-lg border px-1.5 py-1 text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md ${s.chip} ${it.cancelled ? "line-through opacity-60" : ""} ${selected === it.key ? "z-10 ring-2 ring-accent/60" : ""}`;
                  const style = { top: `${top}%`, height: `${height}%`, left: `calc(${col * w}% + 2px)`, width: `calc(${w}% - 4px)`, ["--i" as string]: i };
                  return it.external && it.href ? (
                    <a key={it.key} href={it.href} target="_blank" rel="noreferrer" className={cls} style={style}>{body}</a>
                  ) : (
                    <Link key={it.key} href={it.href ?? "#"} scroll={false} className={cls} style={style}>{body}</Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine({ pos }: { pos: (hm: string) => number }) {
  const now = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const p = pos(now);
  if (p <= 0 || p >= 100) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${p}%` }}>
      <div className="relative h-0.5 bg-danger"><span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-danger" /></div>
    </div>
  );
}

export function AgendaRow({ it, selected }: { it: CalItem; selected?: string | null }) {
  const s = styleOf(it.kind);
  const inner = (
    <>
      <div className="w-14 shrink-0 text-right tabular-nums">
        {it.start ? <><p className="text-sm font-bold">{it.start}</p><p className="text-[11px] text-muted">{it.end}</p></> : <p className="text-[11px] font-semibold text-muted">{it.kind === "task" ? "fällig" : "ganztags"}</p>}
      </div>
      <span className={`w-1 self-stretch rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${it.cancelled || it.done ? "text-muted line-through" : ""}`}>{it.title}</p>
        <p className="truncate text-xs text-muted">{[it.cancelled ? "abgesagt" : s.short, it.sub].filter(Boolean).join(" · ")}</p>
      </div>
      {it.joinUrl && !it.cancelled && <span className="hidden rounded-full bg-[#5b5fc7] px-2 py-0.5 text-[10px] font-bold text-white sm:inline">Teams</span>}
    </>
  );
  const cls = `flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2 ${selected === it.key ? "bg-tint/60" : ""}`;
  if (!it.href) return <div className={cls}>{inner}</div>;
  return it.external ? <a href={it.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <Link href={it.href} scroll={false} className={cls}>{inner}</Link>;
}

function Agenda({ items, today, selected }: { items: CalItem[]; today: string; selected?: string | null }) {
  const days = [...new Set(items.map((i) => i.day))];
  if (!days.length) return <p className="px-5 py-12 text-center text-sm text-muted">In den nächsten sechs Wochen steht nichts an.</p>;
  return (
    <div className="divide-y divide-line-soft">
      {days.map((d) => (
        <div key={d} className="grid gap-1 px-3 py-3 sm:grid-cols-[150px_1fr] sm:px-5">
          <div className="px-2 pt-2">
            <p className={`text-sm font-bold ${d === today ? "text-gold" : ""}`}>{relativeDay(d, today)}</p>
            <p className="text-xs text-muted">{dayLong(d).split(", ").slice(1).join(", ")}</p>
          </div>
          <div>{items.filter((i) => i.day === d).map((it) => <AgendaRow key={it.key} it={it} selected={selected} />)}</div>
        </div>
      ))}
    </div>
  );
}
