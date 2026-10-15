"use client";
import { useState, useTransition } from "react";
import { inviteLink } from "../../actions";

export default function InviteLink({ coacheeId }: { coacheeId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  if (!link) {
    return (
      <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(async () => setLink(await inviteLink(coacheeId)))}>
        {pending ? "Einen Moment …" : "Link zum Weitergeben erzeugen"}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Diesen Link kannst du per WhatsApp oder SMS schicken. Er ist 7 Tage gültig und funktioniert nur einmal.</p>
      <div className="flex gap-2">
        <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>{copied ? "Kopiert" : "Kopieren"}</button>
      </div>
    </div>
  );
}
