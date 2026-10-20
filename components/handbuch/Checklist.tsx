"use client";
import { useOptimistic, useTransition } from "react";
import { toggleHandbookItem } from "@/app/actions/handbuch";
import type { CheckItem } from "@/lib/handbuch/content";
import { Rich } from "./Rich";

/** Abhakbare Schritte im Handbuch. Der Coach sieht den Stand, abhaken kann nur der Coachee. */
export function Checklist({ coacheeId, items, done, editable }: { coacheeId: string; items: CheckItem[]; done: string[]; editable: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(new Set(done), (state: Set<string>, change: { key: string; on: boolean }) => {
    const next = new Set(state);
    if (change.on) next.add(change.key);
    else next.delete(change.key);
    return next;
  });
  const [, start] = useTransition();
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const on = optimistic.has(i.key);
        return (
          <li key={i.key}>
            <label className={`flex gap-3 rounded-2xl border p-3 transition ${on ? "border-ok/25 bg-ok-soft/60" : "border-line-soft bg-surface-2/60"} ${editable ? "cursor-pointer hover:border-accent/30" : ""}`}>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={on}
                disabled={!editable}
                onChange={(e) => {
                  const next = e.target.checked;
                  start(async () => {
                    setOptimistic({ key: i.key, on: next });
                    await toggleHandbookItem(coacheeId, i.key, next);
                  });
                }}
              />
              <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-accent-2/20 ${on ? "border-ok bg-ok text-white" : "border-line bg-surface"}`}>
                {on && <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>}
              </span>
              <span className="min-w-0">
                <span className={`block text-[15px] leading-snug ${on ? "text-muted line-through decoration-ok/40" : "font-medium"}`}><Rich text={i.text} /></span>
                {i.hint && <span className="mt-1 block text-sm leading-relaxed text-muted">{i.hint}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
