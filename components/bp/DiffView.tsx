"use client";
import { useMemo } from "react";
import { diffStats, diffText } from "@/lib/bp/diff";

/** Kapitel vorher/nachher mit farbig markierten Änderungen: grün neu, rot durchgestrichen entfernt */
export function DiffView({ before, after, className = "" }: { before: string; after: string; className?: string }) {
  const blocks = useMemo(() => diffText(before, after), [before, after]);
  return (
    <div className={`space-y-2.5 text-sm leading-relaxed ${className}`}>
      {blocks.map((b, i) => {
        const heading = b[0]?.text.startsWith("### ");
        return (
          <p key={i} className={`whitespace-pre-wrap break-words ${heading ? "font-semibold" : ""}`}>
            {b.map((part, j) => {
              const text = j === 0 && heading ? part.text.replace(/^### /, "") : part.text;
              if (part.kind === "neu") return <ins key={j} className="rounded-sm bg-[#d9eedd] px-0.5 text-[#1d5a2c] no-underline">{text}</ins>;
              if (part.kind === "weg") return <del key={j} className="rounded-sm bg-[#f6dcd7] px-0.5 text-[#8a2a1d]">{text}</del>;
              return <span key={j}>{text}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function DiffLegend() {
  return (
    <p className="flex flex-wrap gap-3 text-xs text-muted">
      <span><ins className="rounded-sm bg-[#d9eedd] px-1 text-[#1d5a2c] no-underline">neu</ins> hinzugefügt</span>
      <span><del className="rounded-sm bg-[#f6dcd7] px-1 text-[#8a2a1d]">alt</del> entfernt</span>
    </p>
  );
}

export function useDiffStats(before: string, after: string) {
  return useMemo(() => diffStats(diffText(before, after)), [before, after]);
}
