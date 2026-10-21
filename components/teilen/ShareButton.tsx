"use client";
import { useState, useTransition } from "react";
import { shareItem, type ShareResult } from "@/app/actions/teilen";
import type { Job } from "@/lib/jobs/shared";
import { JOB_QUESTION, SHARE_META, type ShareKind } from "@/lib/teilen-shared";
import { Icon } from "../shell/icons";
import { Sheet } from "./Sheet";

type Props = {
  /** "suche": Treffer aus der Stellensuche (wird beim Senden in die Bewerbungen übernommen) */
  kind: ShareKind | "suche";
  refId?: string;
  job?: Job;
  role: "coach" | "coachee";
  /** Fester Empfänger (Coach in der Akte) bzw. die eigene Akte (Coachee) */
  coacheeId?: string;
  /** Coach außerhalb einer Akte: Auswahl, an wen es geht */
  coachees?: { id: string; name: string }[];
  /** Vorname des Coachees für die Beschriftung */
  recipient?: string;
  /** Was geschickt wird, steht im Fenster */
  title: string;
  label?: string;
  /** Vorbelegte Notiz, z. B. die Einschätzung, warum eine Stelle passt */
  defaultNote?: string;
  className?: string;
  onSent?: (r: ShareResult) => void;
};

/** „An Coach senden“ / „An Coachee senden“: kleine Notiz dazu, dann landet es im Posteingang der anderen Seite. */
export function ShareButton(p: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [to, setTo] = useState(p.coacheeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const meta = SHARE_META[p.kind === "suche" ? "stelle" : p.kind];
  const coach = p.role === "coach";
  const picker = coach && !p.coacheeId;
  const toName = coach ? (picker ? p.coachees?.find((c) => c.id === to)?.name.split(" ")[0] : p.recipient) : null;
  const label = p.label ?? (coach ? (picker ? "An Coachee senden" : `An ${p.recipient ?? "Coachee"} senden`) : "An Coach senden");

  const show = () => {
    setError(null);
    setNote(p.defaultNote ?? (!coach && (p.kind === "suche" || p.kind === "stelle") ? JOB_QUESTION : ""));
    setOpen(true);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await shareItem({ kind: p.kind, refId: p.refId, job: p.job, coacheeId: coach ? to || undefined : p.coacheeId, note }).catch(() => ({ error: "Das hat gerade nicht geklappt. Bitte noch einmal versuchen." }) as ShareResult);
      if (res.error) return setError(res.error);
      setSent(res.ok ?? "Gesendet.");
      setOpen(false);
      p.onSent?.(res);
      window.setTimeout(() => setSent(null), 4000);
    });

  return (
    <>
      <button type="button" className={p.className ?? "btn-ghost btn-sm"} onClick={show} aria-haspopup="dialog">
        {sent ? <>✓ Gesendet</> : <><Icon name="send" className="size-3.5" /> {label}</>}
      </button>
      {sent && <span role="status" className="sr-only">{sent}</span>}
      <Sheet open={open} onClose={() => setOpen(false)} title={coach ? (toName ? `An ${toName} senden` : "An Coachee senden") : "An deinen Coach senden"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-3 rounded-xl bg-bg p-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}><Icon name={meta.icon} className="size-4" /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{meta.label}</span>
              <span className="block break-words font-semibold [overflow-wrap:anywhere]">{p.title}</span>
            </span>
          </div>
          {picker && (
            <label className="block">
              <span className="label">An wen?</span>
              <select className="input" required value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Coachee auswählen …</option>
                {p.coachees?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="label">Notiz <span className="font-normal text-muted">(optional)</span></span>
            <textarea className="input" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder={coach ? "Kurz dazu, z. B. „Schau dir das bis Freitag an.“" : "Kurz dazu, z. B. eine Frage an deinen Coach"} />
          </label>
          <p className="text-xs text-muted">
            {coach
              ? `${toName ?? "Der Coachee"} findet es im Posteingang und bekommt eine Meldung. Es steht auch in euren Nachrichten.${p.kind === "dokument" ? " Das Dokument wird damit freigegeben." : ""}`
              : "Dein Coach bekommt Bescheid und findet es in seinem Posteingang. Es steht auch in euren Nachrichten."}
          </p>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
            <button className="btn" disabled={pending || (picker && !to)}>{pending ? "Wird gesendet …" : "Senden"}</button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
