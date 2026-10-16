"use client";
import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-1.5">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input !py-2 font-mono !text-[11px]" aria-label="Abo-Link" />
      <button
        type="button"
        className="btn-ghost btn-sm shrink-0"
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => {
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            },
            () => setDone(false),
          )
        }
      >
        {done ? "Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}
