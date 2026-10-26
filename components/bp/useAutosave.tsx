"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/LangProvider";

export type SaveState = { kind: "saved" | "dirty" | "saving" | "error" | "conflict"; message?: string; by?: string | null };
export type SaveResult = { ok: true } | { ok: false; error?: string; conflict?: { by: string | null } };

/**
 * Speichert automatisch kurz nach der letzten Änderung. Was während des Speicherns dazukommt, wird direkt danach
 * nachgeschoben. Bei einem Konflikt wird angehalten, bis der Nutzer entscheidet (resume).
 */
export function useAutosave(run: () => Promise<SaveResult>, delay = 900) {
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const runRef = useRef(run);
  const busy = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    runRef.current = run;
  });

  const save = useCallback((): Promise<void> => {
    if (timer.current) window.clearTimeout(timer.current);
    if (blocked.current) return Promise.resolve();
    if (busy.current) {
      pending.current = true;
      return busy.current;
    }
    busy.current = (async () => {
      do {
        pending.current = false;
        setState({ kind: "saving" });
        try {
          const res = await runRef.current();
          if (res.ok) setState(pending.current ? { kind: "dirty" } : { kind: "saved" });
          else if (res.conflict) {
            blocked.current = true;
            setState({ kind: "conflict", by: res.conflict.by });
          } else setState({ kind: "error", message: res.error });
        } catch {
          setState({ kind: "error", message: "Keine Verbindung, neuer Versuch …" });
          pending.current = true;
          await new Promise((r) => setTimeout(r, 3000));
        }
      } while (pending.current && !blocked.current);
      busy.current = null;
    })();
    return busy.current;
  }, []);

  const schedule = useCallback(() => {
    setState((s) => (s.kind === "conflict" ? s : { kind: "dirty" }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), delay);
  }, [save, delay]);

  const resume = useCallback(() => {
    blocked.current = false;
    void save();
  }, [save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.kind === "dirty" || state.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.kind]);

  return { state, schedule, save, resume };
}

export function SaveBadge({ state }: { state: SaveState }) {
  const t = useT();
  const text = t({ saved: "Gespeichert", dirty: "Ungespeichert …", saving: "Speichert …", error: state.message ?? "Nicht gespeichert", conflict: "Angehalten" }[state.kind]);
  const tone = state.kind === "error" || state.kind === "conflict" ? "text-danger" : state.kind === "saved" ? "text-ok" : "text-muted";
  return <span className={`text-xs font-semibold ${tone}`} role="status">{state.kind === "saved" ? "✓ " : ""}{text}</span>;
}
