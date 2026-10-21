"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/bp/notes";
import { Markdown } from "../assistant/Markdown";

/*
 * Schreibhilfe pro Kapitel (nur Coach): Notizen, Stichpunkte oder Anweisungen wie im Chat, die KI schreibt daraus
 * das Kapitel als Vorschlag. Übernehmen ersetzt Text und Quellen des Kapitels über das normale Speichern.
 */

type Props = {
  title: string;
  summary: boolean;
  hasText: boolean;
  turns: ChatTurn[];
  writing: boolean;
  /** eine andere Anfrage läuft gerade (anderes Kapitel oder „alle leeren Kapitel“) */
  busy: boolean;
  blocked: boolean;
  error: string | null;
  writtenChapters: number;
  onSend: (message: string) => Promise<boolean>;
  onNote: (message: string) => Promise<boolean>;
  onApply: (turn: ChatTurn) => void;
  onDiscard: (turn: ChatTurn) => void;
  onClear: () => void;
};

const QUICK = ["kürzer", "ausführlicher", "sachlicher", "mehr konkrete Zahlen aus dem Material"];
const time = (at: string) => (at ? new Date(at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function Schreibhilfe(p: Props) {
  const [message, setMessage] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const open = [...p.turns].reverse().find((t) => t.role === "ki" && t.status === "offen") ?? null;
  const revise = p.hasText || Boolean(open);

  useEffect(() => {
    // Beim neuen Vorschlag dessen Anfang (mit der Nachricht davor) zeigen, sonst ans Ende
    const el = list.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>("[data-open]");
    const from = (target?.previousElementSibling as HTMLElement | null) ?? target;
    el.scrollTop = from && !p.writing ? from.offsetTop - 4 : el.scrollHeight;
  }, [p.turns.length, p.writing]);

  async function send(text = message) {
    if (p.busy || p.blocked) return;
    const ok = await p.onSend(text);
    if (ok && text === message) setMessage("");
  }

  async function note() {
    if (!message.trim() || p.busy) return;
    if (await p.onNote(message)) setMessage("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fdfaf3] p-3 sm:p-4" aria-label="Schreibhilfe">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold"><span className="text-gold">✦</span> Schreibhilfe mit KI</p>
          <p className="text-xs text-muted">Notizen, Ideen, Sätze oder Stichpunkte hineinschreiben, die KI schreibt daraus das Kapitel. Du prüfst und übernimmst. Nur für dich sichtbar, nie für den Coachee.</p>
        </div>
        {p.turns.length > 0 && (
          <button type="button" className="link shrink-0 text-xs" disabled={p.busy} onClick={() => confirm("Verlauf dieses Kapitels mit allen Notizen löschen? Der Kapiteltext bleibt.") && p.onClear()}>Verlauf leeren</button>
        )}
      </div>

      {p.summary && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
          <button type="button" className="btn btn-sm" disabled={p.busy || p.blocked} onClick={() => void send("Schreib die Executive Summary aus allen Kapiteln, dem Finanzplan und den Notizen.")}>
            {p.writing ? "Schreibt …" : "✦ Executive Summary aus allen Inhalten schreiben"}
          </button>
          <span className="text-xs text-muted">Nutzt {p.writtenChapters} geschriebene Kapitel, den Finanzplan und alle Notizen.</span>
        </div>
      )}

      {(p.turns.length > 0 || p.writing) && (
        <div ref={list} className="relative max-h-[34rem] space-y-2.5 overflow-y-auto pr-1">
          {p.turns.map((t) =>
            t.role === "coach" ? (
              <div key={t.id} className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-tint px-3.5 py-2 text-sm">
                <p className="whitespace-pre-wrap break-words">{t.text}</p>
                <p className="mt-0.5 text-right text-[11px] text-muted">{time(t.at)}</p>
              </div>
            ) : t === open ? (
              <div key={t.id} data-open className="space-y-3 rounded-xl border border-gold/50 bg-surface p-3 shadow-sm sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold">✦ Vorschlag für „{p.title}“, bitte prüfen</p>
                {t.note && <p className="rounded-lg bg-[#fbf6ec] px-3 py-2 text-sm">{t.note}</p>}
                <div className="bp-text text-[15px]"><Markdown text={t.text} /></div>
                {t.sources && <div className="text-xs text-muted"><b>Quellen:</b> {t.sources.split("\n").join(" · ")}</div>}
                <p className="text-xs text-muted">{words(t.text)} Wörter. Stellen in [eckigen Klammern] fehlen noch: bitte mit echten Angaben ersetzen und Quellen prüfen.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm" disabled={p.blocked} onClick={() => p.onApply(t)}>Übernehmen</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => p.onDiscard(t)}>Verwerfen</button>
                </div>
              </div>
            ) : (
              <details key={t.id} className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-bg px-3.5 py-2 text-sm">
                <summary className="cursor-pointer list-none">
                  <span className="text-gold">✦</span> {t.note || "Vorschlag"}{" "}
                  <span className="text-xs text-muted">· {words(t.text)} Wörter · {t.status === "uebernommen" ? "übernommen" : t.status === "verworfen" ? "verworfen" : t.status === "ersetzt" ? "überarbeitet" : "Vorschlag"} · {time(t.at)}</span>
                </summary>
                <div className="bp-text mt-2 border-t border-line-soft pt-2 text-[14px]"><Markdown text={t.text} /></div>
              </details>
            ),
          )}
          {p.writing && (
            <div className="w-fit rounded-2xl rounded-bl-md bg-bg px-3.5 py-2 text-sm text-muted" role="status">
              <span className="animate-pulse">✦ Schreibt das Kapitel …</span>
            </div>
          )}
        </div>
      )}

      {p.error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{p.error}</p>}

      {open && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Nachbessern:</span>
          {QUICK.map((q) => (
            <button key={q} type="button" disabled={p.busy} className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-50" onClick={() => void send(q)}>{q}</button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          aria-label={`Notizen zu ${p.title}`}
          className="input min-h-24 text-sm"
          rows={Math.min(10, Math.max(3, message.split("\n").length + 1))}
          value={message}
          maxLength={8000}
          placeholder={open ? "Was soll anders werden? z. B. „kürzer“, „mehr zum Standort“, „Preise aus dem Finanzplan nennen“ …" : "Notizen, Ideen, Stichpunkte … z. B.\n- Kunden: Hausverwaltungen und Privat im Landkreis\n- Start 1.3., zunächst allein, ab Jahr 2 ein Geselle"}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" disabled={p.busy || p.blocked || (Boolean(open) && !message.trim())} onClick={() => void send()}>
            {p.writing ? "Schreibt …" : open ? "Nachbessern" : revise ? "✦ Überarbeiten" : "✦ Kapitel schreiben"}
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={p.busy || !message.trim()} onClick={() => void note()} title="Für später merken, ohne dass die KI schreibt. Fließt in dieses Kapitel und die Executive Summary ein.">Nur als Notiz merken</button>
          <span className="text-xs text-muted">Strg + Enter zum Senden. Bitte keine Gesundheitsangaben.</span>
        </div>
      </div>
    </div>
  );
}
