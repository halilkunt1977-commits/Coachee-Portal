"use client";
import { useEffect, useRef, useState } from "react";
import { changeCvWithAi } from "@/app/actions/lebenslauf";
import type { CvData } from "@/lib/cv/types";

/*
 * Lebenslauf mit KI ändern (nur Coach): eine Anweisung wie im Chat („auf zwei Seiten kürzen“), die KI ändert den
 * ganzen Lebenslauf sofort, ohne Rückfragen. Jede Antwort lässt sich rückgängig machen; gespeichert wird wie bei
 * jeder Eingabe im Editor. Coachees sehen diesen Kasten nie.
 */

type Turn = { message: string; note: string; before: CvData | null; undone?: boolean };

const QUICK = ["Auf 2 Seiten kürzen", "Auf 1 Seite kürzen", "Aufgaben je Station auf 3 bis 4 Stichpunkte", "Kurzprofil kürzer und knackiger"];

export function CvKi({ cvId, data, pages, onApply, beforeSend }: { cvId: string; data: CvData; pages: number; onApply: (d: CvData) => void; beforeSend: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [message]);

  async function send(preset?: string) {
    const text = (preset ?? message).trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    await beforeSend();
    const res = await changeCvWithAi(cvId, data, text, pages, turns.map(({ message, note }) => ({ message, note }))).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setTurns((t) => [...t, { message: text, note: res.note, before: data }]);
    onApply(res.data);
    setMessage("");
  }

  function undo(i: number) {
    const turn = turns[i];
    if (!turn.before) return;
    onApply(turn.before);
    setTurns((t) => t.map((x, j) => (j >= i ? { ...x, before: null, undone: j === i } : x)));
  }

  const lastUndo = turns.findLastIndex((t) => t.before);

  return (
    <section className="card space-y-3 border-gold/40" aria-label="Lebenslauf mit KI ändern">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold"><span className="text-gold">✦</span> Lebenslauf mit KI ändern</p>
        <p className="text-xs text-muted">Gerade {pages} {pages === 1 ? "Seite" : "Seiten"} · nur für dich sichtbar</p>
      </div>
      {turns.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white">{t.message}</p>
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2 text-sm">
                <p>{t.note}</p>
                {t.undone ? <p className="mt-1 text-xs text-muted">Rückgängig gemacht.</p> : i === lastUndo && <button type="button" className="link mt-1 text-xs" onClick={() => undo(i)}>Rückgängig</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {busy && <p className="text-sm text-muted" role="status"><span className="animate-pulse text-gold">✦</span> Ich ändere den Lebenslauf …</p>}
      {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {!turns.length && !busy && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" className="rounded-full border border-line-soft bg-surface px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => void send(q)}>{q}</button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-2xl border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
        <textarea
          ref={field}
          aria-label="Was soll am Lebenslauf geändert werden?"
          className="max-h-52 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
          rows={1}
          value={message}
          maxLength={4000}
          disabled={busy}
          placeholder="Schreib, was geändert werden soll, z. B. „auf zwei Seiten kürzen“ …"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Senden" disabled={busy || !message.trim()} onClick={() => void send()}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>
    </section>
  );
}
