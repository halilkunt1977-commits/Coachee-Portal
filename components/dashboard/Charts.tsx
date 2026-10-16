import type { ReactNode } from "react";

// Kleine Diagramme als SVG, ohne Bibliothek: Ring, Balken pro Woche, Fortschrittsbalken.

const TONE = { accent: "var(--accent)", ok: "var(--ok)", gold: "var(--gold)", danger: "var(--danger)", white: "#ffffff" } as const;
export type Tone = keyof typeof TONE;

export const toneFor = (pct: number): Tone => (pct >= 100 ? "ok" : pct >= 50 ? "accent" : pct > 0 ? "gold" : "danger");

export function Ring({ pct, size = 72, stroke = 8, tone = "accent", track = "var(--line-soft)", children }: { pct: number; size?: number; stroke?: number; tone?: Tone; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(p / 100) * len} ${len}`} />}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">{children ?? <span className="text-sm font-bold">{Math.round(p)}%</span>}</div>
    </div>
  );
}

export function Meter({ pct, tone, className = "" }: { pct: number; tone?: Tone; className?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-line-soft ${className}`}>
      <div className="h-2 rounded-full" style={{ width: `${p}%`, background: TONE[tone ?? toneFor(p)] }} />
    </div>
  );
}

const kw = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
};
const de = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/** Unterrichtseinheiten pro Kalenderwoche, die aktuelle Woche hervorgehoben */
export function WeekBars({ weeks, height = 120, light = false }: { weeks: { week: string; units: number }[]; height?: number; light?: boolean }) {
  const max = Math.max(1, ...weeks.map((w) => w.units));
  const n = weeks.length;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {weeks.map((w, i) => {
          const h = w.units ? Math.max(6, (w.units / max) * (height - 18)) : 3;
          const current = i === n - 1;
          return (
            <div key={w.week} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`KW ${kw(w.week)}: ${de(w.units)} UE`}>
              <span className={`text-[10px] font-semibold tabular-nums ${light ? "text-white/80" : "text-muted"} ${w.units ? "" : "invisible"}`}>{de(w.units)}</span>
              <div
                className="w-full rounded-md transition-opacity group-hover:opacity-80"
                style={{ height: h, background: light ? (current ? "#ffffff" : "rgba(255,255,255,.45)") : current ? "var(--gold)" : w.units ? "var(--accent)" : "var(--line-soft)" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {weeks.map((w, i) => (
          <span key={w.week} className={`min-w-0 flex-1 text-center text-[10px] tabular-nums ${light ? "text-white/70" : "text-muted"}`}>{i % 2 === n % 2 || i === n - 1 ? kw(w.week) : ""}</span>
        ))}
      </div>
    </div>
  );
}
