"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/bp/gesamt-ki";
import { SECTIONS, type GlanceItem, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { Recorder } from "../akte/Recorder";
import { FiguresTable } from "./PlanEditor";
import { openFile } from "./openFile";

/*
 * Businessplan als Chat (nur Coach): links der Chat mit der KI, rechts der ganze Plan als ein Dokument.
 * Der Coach schreibt, was er will, oder lädt Unterlagen hoch (vorhandener Businessplan, Notizen, Fotos).
 * Die KI stellt keine Rückfragen, sondern schreibt den Plan direkt (ganz oder in Teilen) neu; fehlende Angaben
 * ergänzt sie als gekennzeichnete Annahme. Jede Antwort lässt sich mit einem Klick rückgängig machen.
 */

type Props = {
  coacheeId: string;
  name: string;
  title: string;
  sections: Sections;
  glance: GlanceItem[];
  figures: string[][] | null;
  runs: RunView[];
  href: string;
  pdfHref: string;
  wordHref: string;
  ai: boolean;
  onBack: () => void;
  onEdit: () => void;
  onChange: (sections: Sections, glance: GlanceItem[]) => void;
};

type Attached = { id: string; name: string; image: boolean };

const SUGGESTIONS = [
  "Schreib den kompletten Businessplan aus den hochgeladenen Unterlagen",
  "Mach den ganzen Plan fertig und abgabereif für die fachkundige Stelle",
  "Gleiche alles mit dem Finanzplan ab",
  "Schreib den Plan überzeugender und konkreter",
];
const FILES = ".pdf,.docx,.xlsx,.txt,image/jpeg,image/png,image/webp";

const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." }));

export function PlanChat(p: Props) {
  const [runs, setRuns] = useState(p.runs);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState<"chat" | "dokument">("chat");
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const last = runs[runs.length - 1] ?? null;
  const running = last?.status === "laeuft";
  const cb = useRef(p.onChange);
  useEffect(() => {
    cb.current = p.onChange;
  });

  const upsert = (run: RunView) => setRuns((all) => (all.some((r) => r.id === run.id) ? all.map((r) => (r.id === run.id ? run : r)) : [...all, run]));

  // Laufende Antwort abfragen, bis sie fertig ist; danach den neuen Plan übernehmen
  useEffect(() => {
    if (!running || !last) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const res = (await fetch(`${p.href}?run=${last.id}`).then((r) => r.json()).catch(() => null)) as { run?: RunView; sections?: Sections; glance?: GlanceItem[] } | null;
      if (stop) return;
      if (res?.run) upsert(res.run);
      if (res?.run && res.run.status !== "laeuft" && res.sections && res.glance) cb.current(res.sections, res.glance);
      if (!res?.run || res.run.status === "laeuft") timer = setTimeout(tick, 2500);
    };
    timer = setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, last?.id, p.href]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastKey = last ? `${last.id}${last.status}${last.progress.chapters.filter((x) => x.status === "fertig").length}` : "";
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runs.length, lastKey]);

  // Eingabefeld wächst mit dem Text
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [message]);

  async function upload(chosen: FileList | File[] | null) {
    if (!chosen || !chosen.length) return;
    setError(null);
    for (const f of [...chosen].slice(0, 10)) {
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.append("file", f);
      const res = (await fetch(`${p.href}/datei`, { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung. Bitte noch einmal versuchen." }))) as { id?: string; name?: string; image?: boolean; error?: string };
      setUploading((n) => n - 1);
      if (res.id) setFiles((x) => [...x, { id: res.id!, name: res.name ?? f.name, image: Boolean(res.image) }]);
      else setError(`${f.name}: ${res.error ?? "ließ sich nicht hochladen."}`);
    }
  }

  async function send(text = message) {
    if (busy || running || uploading) return;
    let msg = text.trim();
    if (!msg && files.length) msg = "Schreib den kompletten Businessplan auf Grundlage der hochgeladenen Unterlagen.";
    if (!msg) return field.current?.focus();
    setBusy(true);
    setError(null);
    const res = (await post(p.href, { message: msg, files: files.map((f) => f.id), fileNames: files.map((f) => f.name) })) as { run?: RunView; error?: string };
    setBusy(false);
    if (res.error || !res.run) return setError(res.error ?? "Das hat gerade nicht geklappt.");
    upsert(res.run);
    setMessage("");
    setFiles([]);
  }

  async function undo(run: RunView) {
    setError(null);
    const res = (await post(p.href, { decide: run.id, decision: "verworfen" })) as { run?: RunView; sections?: Sections; glance?: GlanceItem[]; error?: string };
    if (res.run) upsert(res.run);
    if (res.sections && res.glance) p.onChange(res.sections, res.glance);
    if (res.error) setError(res.error);
  }

  async function clear() {
    if (running) return;
    await post(p.href, { clear: true });
    setRuns([]);
  }

  // Zuletzt geänderte Kapitel im Dokument markieren
  const lastDone = [...runs].reverse().find((r) => r.status === "fertig");
  const changed = new Set((lastDone?.changes ?? []).filter((x) => x.decision !== "verworfen").map((x) => x.key));
  const written = SECTIONS.filter((s) => p.sections[s.key]?.text.trim()).length;

  const chat = (
    <section
      className={`card flex min-h-0 min-w-0 flex-col !p-0 lg:h-[calc(100dvh-8.5rem)] ${drag ? "ring-2 ring-gold" : ""}`}
      aria-label="Chat zum Businessplan"
      onDragOver={(e) => {
        if (!p.ai || running) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (p.ai && !running) void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <p className="text-sm font-semibold"><span className="text-gold">✦</span> Chat</p>
        {runs.length > 0 && <button type="button" className="link text-xs" disabled={running} onClick={() => void clear()}>Neuer Chat</button>}
      </div>

      <div ref={list} className="min-h-[18rem] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!runs.length && (
          <div className="space-y-4 py-4 text-center">
            <p className="font-[family-name:var(--font-display)] text-lg font-bold">Was soll ich am Businessplan machen?</p>
            <p className="mx-auto max-w-sm text-sm text-muted">Schreib einfach, was du willst, oder lade einen vorhandenen Businessplan, Notizen oder Fotos hoch. Ich schreibe den Plan direkt, ohne Rückfragen. Fehlende Angaben ergänze ich als Annahme.</p>
            {p.ai && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="rounded-full border border-line-soft bg-surface px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => { setMessage(s); field.current?.focus(); }}>{s}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {runs.map((r) => (
          <div key={r.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white">{r.message.trim() || "Plan fertig machen"}</p>
            <Answer run={r} onUndo={() => void undo(r)} onShow={() => setTab("dokument")} />
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
        {p.ai ? (
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
            <label className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-lg text-muted hover:bg-line-soft hover:text-accent ${running ? "pointer-events-none opacity-50" : ""}`} title="Datei oder Foto hochladen" aria-label="Datei oder Foto hochladen">
              📎
              <input type="file" multiple accept={FILES} className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
            </label>
            <textarea
              ref={field}
              aria-label="Nachricht"
              className="max-h-60 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
              rows={1}
              value={message}
              maxLength={8000}
              disabled={running}
              placeholder={running ? "Ich schreibe gerade am Plan …" : "Schreib, was du willst …"}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Recorder compact coacheeId={p.coacheeId} onText={(t) => setMessage((m) => (m.trim() ? `${m.trimEnd()} ${t}` : t))} />
            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Senden" disabled={busy || running || uploading > 0 || (!message.trim() && !files.length)} onClick={() => void send()}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Der Chat ist gerade nicht eingerichtet. Den Text kannst du über „Selbst bearbeiten“ ändern.</p>
        )}
        <p className="px-1 text-[11px] text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile. Dateien kannst du auch hierher ziehen. Nur für dich sichtbar.</p>
      </div>
    </section>
  );

  const items = p.glance.filter((g) => g.label.trim() && g.value.trim());
  const doc = (
    <article className="card min-w-0 space-y-6 sm:!px-8 sm:!py-7" aria-label="Businessplan">
      <header className="space-y-1 border-b border-line-soft pb-4">
        <p className="eyebrow">Businessplan · {written} von {SECTIONS.length} Kapiteln geschrieben</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-balance">{p.title || p.name}</h2>
        {p.title && <p className="text-sm text-muted">{p.name}</p>}
      </header>
      {!written && <p className="text-sm text-muted">Noch leer. Schreib im Chat, was du willst, oder lade einen vorhandenen Plan hoch.</p>}
      {items.length > 0 && (
        <section className={`space-y-2 ${changed.has("blick") ? "-ml-3 border-l-4 border-gold pl-2" : ""}`}>
          <h3 className="h3">Auf einen Blick</h3>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
            {items.map((g, i) => <Fragment key={i}><dt className="font-semibold">{g.label}</dt><dd className="whitespace-pre-wrap text-muted">{g.value}</dd></Fragment>)}
          </dl>
        </section>
      )}
      {SECTIONS.map((s, i) => {
        const text = p.sections[s.key]?.text.trim();
        if (!text) return null;
        return (
          <section key={s.key} id={`doc-${s.key}`} className={`scroll-mt-24 space-y-2 ${changed.has(s.key) ? "-ml-3 border-l-4 border-gold pl-2" : ""}`}>
            <h3 className="h2 flex flex-wrap items-baseline gap-2">{i + 1}. {s.title}{changed.has(s.key) && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-night">gerade geändert</span>}</h3>
            <div className="bp-text text-[15px] leading-relaxed"><Markdown text={text} /></div>
            {(s.key === "finanzen" || s.key === "rentabilitaet") && p.figures && <FiguresTable rows={p.figures} />}
          </section>
        );
      })}
    </article>
  );

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button type="button" className="text-sm text-muted hover:text-accent" onClick={p.onBack}>← Zur Übersicht</button>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">Businessplan</h2>
          <p className="text-sm text-muted">{p.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={!written || running} onClick={() => void openFile(`${p.pdfHref}?ansehen`, undefined, true)}>PDF ansehen</button>
          <button type="button" className="btn-ghost btn-sm" disabled={!written || running} onClick={() => void openFile(p.wordHref)}>Word</button>
          <button type="button" className="btn-ghost btn-sm" disabled={running} onClick={p.onEdit}>Selbst bearbeiten</button>
        </div>
      </section>

      <div className="flex gap-1 rounded-full border border-line-soft bg-surface p-1 lg:hidden" role="tablist">
        {(["chat", "dokument"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-accent text-white" : "text-muted"}`} onClick={() => setTab(k)}>
            {k === "chat" ? "Chat" : "Dokument"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className={`min-w-0 lg:sticky lg:top-[7.5rem] ${tab === "chat" ? "" : "hidden lg:block"}`}>{chat}</div>
        <div className={`min-w-0 ${tab === "dokument" ? "" : "hidden lg:block"}`}>{doc}</div>
      </div>
    </div>
  );
}

const chapterTitle = (key: string) => {
  if (key === "blick") return "Auf einen Blick";
  const i = SECTIONS.findIndex((s) => s.key === key);
  return i < 0 ? key : `${i + 1}. ${SECTIONS[i].title}`;
};

function Answer({ run, onUndo, onShow }: { run: RunView; onUndo: () => void; onShow: () => void }) {
  const [busy, setBusy] = useState(false);
  const bubble = "max-w-[94%] space-y-2 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm";
  const work = run.progress.chapters.filter((x) => x.action !== "lassen");
  const done = work.filter((x) => x.status === "fertig" || x.status === "fehler").length;

  if (run.status === "laeuft")
    return (
      <div className={bubble} role="status">
        <p className="font-semibold">
          <span className="animate-pulse text-gold">✦</span>{" "}
          {run.progress.phase === "pruefen" ? "Lese alles und plane …" : run.progress.phase === "blick" ? "Passe „Auf einen Blick“ an …" : `Schreibe den Plan: ${done} von ${work.length} Kapiteln fertig`}
        </p>
        {work.length > 0 && <div className="h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-gold transition-all" style={{ width: `${(done / work.length) * 100}%` }} /></div>}
        <p className="text-xs text-muted">Du kannst die Seite schließen, ich schreibe weiter.</p>
      </div>
    );

  if (run.status === "fehler") return <div className={`${bubble} !bg-[#f8e6e3] text-danger`}>{run.error ?? "Das hat nicht geklappt. Bitte noch einmal senden."}</div>;

  const kept = run.changes.filter((x) => x.decision !== "verworfen");
  const failed = work.filter((x) => x.status === "fehler");
  return (
    <div className={bubble}>
      {run.result?.note ? <div className="bp-text"><Markdown text={run.result.note} /></div> : <p>{run.changes.length ? "Erledigt." : "Alles stimmig, nichts geändert."}</p>}
      {run.changes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2 text-xs text-muted">
          {run.undone ? (
            <span>Rückgängig gemacht.</span>
          ) : (
            <>
              <span>{kept.length === 1 ? `Geändert: ${chapterTitle(kept[0].key)}` : `${kept.length} Teile geändert`}</span>
              <button type="button" className="link lg:hidden" onClick={onShow}>Ansehen</button>
              <button type="button" className="link" disabled={busy} onClick={async () => { setBusy(true); await onUndo(); setBusy(false); }}>Rückgängig</button>
            </>
          )}
        </div>
      )}
      {failed.length > 0 && <p className="text-xs text-danger">Nicht geschafft: {failed.map((x) => chapterTitle(x.key)).join(", ")}. Schreib einfach „noch einmal“.</p>}
    </div>
  );
}
