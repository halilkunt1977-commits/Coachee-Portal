"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteChat, shareAnswer } from "@/app/actions/assistent";
import { Markdown, plainText } from "./Markdown";

type Chat = { id: string; title: string; updated_at: string; author_name: string | null; mine: boolean };
type Msg = { id: number | null; role: "user" | "assistant"; content: string };

type Props = {
  coacheeId: string;
  firstName: string;
  coach: boolean;
  chats: Chat[];
  activeId: string | null;
  messages: Msg[];
  starters: readonly { label: string; prompt: string }[];
  chatHref: string; // + id
  newHref: string;
  ai: boolean;
  usage: string;
  shareLabel: string;
};

export function Assistant(p: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(p.messages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: null, role: "user", content: t }, { id: null, role: "assistant", content: "" }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let chatId = p.activeId;
    try {
      const res = await fetch("/api/assistent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: p.activeId, coacheeId: p.coacheeId, text: t }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "Die KI ist gerade nicht erreichbar." }));
        setMessages((m) => m.slice(0, -2));
        setInput(t);
        setError(j.error);
        return;
      }
      chatId = res.headers.get("X-Chat-Id") ?? chatId;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const shown = acc.replaceAll("[Name]", p.firstName);
        setMessages((m) => [...m.slice(0, -1), { id: null, role: "assistant", content: shown }]);
      }
    } catch {
      // abgebrochen oder Verbindung weg: der Server speichert, was bis dahin kam
    } finally {
      abort.current = null;
      setBusy(false);
      if (chatId && chatId !== p.activeId) router.replace(p.chatHref + chatId, { scroll: false });
      router.refresh();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="card space-y-3 !p-4">
        <Link href={p.newHref} className="btn w-full">+ Neue Unterhaltung</Link>
        {p.chats.length === 0 ? (
          <p className="px-1 text-sm text-muted">Noch keine Unterhaltungen.</p>
        ) : (
          <ul className="-mx-1 max-h-[28rem] space-y-0.5 overflow-y-auto">
            {p.chats.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <Link href={p.chatHref + c.id} className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-sm ${c.id === p.activeId ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                  <span className="block truncate">{c.title}</span>
                  <span className="block text-xs font-normal text-muted">
                    {new Date(c.updated_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    {p.coach && !c.mine && c.author_name ? ` · von ${c.author_name}` : ""}
                  </span>
                </Link>
                <form action={deleteChat.bind(null, c.id)} onSubmit={() => c.id === p.activeId && router.replace(p.newHref)}>
                  <button aria-label="Unterhaltung löschen" title="Löschen" className="grid size-8 place-items-center rounded-lg text-muted opacity-0 hover:bg-bg hover:text-danger focus:opacity-100 group-hover:opacity-100">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line-soft px-1 pt-3 text-xs text-muted">{p.usage}</p>
      </aside>

      <section className="card flex min-h-[32rem] flex-col !p-0">
        <div ref={list} className="max-h-[65vh] flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {empty && (
            <div className="space-y-4">
              <div>
                <h2 className="h2">Woran arbeiten wir?</h2>
                <p className="text-sm text-muted">
                  {p.coach
                    ? `Der Assistent kennt Ziel, Kompetenzprofil, Lebenslauf und die letzten Gespräche von ${p.firstName}. Interne Gesundheitsangaben bekommt er nie.`
                    : "Der Assistent kennt dein Ziel, dein Profil, deinen Lebenslauf und die freigegebenen Gesprächsnotizen."}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {p.starters.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={!p.ai}
                    className="rounded-xl border border-line-soft px-4 py-3 text-left text-sm transition hover:border-accent hover:bg-tint/40 disabled:opacity-50"
                    onClick={() => {
                      if (s.prompt.endsWith("\n\n")) {
                        setInput(s.prompt);
                        requestAnimationFrame(() => {
                          field.current?.focus();
                          field.current?.setSelectionRange(s.prompt.length, s.prompt.length);
                        });
                      } else void send(s.prompt);
                    }}
                  >
                    <span className="block font-semibold">{s.label}</span>
                    <span className="line-clamp-2 block text-xs text-muted">{s.prompt.trim()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-2.5 text-[15px] text-white">{m.content}</p>
              </div>
            ) : (
              <Answer key={i} msg={m} streaming={busy && i === messages.length - 1} chatId={p.activeId} shareLabel={p.shareLabel} />
            ),
          )}
        </div>

        <form
          className="space-y-2 border-t border-line-soft p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          {!p.ai && <p className="rounded-lg bg-tint px-3 py-2 text-sm text-accent">Die KI ist noch nicht eingerichtet.</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={Math.min(8, Math.max(1, input.split("\n").length))}
              placeholder={p.coach ? `Frag etwas zu ${p.firstName} oder lass einen Text schreiben …` : "Frag etwas oder lass einen Text schreiben …"}
              aria-label="Nachricht an den Assistenten"
              disabled={!p.ai}
              className="input max-h-60 min-h-11 resize-none"
            />
            {busy ? (
              <button type="button" className="btn-ghost shrink-0" onClick={() => abort.current?.abort()}>Stopp</button>
            ) : (
              <button type="submit" className="btn shrink-0" disabled={!input.trim() || !p.ai}>Senden</button>
            )}
          </div>
          <p className="text-[11px] text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile. Die KI kann sich irren, bitte Fakten prüfen.</p>
        </form>
      </section>
    </div>
  );
}

function Answer({ msg, streaming, chatId, shareLabel }: { msg: Msg; streaming: boolean; chatId: string | null; shareLabel: string }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gold text-xs font-bold text-white" aria-hidden>✦</span>
      <div className="min-w-0 flex-1 space-y-2">
        {msg.content ? <Markdown text={msg.content} /> : <p className="animate-pulse text-sm text-muted">Denkt nach …</p>}
        {!streaming && msg.content && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
            <button
              type="button"
              className="hover:text-accent"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plainText(msg.content));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {}
              }}
            >
              {copied ? "Kopiert ✓" : "Kopieren"}
            </button>
            {msg.id !== null && chatId && (
              <button
                type="button"
                className="hover:text-accent"
                onClick={async () => {
                  const r = await shareAnswer(chatId, msg.id!);
                  setShared(r.ok ? "Gesendet ✓" : r.error ?? "Fehler");
                }}
                disabled={Boolean(shared)}
              >
                {shared ?? shareLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
