"use client";
import { useEffect, useRef, useState } from "react";
import type { CvPhoto } from "@/lib/cv/types";

/** Ausschnitt des Bewerbungsfotos wählen: ziehen zum Verschieben, Regler zum Vergrößern. */
export function PhotoDialog({ src, value, onCancel, onSave }: { src: string; value: CvPhoto; onCancel: () => void; onSave: (v: CvPhoto) => void }) {
  const [v, setV] = useState(value);
  const drag = useRef<{ x: number; y: number; start: CvPhoto } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const k = 100 / (180 * v.zoom);
    setV({ ...v, x: clamp(drag.current.start.x - (e.clientX - drag.current.x) * k), y: clamp(drag.current.start.y - (e.clientY - drag.current.y) * k) });
  };

  return (
    <dialog ref={dialog} onCancel={onCancel} className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line-soft bg-surface p-0 text-ink backdrop:bg-ink/40">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="h2">Foto zuschneiden</h2>
          <p className="text-sm text-muted">Bild mit der Maus oder dem Finger verschieben, mit dem Regler vergrößern.</p>
        </div>
        <div
          className="mx-auto size-[180px] touch-none cursor-grab overflow-hidden rounded-xl bg-bg ring-1 ring-line active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, start: v };
          }}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="size-full select-none object-cover" style={{ objectPosition: `${v.x}% ${v.y}%`, transform: `scale(${v.zoom})`, transformOrigin: `${v.x}% ${v.y}%` }} />
        </div>
        <label className="block">
          <span className="label">Größe</span>
          <input type="range" min={1} max={3} step={0.05} value={v.zoom} onChange={(e) => setV({ ...v, zoom: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn" onClick={() => onSave(v)}>Übernehmen</button>
        </div>
      </div>
    </dialog>
  );
}

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
