"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/shell/Avatar";
import { Icon } from "@/components/shell/icons";
import { ago } from "@/lib/inbox/time";
import { presenceState, presenceText, type Presence, type PresenceState } from "@/lib/presence";

type Data = { now: string; list: Presence[] };
const Ctx = createContext<{ now: number; byId: Map<string, Presence>; list: Presence[] } | null>(null);
const EVERY_MS = 30_000;

/**
 * Online-Stand der eigenen Coachees für alle Ansichten des Coachs. Startet mit den Daten vom Server
 * und fragt alle 30 Sekunden nach (nur solange der Tab sichtbar ist), ohne die Seite neu zu laden.
 */
export function PresenceProvider({ initial, children }: { initial: Data; children: ReactNode }) {
  const [data, setData] = useState(initial);
  // Neuere Daten vom Server (z. B. nach router.refresh) übernehmen
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    if (initial.now > data.now) setData(initial);
  }
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/praesenz", { cache: "no-store" }).catch(() => null);
      if (alive && res?.ok) setData(await res.json());
    };
    const timer = setInterval(load, EVERY_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  const value = { now: new Date(data.now).getTime(), byId: new Map(data.list.map((p) => [p.id, p])), list: data.list };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function usePresence(id: string) {
  const ctx = useContext(Ctx);
  const p = ctx?.byId.get(id);
  return { p, now: ctx?.now ?? 0, state: ctx ? presenceState(p, ctx.now) : ("offline" as PresenceState) };
}

const DOT = { online: "bg-emerald-500", kuerzlich: "bg-amber-400" } as const;

/** Grüner Punkt: online, gelber: kürzlich aktiv, grauer: nicht da (nur bei Coachees mit Zugang). dark = auf dunklem Grund (Seitenleiste, Akte-Kopf). */
export function PresenceDot({ id, dark = false, className = "" }: { id: string; dark?: boolean; className?: string }) {
  const { p, now, state } = usePresence(id);
  if (!p) return null; // ohne Zugang zum Portal kein Punkt
  const label = presenceText(p, now) ?? "Noch nie online";
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`inline-block size-2.5 shrink-0 rounded-full ${state === "offline" ? (dark ? "bg-white/25" : "bg-line") : DOT[state]} ${state === "online" ? "shadow-[0_0_0_3px_rgba(16,185,129,.22)]" : ""} ${className}`}
    />
  );
}

/** Zeile im Akte-Kopf: „Online · gerade bei Lebenslauf“ oder „Zuletzt online gestern“ */
export function PresenceLine({ id }: { id: string }) {
  const { p, now, state } = usePresence(id);
  const text = presenceText(p, now);
  if (!text) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${state === "online" ? "font-semibold text-emerald-300" : ""}`}>
      <PresenceDot id={id} dark />
      {text}
    </span>
  );
}

/** Karte „Gerade online“ auf dem Dashboard des Coachs */
export function OnlineCard({ style }: { style?: React.CSSProperties }) {
  const ctx = useContext(Ctx);
  const now = ctx?.now ?? 0;
  const list = ctx?.list ?? [];
  const online = list.filter((p) => presenceState(p, now) === "online");
  const recent = list.filter((p) => presenceState(p, now) === "kuerzlich");
  const row = (p: Presence, state: PresenceState) => (
    <li key={p.id}>
      <Link href={`/coach/coachees/${p.id}`} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition hover:bg-surface-2">
        <span className="relative">
          <Avatar name={p.name} size="size-8" className="!text-[10px]" />
          <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface ${DOT[state as "online" | "kuerzlich"]}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold group-hover:text-accent">{p.name}</span>
          <span className="block truncate text-xs text-muted">{state === "online" ? <>gerade bei: <b className="font-medium text-ink">{p.area}</b></> : `zuletzt ${ago(p.seen!, now)} · bei ${p.area}`}</span>
        </span>
        <span className="text-muted opacity-0 transition group-hover:opacity-100"><Icon name="arrow" className="size-4" /></span>
      </Link>
    </li>
  );
  return (
    <section className="rise card space-y-2 !p-4 sm:!p-5" style={style}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-ok-soft text-ok"><Icon name="users" className="size-4" /></span>
        <h2 className="h2">Gerade online</h2>
        {online.length > 0 ? <span className="ml-auto rounded-full bg-emerald-500 px-2 text-xs font-bold text-white">{online.length}</span> : <span className="ml-auto text-sm text-muted">niemand</span>}
      </div>
      {online.length === 0 ? null : (
        <ul className="space-y-1">{online.map((p) => row(p, "online"))}</ul>
      )}
      {recent.length > 0 && (
        <div className="space-y-1">
          <p className="px-2.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Kürzlich aktiv</p>
          <ul className="space-y-1">{recent.map((p) => row(p, "kuerzlich"))}</ul>
        </div>
      )}
    </section>
  );
}
