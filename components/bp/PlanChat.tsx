"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { RunView } from "@/lib/bp/gesamt-ki";
import { SECTIONS, type GlanceItem, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { Bubble, ChatBox, Working } from "./ChatBox";
import { FiguresTable } from "./PlanEditor";
import { openFile } from "./openFile";

/*
 * Businessplan als Chat (nur Coach): links der Chat mit der KI, rechts der ganze Plan als ein Dokument.
 * Der Coach schreibt, was er will („Businessplan fertigstellen“), oder gibt Unterlagen mit. Die KI schreibt den Plan
 * in einem Zug ganz oder in Teilen neu, ohne Rückfragen; fehlende Angaben ergänzt sie als gekennzeichnete Annahme.
 * Jede Antwort lässt sich mit einem Klick rückgängig machen.
 */

type Props = {
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
  /** weitere Bereiche (Bank, Förderungen …) als kleine Links unter dem Kopf */
  more: { label: string; onClick: () => void }[];
  onEdit: () => void;
  onChange: (sections: Sections, glance: GlanceItem[]) => void;
};

const SUGGESTIONS = ["Businessplan fertigstellen", "Schreib den Plan komplett aus den hochgeladenen Unterlagen", "Gleiche alles mit dem Finanzplan ab", "Mach den Plan überzeugender für die fachkundige Stelle"];

const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." }));

const chapterTitle = (key: string) => {
  if (key === "blick") return "Auf einen Blick";
  const i = SECTIONS.findIndex((s) => s.key === key);
  return i < 0 ? key : `${i + 1}. ${SECTIONS[i].title}`;
};

export function PlanChat(p: Props) {
  const [runs, setRuns] = useState(p.runs);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "dokument">("chat");
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
      if (!res?.run || res.run.status === "laeuft") timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, last?.id, p.href]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, files: { id: string; name: string }[]) {
    setError(null);
    const res = (await post(p.href, { message: text, files: files.map((f) => f.id), fileNames: files.map((f) => f.name) })) as { run?: RunView; error?: string };
    if (res.error || !res.run) {
      setError(res.error ?? "Das hat gerade nicht geklappt.");
      return false;
    }
    upsert(res.run);
    return true;
  }

  async function undo(run: RunView) {
    setError(null);
    const res = (await post(p.href, { decide: run.id, decision: "verworfen" })) as { run?: RunView; sections?: Sections; glance?: GlanceItem[]; error?: string };
    if (res.run) upsert(res.run);
    if (res.sections && res.glance) p.onChange(res.sections, res.glance);
    if (res.error) setError(res.error);
  }

  async function clear() {
    await post(p.href, { clear: true });
    setRuns([]);
  }

  // Zuletzt geänderte Kapitel im Dokument markieren
  const lastDone = [...runs].reverse().find((r) => r.status === "fertig");
  const changed = new Set((lastDone?.changes ?? []).filter((x) => x.decision !== "verworfen").map((x) => x.key));
  const written = SECTIONS.filter((s) => p.sections[s.key]?.text.trim()).length;
  const items = p.glance.filter((g) => g.label.trim() && g.value.trim());

  const doc = (
    <article className="card min-w-0 space-y-6 sm:!px-8 sm:!py-7" aria-label="Businessplan">
      <header className="space-y-1 border-b border-line-soft pb-4">
        <p className="eyebrow">Businessplan · {written} von {SECTIONS.length} Kapiteln geschrieben</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-balance">{p.title || p.name}</h2>
        {p.title && <p className="text-sm text-muted">{p.name}</p>}
      </header>
      {!written && <p className="text-sm text-muted">Noch leer. Schreib im Chat „Businessplan fertigstellen“ oder gib einen vorhandenen Plan mit.</p>}
      {items.length > 0 && (
        <Mark on={changed.has("blick")}>
          <h3 className="h3">Auf einen Blick</h3>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
            {items.map((g, i) => <Fragment key={i}><dt className="font-semibold">{g.label}</dt><dd className="whitespace-pre-wrap text-muted">{g.value}</dd></Fragment>)}
          </dl>
        </Mark>
      )}
      {SECTIONS.map((s, i) => {
        const text = p.sections[s.key]?.text.trim();
        if (!text) return null;
        return (
          <Mark key={s.key} on={changed.has(s.key)}>
            <h3 className="h2 flex flex-wrap items-baseline gap-2">{i + 1}. {s.title}{changed.has(s.key) && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-night">gerade geändert</span>}</h3>
            <div className="bp-text text-[15px] leading-relaxed"><Markdown text={text} /></div>
            {(s.key === "finanzen" || s.key === "rentabilitaet") && p.figures && <FiguresTable rows={p.figures} />}
          </Mark>
        );
      })}
    </article>
  );

  return (
    <Workspace
      title="Businessplan"
      name={p.name}
      more={p.more}
      actions={
        <>
          <button type="button" className="btn btn-sm" disabled={!written || running} onClick={() => void openFile(`${p.pdfHref}?ansehen`, undefined, true)}>PDF ansehen</button>
          <button type="button" className="btn-ghost btn-sm" disabled={!written || running} onClick={() => void openFile(p.wordHref)}>Word</button>
          <button type="button" className="btn-ghost btn-sm" disabled={running} onClick={p.onEdit}>Selbst bearbeiten</button>
        </>
      }
      tab={tab}
      setTab={setTab}
      docLabel="Dokument"
      chat={
        <ChatBox
          className="lg:h-[calc(100dvh-8.5rem)]"
          items={runs.map((r) => ({ id: r.id, user: r.message.trim() || "Businessplan fertigstellen", answer: <Answer run={r} onUndo={() => undo(r)} onShow={() => setTab("dokument")} /> }))}
          uploadHref={`${p.href}/datei`}
          onSend={send}
          working={running}
          enabled={p.ai}
          emptyTitle="Was soll ich am Businessplan machen?"
          emptyText="Schreib einfach, was du willst, zum Beispiel „Businessplan fertigstellen“, oder gib einen vorhandenen Plan, Notizen oder Bilder mit. Ich schreibe den ganzen Plan direkt, ohne Rückfragen."
          suggestions={SUGGESTIONS}
          filesOnly="Schreib den kompletten Businessplan auf Grundlage dieser Unterlagen."
          onClear={() => void clear()}
          error={error}
          scrollKey={last ? `${last.id}${last.status}` : ""}
        />
      }
      doc={doc}
    />
  );
}

function Mark({ on, children }: { on: boolean; children: ReactNode }) {
  return <section className={`scroll-mt-24 space-y-2 ${on ? "-ml-3 border-l-4 border-gold pl-2" : ""}`}>{children}</section>;
}

/** Gemeinsamer Rahmen für Businessplan- und Finanzplan-Chat: Kopf, Chat links, Ergebnis rechts (Handy: Reiter) */
export function Workspace({ title, name, onBack, more, actions, tab, setTab, docLabel, chat, doc }: { title: string; name: string; onBack?: () => void; more?: { label: string; onClick: () => void }[]; actions: ReactNode; tab: "chat" | "dokument"; setTab: (t: "chat" | "dokument") => void; docLabel: string; chat: ReactNode; doc: ReactNode }) {
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {onBack && <button type="button" className="text-sm text-muted hover:text-accent" onClick={onBack}>← Zur Übersicht</button>}
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{title}</h2>
          <p className="text-sm text-muted">{name}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
        {more && more.length > 0 && (
          <nav className="flex w-full flex-wrap gap-x-4 gap-y-1 border-t border-line-soft pt-2.5 text-sm">
            {more.map((m) => <button key={m.label} type="button" className="link" onClick={m.onClick}>{m.label} →</button>)}
          </nav>
        )}
      </section>
      <div className="flex gap-1 rounded-full border border-line-soft bg-surface p-1 lg:hidden" role="tablist">
        {(["chat", "dokument"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-accent text-white" : "text-muted"}`} onClick={() => setTab(k)}>
            {k === "chat" ? "Chat" : docLabel}
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

function Answer({ run, onUndo, onShow }: { run: RunView; onUndo: () => Promise<void>; onShow: () => void }) {
  const [busy, setBusy] = useState(false);
  if (run.status === "laeuft") return <Working text="Ich schreibe den Businessplan …" />;
  if (run.status === "fehler") return <Bubble tone="error">{run.error ?? "Das hat nicht geklappt. Bitte noch einmal senden."}</Bubble>;
  const kept = run.changes.filter((x) => x.decision !== "verworfen");
  return (
    <Bubble>
      {run.result?.note ? <div className="bp-text"><Markdown text={run.result.note} /></div> : <p>{run.changes.length ? "Erledigt." : "Alles stimmig, nichts geändert."}</p>}
      {run.changes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2 text-xs text-muted">
          {run.undone ? (
            <span>Rückgängig gemacht.</span>
          ) : (
            <>
              <span>{kept.length === 1 ? `Geändert: ${chapterTitle(kept[0].key)}` : `${kept.length} Teile geschrieben`}</span>
              <button type="button" className="link lg:hidden" onClick={onShow}>Ansehen</button>
              <button type="button" className="link" disabled={busy} onClick={async () => { setBusy(true); await onUndo(); setBusy(false); }}>Rückgängig</button>
            </>
          )}
        </div>
      )}
    </Bubble>
  );
}
