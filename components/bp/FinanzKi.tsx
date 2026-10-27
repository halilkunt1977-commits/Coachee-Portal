"use client";
import { useState } from "react";
import { askFinanceAi } from "@/app/actions/businessplan";
import type { FinanceInput } from "@/lib/bp/finance";

/*
 * KI im Finanzplan (nur Coach): Angaben oder Änderungswünsche in eigenen Worten, die KI trägt sie direkt ein.
 * Jede Änderung lässt sich rückgängig machen; gespeichert wird wie bei jeder Eingabe im Editor.
 */

type Turn = { message: string; note: string; before: FinanceInput | null };

const EXAMPLES = ["Miete 450 € im Monat ab dem 2. Monat", "Stundensatz auf 60 € erhöhen", "Laptop 1.200 €, 3 Jahre Nutzungsdauer, im ersten Monat", "Ab Jahr 2 eine Teilzeitkraft mit 1.600 € brutto"];

export function FinanzKi({ coacheeId, finance, onApply, blocked }: { coacheeId: string; finance: FinanceInput; onApply: (f: FinanceInput) => void; blocked: boolean }) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function send() {
    const text = message.trim();
    if (!text || busy || blocked) return;
    setBusy(true);
    setError(null);
    const res = await askFinanceAi(coacheeId, finance, text, turns.map(({ message, note }) => ({ message, note }))).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const changed = JSON.stringify(res.finance) !== JSON.stringify(finance);
    setTurns((t) => [...t, { message: text, note: res.note || (changed ? "Eingetragen." : "Nichts geändert."), before: changed ? finance : null }]);
    if (changed) onApply(res.finance);
    setMessage("");
  }

  function undo(i: number) {
    const turn = turns[i];
    if (!turn.before) return;
    onApply(turn.before);
    setTurns((t) => t.map((x, j) => (j >= i ? { ...x, before: null, note: j === i ? `${x.note} (rückgängig gemacht)` : x.note } : x)));
  }

  const lastUndo = turns.findLastIndex((t) => t.before);

  return (
    <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fdfaf3] p-3 sm:p-4" aria-label="KI im Finanzplan">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold"><span className="text-gold">✦</span> Finanzplan mit KI ändern</span>
          <span className="block text-xs text-muted">Angaben in eigenen Worten schreiben, die KI trägt sie direkt in die Blätter ein. Nur für dich sichtbar, nie für den Coachee.</span>
        </span>
        <span className="shrink-0 text-sm text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          {turns.length > 0 && (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {turns.map((t, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-tint px-3.5 py-2 text-sm">{t.message}</p>
                  <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-sm">
                    <p><span className="text-gold">✦</span> {t.note}</p>
                    {i === lastUndo && <button type="button" className="link mt-1 text-xs" onClick={() => undo(i)}>Rückgängig</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {busy && <p className="text-sm text-muted" role="status"><span className="animate-pulse">✦ Trägt ein …</span></p>}
          {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => setMessage(e)}>{e}</button>
              ))}
            </div>
          )}
          <textarea
            aria-label="Angaben für den Finanzplan"
            className="input min-h-20 text-sm"
            rows={Math.min(8, Math.max(3, message.split("\n").length + 1))}
            value={message}
            maxLength={4000}
            placeholder="z. B. „Umsatz: Fensterreinigung 35 € je Stunde, Monat 1 bis 3 je 40 Stunden, danach 90“ oder „Kfz-Kosten auf 250 € senken“"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" disabled={busy || blocked || !message.trim()} onClick={() => void send()}>{busy ? "Trägt ein …" : "✦ Eintragen"}</button>
            <span className="text-xs text-muted">Strg + Enter zum Senden. Bitte die Zahlen danach in den Blättern prüfen.</span>
          </div>
        </>
      )}
    </div>
  );
}
