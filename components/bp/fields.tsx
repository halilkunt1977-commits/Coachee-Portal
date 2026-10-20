"use client";
import { useState, type ReactNode } from "react";

/** Deutsche Zahl lesen: "1.500,50", "1500.5", "12,5" */
export function parseDe(v: string): number | null {
  let t = v.replace(/\s|€|%/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const fmt = (n: number, digits: number) => n.toLocaleString("de-DE", { maximumFractionDigits: digits });

export function Num({ label, value, onChange, suffix, digits = 2, className = "", hint }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; digits?: number; className?: string; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <span className="relative block">
        <input
          className={`input !py-2 text-right tabular-nums ${suffix ? (suffix.length > 1 ? "pr-12" : "pr-8") : ""}`}
          inputMode="decimal"
          value={draft ?? fmt(value, digits)}
          onFocus={(e) => {
            setDraft(value ? String(value).replace(".", ",") : "");
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseDe(e.target.value);
            if (n !== null) onChange(n);
          }}
          onBlur={() => setDraft(null)}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function Text({ label, value, onChange, placeholder, className = "", max = 120, list }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; max?: number; list?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input className="input !py-2" value={value} maxLength={max} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Kleines Zahlenfeld für Monatsmengen; zeigt beim Tippen den eigenen Text, sonst den Wert */
export function QtyInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`input !px-1.5 !py-1.5 text-center text-sm tabular-nums ${value ? "font-semibold" : "text-muted"}`}
      inputMode="decimal"
      aria-label={label}
      value={draft ?? (value ? fmt(value, 2) : "0")}
      onFocus={(e) => {
        setDraft(value ? String(value).replace(".", ",") : "");
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseDe(e.target.value);
        if (n !== null && n >= 0) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Pick({ label, value, onChange, options, className = "" }: { label: string; value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[]; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select className="input !py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Liste gleichartiger Zeilen (Anschaffungen, Kosten …) als Karten, die auf dem Handy umbrechen. */
export function Rows<T>({ rows, onChange, render, make, addLabel, empty, presets }: {
  rows: T[];
  onChange: (rows: T[]) => void;
  render: (row: T, set: (patch: Partial<T>) => void, i: number) => ReactNode;
  make: (label?: string) => T;
  addLabel: string;
  empty: string;
  presets?: string[];
}) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-line-soft bg-bg/50 p-3">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-wrap">{render(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))), i)}</div>
          <button type="button" aria-label="Zeile löschen" title="Löschen" className="mt-6 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...rows, make()])}>+ {addLabel}</button>
        {presets?.filter((p) => !rows.some((r) => (r as { label?: string }).label === p)).map((p) => (
          <button key={p} type="button" className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => onChange([...rows, make(p)])}>+ {p}</button>
        ))}
      </div>
    </div>
  );
}
