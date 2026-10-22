"use client";
import { useState } from "react";

/** Adresse zum Kopieren, z. B. für WhatsApp; der Coachee muss angemeldet sein, um das Video zu sehen */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={link} aria-label="Link zum Erklärvideo" className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn shrink-0" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true), () => {})}>{copied ? "Kopiert" : "Kopieren"}</button>
    </div>
  );
}
