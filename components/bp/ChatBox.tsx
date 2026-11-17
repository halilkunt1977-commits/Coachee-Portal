"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Chatfenster wie bei ChatGPT (Businessplan und Finanzplan, nur Coach): Verlauf oben, Eingabe unten.
 * Dateien und Fotos per Büroklammer, per Hineinziehen oder per Einfügen (Strg+V, z. B. ein Bildschirmfoto).
 * Hochgeladenes wird gelesen (PDF, Word, Excel, Text, Fotos) und geht mit der nächsten Nachricht an die KI.
 */

export type ChatFile = { id: string; name: string; image: boolean };
export type ChatItem = { id: string; user: string; answer: ReactNode };

const FILES = ".pdf,.docx,.xlsx,.txt,image/jpeg,image/png,image/webp";

type Props = {
  items: ChatItem[];
  /** Adresse zum Hochladen (gibt { id, name, image } zurück) */
  uploadHref: string;
  /** Senden; true = angenommen (Eingabe wird geleert) */
  onSend: (text: string, files: ChatFile[]) => Promise<boolean>;
  /** Die KI arbeitet gerade (Eingabe gesperrt) */
  working: boolean;
  enabled: boolean;
  emptyTitle: string;
  emptyText: string;
  suggestions: string[];
  /** Text, wenn nur Dateien ohne Nachricht geschickt werden */
  filesOnly: string;
  onClear?: () => void;
  error: string | null;
  /** Ändert sich, wenn sich der Inhalt einer Antwort ändert (für das Scrollen ans Ende) */
  scrollKey: string;
  className?: string;
};

export function ChatBox(p: Props) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const locked = p.working || !p.enabled;

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.items.length, p.scrollKey]);

  // Eingabefeld wächst mit dem Text
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [message]);

  async function upload(chosen: File[]) {
    if (!chosen.length) return;
    setUploadError(null);
    for (const f of chosen.slice(0, 10)) {
      setUploading((n) => n + 1);
      const fd = new FormData();
      // eingefügte Bildschirmfotos heißen oft nur „image.png“
      fd.append("file", f, f.name && f.name !== "image.png" ? f.name : `Bild-${new Date().toLocaleTimeString("de-DE").replaceAll(":", "-")}.${f.type === "image/jpeg" ? "jpg" : "png"}`);
      const res = (await fetch(p.uploadHref, { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung. Bitte noch einmal versuchen." }))) as { id?: string; name?: string; image?: boolean; error?: string };
      setUploading((n) => n - 1);
      if (res.id) setFiles((x) => [...x, { id: res.id!, name: res.name ?? f.name, image: Boolean(res.image) }]);
      else setUploadError(`${f.name || "Bild"}: ${res.error ?? "ließ sich nicht hochladen."}`);
    }
  }

  async function send(text = message) {
    if (sending || locked || uploading) return;
    const msg = text.trim() || (files.length ? p.filesOnly : "");
    if (!msg) return field.current?.focus();
    setSending(true);
    const ok = await p.onSend(msg, files);
    setSending(false);
    if (ok) {
      setMessage("");
      setFiles([]);
    }
  }

  const error = uploadError ?? p.error;
  return (
    <section
      className={`card flex min-h-0 min-w-0 flex-col !p-0 ${drag ? "ring-2 ring-gold" : ""} ${p.className ?? ""}`}
      aria-label="Chat"
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!locked) void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <p className="text-sm font-semibold"><span className="text-gold">✦</span> Chat</p>
        {p.onClear && p.items.length > 0 && <button type="button" className="link text-xs" disabled={p.working} onClick={p.onClear}>Neuer Chat</button>}
      </div>

      <div ref={list} className="min-h-[18rem] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!p.items.length && (
          <div className="space-y-4 py-4 text-center">
            <p className="font-[family-name:var(--font-display)] text-lg font-bold">{p.emptyTitle}</p>
            <p className="mx-auto max-w-sm text-sm text-muted">{p.emptyText}</p>
            {p.enabled && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {p.suggestions.map((s) => (
                  <button key={s} type="button" className="rounded-full border border-line-soft bg-surface px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => void send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {p.items.map((it) => (
          <div key={it.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white">{it.user}</p>
            {it.answer}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-line-soft p-3">
        {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {(files.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line-soft bg-surface-2 px-2.5 py-1 text-xs">
                <span className="truncate">{f.image ? "🖼" : "📄"} {f.name}</span>
                <button type="button" className="text-muted hover:text-danger" aria-label={`${f.name} entfernen`} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>×</button>
              </span>
            ))}
            {uploading > 0 && <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs">Wird gelesen …</span>}
          </div>
        )}
        {p.enabled ? (
          <div className="flex items-end gap-1.5 rounded-2xl border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
            <label className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-line-soft hover:text-accent ${locked ? "pointer-events-none opacity-50" : ""}`} title="Datei oder Bild hochladen" aria-label="Datei oder Bild hochladen">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></svg>
              <input type="file" multiple accept={FILES} className="sr-only" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </label>
            <textarea
              ref={field}
              aria-label="Nachricht"
              className="max-h-60 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
              rows={1}
              value={message}
              maxLength={8000}
              disabled={p.working}
              placeholder={p.working ? "Ich arbeite gerade …" : "Schreib, was du willst …"}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={(e) => {
                const pasted = [...e.clipboardData.files];
                if (!pasted.length) return;
                e.preventDefault();
                void upload(pasted);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Senden" disabled={sending || locked || uploading > 0 || (!message.trim() && !files.length)} onClick={() => void send()}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Der Chat ist gerade nicht eingerichtet. Ändern geht über „Selbst bearbeiten“.</p>
        )}
        <p className="px-1 text-[11px] text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile. Bilder mit Strg+V einfügen oder Dateien hierher ziehen.</p>
      </div>
    </section>
  );
}

export function Bubble({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return <div className={`max-w-[94%] space-y-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm ${tone === "error" ? "bg-[#f8e6e3] text-danger" : "bg-surface-2"}`}>{children}</div>;
}

export function Working({ text }: { text: string }) {
  return (
    <Bubble>
      <p className="font-semibold" role="status"><span className="animate-pulse text-gold">✦</span> {text}</p>
      <p className="text-xs text-muted">Das dauert bei einem ganzen Plan ein paar Minuten.</p>
    </Bubble>
  );
}
