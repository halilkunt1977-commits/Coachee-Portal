"use client";
import { useEffect, useRef, useState } from "react";
import type { ChapterReview, RunChange, RunView } from "@/lib/bp/gesamt-ki";
import type { ChatTurn } from "@/lib/bp/notes";
import { SECTIONS, type GlanceItem, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { Recorder } from "../akte/Recorder";
import { DiffLegend, DiffView, useDiffStats } from "./DiffView";

/*
 * Ein Chat mit der KI für den ganzen Businessplan (nur Coach): Fragen stellen, neue Angaben, Zahlen und Fakten
 * schreiben oder einsprechen, Dateien mitgeben. Die KI antwortet oder ändert den Plan direkt. Jede Änderung ist
 * farbig markiert und lässt sich je Kapitel übernehmen oder verwerfen. Dazu bewertet sie jedes Kapitel und fragt
 * nach, was fehlt. Ein Durchgang läuft auf dem Server weiter, auch wenn die Seite zu ist.
 */

export type Decide = (runId: string, key: string | null, decision: "uebernommen" | "verworfen") => Promise<string | null>;

type Props = {
  href: string;
  coacheeId: string;
  runs: RunView[];
  /** alter Verlauf aus „Fragen & Bewertung“ */
  chat: ChatTurn[];
  onRun: (run: RunView) => void;
  onCleared: () => void;
  decide: Decide;
  /** vor dem Senden: offene Änderungen im Editor speichern */
  beforeStart: () => Promise<void>;
  onRunning: (running: boolean) => void;
  onUpdate: (sections: Sections, glance: GlanceItem[]) => void;
  onOpen: (key: string) => void;
};

const EXAMPLES = [
  "Bewerte den Plan Kapitel für Kapitel. Was fehlt noch?",
  "Gleiche alles mit dem aktuellen Finanzplan ab",
  "Start ist jetzt der 01.04.2027",
  "Stundensatz ist 65 € statt 55 €",
  "Würde die fachkundige Stelle den Plan so akzeptieren?",
];
export const chapterTitle = (key: string) => {
  if (key === "blick") return "Auf einen Blick";
  const i = SECTIONS.findIndex((s) => s.key === key);
  return i < 0 ? key : `${i + 1}. ${SECTIONS[i].title}`;
};
const RATING = { gut: { label: "gut", dot: "bg-ok" }, ausbaufaehig: { label: "ausbaufähig", dot: "bg-gold" }, fehlt: { label: "fehlt viel", dot: "bg-danger" } } as const;
const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." }));

export function GesamtKi(p: Props) {
  const [legacy, setLegacy] = useState<ChatTurn[]>(p.chat);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string; image: boolean }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const last = p.runs[p.runs.length - 1] ?? null;
  const running = last?.status === "laeuft";
  const cb = useRef(p);
  useEffect(() => {
    cb.current = p;
  });

  // Laufenden Durchgang abfragen, bis er fertig ist
  useEffect(() => {
    cb.current.onRunning(running);
    if (!running || !last) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = (await fetch(`${p.href}?run=${last.id}`).then((r) => r.json()).catch(() => null)) as { run?: RunView; sections?: Sections; glance?: GlanceItem[] } | null;
      if (stop) return;
      if (res?.run) cb.current.onRun(res.run);
      if (res?.run && res.run.status !== "laeuft" && res.sections && res.glance) cb.current.onUpdate(res.sections, res.glance);
      if (!res?.run || res.run.status === "laeuft") timer = setTimeout(tick, 2500);
    };
    let timer = setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, last?.id, p.href]); // eslint-disable-line react-hooks/exhaustive-deps

  // neue Nachricht oder Antwort: ans Ende des Chats
  const lastStatus = last ? `${last.id}${last.status}` : "";
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.runs.length, lastStatus]);

  async function upload(chosen: FileList | null) {
    if (!chosen?.length) return;
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
    setBusy(true);
    setError(null);
    await p.beforeStart();
    const res = (await post(p.href, { message: text, files: files.map((f) => f.id), fileNames: files.map((f) => f.name) })) as { run?: RunView; error?: string };
    setBusy(false);
    if (res.error || !res.run) return setError(res.error ?? "Das hat gerade nicht geklappt.");
    p.onRun(res.run);
    setMessage("");
    setFiles([]);
  }

  async function clear() {
    if (running) return;
    await post(p.href, { clear: true });
    setLegacy([]);
    p.onCleared();
  }

  /** Rückfrage beantworten: Frage ins Eingabefeld, Antwort dahinter schreiben oder einsprechen */
  function answer(key: string, q: string) {
    setMessage(`${chapterTitle(key)}, deine Frage: ${q}\nAntwort: `);
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const empty = !legacy.length && !p.runs.length;
  const reviewRun = [...p.runs].reverse().find((r) => r.status === "fertig" && r.result?.review?.length);

  return (
    <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fdfaf3] p-3 sm:p-4" aria-label="KI für den Businessplan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold"><span className="text-gold">✦</span> KI für den Businessplan</p>
          <p className="text-xs text-muted">Frag nach einer Bewertung, gib neue Angaben, Zahlen oder Fakten ein (auch per Sprache oder Datei), oder lass den ganzen Plan prüfen. Was die KI ändert, siehst du farbig markiert und kannst es je Kapitel übernehmen oder verwerfen. Nur für dich sichtbar.</p>
        </div>
        {!empty && <button type="button" className="link shrink-0 text-xs" disabled={running} onClick={() => void clear()}>Chat leeren</button>}
      </div>

      {!empty && (
        <div ref={list} className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
          {legacy.map((t, i) =>
            t.role === "coach" ? <Bubble key={t.id || `l${i}`} text={t.text} /> : <div key={t.id || `l${i}`} className="max-w-[94%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm"><div className="bp-text"><Markdown text={t.text} /></div></div>,
          )}
          {p.runs.map((r) => (
            <div key={r.id} className="space-y-2">
              <Bubble text={r.message.trim() || "Ganzen Plan prüfen und verbessern"} />
              <RunCard run={r} decide={p.decide} onOpen={p.onOpen} review={r.id === reviewRun?.id} onAnswer={answer} onEstimate={(key, q) => void send(`${chapterTitle(key)}: Bitte ergänze dazu realistische Annahmen und kennzeichne sie im Text als Annahme: ${q}`)} disabled={busy || running} />
            </div>
          ))}
        </div>
      )}

      {empty && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => setMessage(e)}>{e}</button>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="space-y-2">
        <textarea
          ref={field}
          aria-label="Nachricht an die KI"
          className="input min-h-20 text-sm"
          rows={3}
          value={message}
          maxLength={8000}
          disabled={running}
          placeholder={running ? "Die KI arbeitet gerade, gleich geht es weiter …" : "z. B. Wie bewertest du Kapitel 6? · Start verschiebt sich auf April · Preis pro Stunde jetzt 65 € · Werkstatt in Fürth statt Nürnberg"}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" disabled={busy || running || uploading > 0} onClick={() => void send()}>✦ {message.trim() || files.length ? "Senden" : "Ganzen Plan prüfen"}</button>
          <Recorder compact coacheeId={p.coacheeId} onText={(t) => setMessage((m) => (m.trim() ? `${m.trimEnd()} ${t}` : t))} />
          <label className={`btn-ghost btn-sm cursor-pointer ${uploading || running ? "pointer-events-none opacity-60" : ""}`}>
            📎 {uploading ? "Wird gelesen …" : "Datei oder Foto"}
            <input type="file" multiple accept=".pdf,.docx,.xlsx,.txt,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
          {files.map((f) => (
            <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs">
              <span className="truncate">{f.image ? "🖼" : "📄"} {f.name}</span>
              <button type="button" className="text-muted hover:text-danger" aria-label={`${f.name} entfernen`} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>×</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ text }: { text: string }) {
  return <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-tint px-3.5 py-2 text-sm">{text}</p>;
}

function RunCard({ run, decide, onOpen, review, onAnswer, onEstimate, disabled }: { run: RunView; decide: Decide; onOpen: (key: string) => void; review: boolean; onAnswer: (key: string, q: string) => void; onEstimate: (key: string, q: string) => void; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const work = run.progress.chapters.filter((x) => x.action !== "lassen");
  const doneCount = work.filter((x) => x.status === "fertig" || x.status === "fehler").length;
  const failed = work.filter((x) => x.status === "fehler");
  const open = run.changes.filter((x) => x.decision === "offen");

  async function act(key: string | null, decision: "uebernommen" | "verworfen") {
    setBusy(true);
    setError(await decide(run.id, key, decision));
    setBusy(false);
  }

  if (run.status === "laeuft")
    return (
      <div className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm" role="status">
        <p className="font-semibold">
          <span className="animate-pulse text-gold">✦</span>{" "}
          {run.progress.phase === "pruefen" ? "Liest den ganzen Plan und denkt nach …" : run.progress.phase === "blick" ? "Passt „Auf einen Blick“ an …" : `Ändert Kapitel: ${doneCount} von ${work.length} fertig`}
        </p>
        {work.length > 0 && <div className="h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-gold transition-all" style={{ width: `${(doneCount / work.length) * 100}%` }} /></div>}
        <ul className="space-y-0.5 text-xs">
          {work.map((x) => (
            <li key={x.key} className="flex gap-2">
              <span className={x.status === "fertig" ? "text-ok" : x.status === "fehler" ? "text-danger" : x.status === "schreibt" ? "animate-pulse text-gold" : "text-muted"}>{x.status === "fertig" ? "✓" : x.status === "fehler" ? "!" : x.status === "schreibt" ? "✦" : "○"}</span>
              <span>{chapterTitle(x.key)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Du kannst die Seite schließen, die KI arbeitet weiter. Kapitel lassen sich so lange nicht bearbeiten.</p>
      </div>
    );

  if (run.status === "fehler")
    return (
      <div className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md bg-[#f8e6e3] px-3.5 py-2.5 text-sm text-danger">
        <p>{run.error ?? "Das hat nicht geklappt."}</p>
        {open.length > 0 && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void act(null, "verworfen")}>Schon geänderte Kapitel zurücksetzen</button>}
      </div>
    );

  return (
    <div className="max-w-[94%] space-y-3 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm">
      {run.result?.note && <div className="bp-text"><Markdown text={run.result.note} /></div>}
      {!run.result?.note && run.kind === "aendern" && <p>{run.changes.length ? "Angepasst." : "Alles stimmig, nichts geändert."}</p>}

      {run.changes.length > 0 && (
        <div className="space-y-1.5 border-t border-line-soft pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Geändert: {run.changes.length} {run.changes.length === 1 ? "Teil" : "Teile"}{open.length ? `, ${open.length} offen` : ""}</p>
            {open.length > 1 && (
              <span className="flex gap-1.5">
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act(null, "uebernommen")}>✓ Alle übernehmen</button>
                <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void act(null, "verworfen")}>Alle verwerfen</button>
              </span>
            )}
          </div>
          <ul className="divide-y divide-line-soft">
            {run.changes.map((x) => (
              <ChangeRow key={x.key} change={x} reason={run.progress.chapters.find((c) => c.key === x.key)?.reason ?? ""} busy={busy} onOpen={onOpen} act={act} />
            ))}
          </ul>
        </div>
      )}
      {failed.length > 0 && <p className="text-danger">Nicht geschafft: {failed.map((x) => chapterTitle(x.key)).join(", ")}. Schreib einfach „noch einmal“.</p>}
      {error && <p className="text-danger" role="alert">{error}</p>}
      {review && run.result?.review && <Review items={run.result.review} onOpen={onOpen} onAnswer={onAnswer} onEstimate={onEstimate} disabled={disabled} />}
    </div>
  );
}

function ChangeRow({ change: x, reason, busy, onOpen, act }: { change: RunChange; reason: string; busy: boolean; onOpen: (key: string) => void; act: (key: string, d: "uebernommen" | "verworfen") => Promise<void> }) {
  const [show, setShow] = useState(false);
  const stats = useDiffStats(x.before, x.after);
  return (
    <li className="space-y-1.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" className="link font-medium" onClick={() => onOpen(x.key)}>{chapterTitle(x.key)}</button>
        <span className="text-xs text-muted">{x.before.trim() ? <><span className="text-[#1d5a2c]">+{stats.added}</span> / <span className="text-[#8a2a1d]">−{stats.removed}</span> Wörter</> : "neu geschrieben"}</span>
        {x.decision === "uebernommen" && <span className="rounded-full bg-[#d9eedd] px-2 py-0.5 text-xs text-[#1d5a2c]">übernommen</span>}
        {x.decision === "verworfen" && <span className="rounded-full bg-line-soft px-2 py-0.5 text-xs text-muted">verworfen</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setShow(!show)}>{show ? "Zuklappen" : "Änderungen ansehen"}</button>
          {x.decision !== "uebernommen" && <button type="button" className="btn-ghost btn-sm text-ok" disabled={busy} onClick={() => void act(x.key, "uebernommen")}>✓ Übernehmen</button>}
          {x.decision !== "verworfen" && <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={() => void act(x.key, "verworfen")}>✕ Verwerfen</button>}
        </span>
      </div>
      {reason && <p className="text-xs text-muted">{reason}</p>}
      {show && (
        <div className="space-y-2 rounded-lg border border-line-soft bg-bg p-3">
          <DiffLegend />
          <DiffView before={x.before} after={x.after} />
        </div>
      )}
    </li>
  );
}

function Review({ items, onOpen, onAnswer, onEstimate, disabled }: { items: ChapterReview[]; onOpen: (key: string) => void; onAnswer: (key: string, q: string) => void; onEstimate: (key: string, q: string) => void; disabled: boolean }) {
  const asks = items.reduce((n, x) => n + x.questions.length, 0);
  const [open, setOpen] = useState(asks > 0);
  const weak = items.filter((x) => x.rating !== "gut").length;
  return (
    <div className="space-y-2 border-t border-line-soft pt-2.5">
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bewertung je Kapitel</span>
        <span className="text-xs text-muted">{items.length - weak} gut, {weak} ausbaufähig{asks ? `, ${asks} Rückfragen` : ""} · {open ? "zuklappen" : "aufklappen"}</span>
      </button>
      {open && (
        <ul className="space-y-2">
          {items.map((x) => (
            <li key={x.key} className="space-y-1">
              <p className="flex items-start gap-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${RATING[x.rating].dot}`} title={RATING[x.rating].label} />
                <span className="min-w-0">
                  <button type="button" className="link font-medium" onClick={() => onOpen(x.key)}>{chapterTitle(x.key)}</button>
                  <span className="text-xs text-muted"> · {RATING[x.rating].label}</span>
                  {x.text && <span className="block text-xs text-muted">{x.text}</span>}
                </span>
              </p>
              {x.questions.map((q) => (
                <div key={q} className="ml-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[#fdfaf3] px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 basis-60">❓ {q}</span>
                  <button type="button" className="link" disabled={disabled} onClick={() => onAnswer(x.key, q)}>Beantworten</button>
                  <button type="button" className="link" disabled={disabled} onClick={() => onEstimate(x.key, q)}>KI schätzen lassen</button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
