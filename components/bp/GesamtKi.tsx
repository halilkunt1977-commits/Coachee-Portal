"use client";
import { useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/bp/gesamt-ki";
import type { ChatTurn } from "@/lib/bp/notes";
import { Markdown } from "../assistant/Markdown";
import { SECTIONS, type GlanceItem, type Sections } from "@/lib/bp/sections";

/*
 * Eine KI für den ganzen Businessplan (nur Coach): neue Angaben, Zahlen oder Wünsche eingeben (oder leer lassen),
 * die KI prüft alle Kapitel gegen Finanzplan, Notizen und Gespräche und passt jedes betroffene Kapitel direkt an.
 * Der Durchgang läuft auf dem Server weiter, auch wenn die Seite zu ist; „Rückgängig“ holt den Stand davor zurück.
 */

type Props = {
  href: string;
  initial: RunView | null;
  /** Chat zum ganzen Plan (Fragen, Analyse, Bewertung) */
  chat: ChatTurn[];
  /** vor dem Start: offene Änderungen im Editor speichern */
  beforeStart: () => Promise<void>;
  onRunning: (running: boolean) => void;
  onUpdate: (sections: Sections, glance: GlanceItem[]) => void;
  onOpen: (key: string) => void;
};

const EXAMPLES = ["Gleiche alles mit dem aktuellen Finanzplan ab", "Start ist jetzt der 01.04.2027", "Stundensatz ist 65 € statt 55 €", "Zielgruppe zusätzlich Hausverwaltungen"];
const ACTION = { neu: "neu geschrieben", anpassen: "angepasst", lassen: "unverändert" } as const;
const title = (key: string) => {
  const i = SECTIONS.findIndex((s) => s.key === key);
  return i < 0 ? key : `${i + 1}. ${SECTIONS[i].title}`;
};

const QUESTIONS = ["Wie bewertest du den Plan insgesamt?", "Würde die fachkundige Stelle den Plan so akzeptieren?", "Sind Umsatz und Preise realistisch?", "Wo widersprechen sich Kapitel und Finanzplan?", "Was fehlt noch?"];

export function GesamtKi(p: Props) {
  const [tab, setTab] = useState<"anpassen" | "fragen">("anpassen");
  const [turns, setTurns] = useState<ChatTurn[]>(p.chat);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const chatList = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [run, setRun] = useState<RunView | null>(p.initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
  const running = run?.status === "laeuft";
  const cb = useRef(p);
  useEffect(() => {
    cb.current = p;
  });

  useEffect(() => {
    cb.current.onRunning(running);
    if (!running || !run) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = await fetch(`${p.href}?run=${run.id}`).then((r) => r.json()).catch(() => null) as { run?: RunView; sections?: Sections; glance?: GlanceItem[] } | null;
      if (stop) return;
      if (res?.run) setRun(res.run);
      if (res?.run && res.run.status !== "laeuft" && res.sections && res.glance) cb.current.onUpdate(res.sections, res.glance);
      if (!res?.run || res.run.status === "laeuft") timer = setTimeout(tick, 2500);
    };
    let timer = setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, run?.id, p.href]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = chatList.current;
    if (!el) return;
    // neue Antwort: an ihren Anfang springen, sonst ans Ende
    const last = el.lastElementChild as HTMLElement | null;
    el.scrollTop = last && !asking ? last.offsetTop - 4 : el.scrollHeight;
  }, [turns.length, asking, tab]);

  async function ask(text = question) {
    if (!text.trim() || asking) return;
    setAsking(true);
    setError(null);
    setTurns((t) => [...t, { id: `neu-${t.length}`, role: "coach", text, at: new Date().toISOString() }]);
    setQuestion("");
    const res = await fetch(p.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ask: text }) }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." })) as { turns?: ChatTurn[]; error?: string };
    setAsking(false);
    if (res.turns) setTurns(res.turns);
    if (res.error) setError(res.error);
  }

  async function clearChat() {
    setTurns([]);
    await fetch(p.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => null);
  }

  async function start(text = message) {
    if (busy || running) return;
    setBusy(true);
    setError(null);
    await p.beforeStart();
    const res = await fetch(p.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." })) as { run?: RunView; error?: string };
    setBusy(false);
    if (res.error || !res.run) return setError(res.error ?? "Das hat gerade nicht geklappt.");
    setRun(res.run);
    setMessage("");
    setDetails(false);
    setTab("anpassen");
  }

  async function undo() {
    if (!run || busy) return;
    setBusy(true);
    const res = await fetch(p.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: run.id }) }).then((r) => r.json()).catch(() => null) as { ok?: boolean; run?: RunView; sections?: Sections; glance?: GlanceItem[] } | null;
    setBusy(false);
    if (!res?.ok || !res.sections || !res.glance) return setError("Rückgängig hat nicht geklappt.");
    if (res.run) setRun(res.run);
    p.onUpdate(res.sections, res.glance);
  }

  const chapters = run?.progress.chapters ?? [];
  const work = chapters.filter((x) => x.action !== "lassen");
  const doneCount = work.filter((x) => x.status === "fertig" || x.status === "fehler").length;
  const failed = work.filter((x) => x.status === "fehler");

  return (
    <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fdfaf3] p-3 sm:p-4" aria-label="KI für den ganzen Businessplan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold"><span className="text-gold">✦</span> KI für den ganzen Businessplan</p>
          <p className="text-xs text-muted">{tab === "anpassen" ? "Neue Zahlen, Notizen oder Angaben hineinschreiben, oder leer lassen. Die KI prüft den ganzen Plan gegen Finanzplan, Notizen und Gespräche und passt alle betroffenen Kapitel direkt an." : "Frag die KI nach Analyse und Bewertung des ganzen Plans. Hier wird nichts geändert; Empfehlungen kannst du mit einem Klick einarbeiten lassen."} Nur für dich sichtbar.</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-line-soft bg-surface p-0.5 text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "anpassen"} className={`rounded-md px-3 py-1.5 ${tab === "anpassen" ? "bg-accent font-semibold text-white" : "text-muted"}`} onClick={() => setTab("anpassen")}>Anpassen{running ? " …" : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "fragen"} className={`rounded-md px-3 py-1.5 ${tab === "fragen" ? "bg-accent font-semibold text-white" : "text-muted"}`} onClick={() => setTab("fragen")}>Fragen & Bewertung</button>
        </div>
      </div>

      {tab === "fragen" && (
        <div className="space-y-3">
          {turns.length > 0 && (
            <div ref={chatList} className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {turns.map((t, i) =>
                t.role === "coach" ? (
                  <p key={t.id || i} className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-tint px-3.5 py-2 text-sm">{t.text}</p>
                ) : (
                  <div key={t.id || i} className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm">
                    <div className="bp-text"><Markdown text={t.text} /></div>
                    <button type="button" className="link text-xs" disabled={busy || running} onClick={() => void start(`Setze diese Empfehlungen aus der Bewertung im ganzen Plan um, soweit das Material sie trägt:\n${t.text.slice(0, 6000)}`)}>✦ Diese Empfehlungen in den Plan einarbeiten</button>
                  </div>
                ),
              )}
            </div>
          )}
          {asking && <p className="text-sm text-muted" role="status"><span className="animate-pulse text-gold">✦</span> Liest den ganzen Plan und denkt nach …</p>}
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {QUESTIONS.map((q) => (
                <button key={q} type="button" className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => void ask(q)}>{q}</button>
              ))}
            </div>
          )}
          <textarea
            aria-label="Frage zum Businessplan"
            className="input min-h-16 text-sm"
            rows={2}
            value={question}
            maxLength={4000}
            placeholder="z. B. Ist die Kundengewinnung überzeugend? Reicht das Geld für den Lebensunterhalt?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" disabled={asking || !question.trim()} onClick={() => void ask()}>Fragen</button>
            {turns.length > 0 && <button type="button" className="btn-ghost btn-sm" disabled={asking} onClick={() => void clearChat()}>Gespräch leeren</button>}
          </div>
        </div>
      )}

      {tab === "anpassen" && !running && (
        <>
          <textarea
            aria-label="Neue Angaben für den Businessplan"
            className="input min-h-20 text-sm"
            rows={3}
            value={message}
            maxLength={8000}
            placeholder="z. B. Start verschiebt sich auf April, Preis pro Stunde jetzt 65 €, Werkstatt in Fürth statt Nürnberg …"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void start();
            }}
          />
          {!message && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => setMessage(e)}>{e}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void start()}>✦ {message.trim() ? "Angaben einarbeiten und alles anpassen" : "Ganzen Plan prüfen und anpassen"}</button>
            <span className="text-xs text-muted">Der Stand davor wird gesichert und lässt sich zurückholen.</span>
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {tab === "anpassen" && run && running && (
        <div className="space-y-2" role="status">
          {run.message && <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-tint px-3.5 py-2 text-sm">{run.message}</p>}
          <p className="text-sm font-semibold">
            <span className="animate-pulse text-gold">✦</span>{" "}
            {run.progress.phase === "pruefen" ? "Prüft den ganzen Plan …" : run.progress.phase === "blick" ? "Passt „Auf einen Blick“ an …" : `Passt Kapitel an: ${doneCount} von ${work.length} fertig`}
          </p>
          {work.length > 0 && <div className="h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-gold transition-all" style={{ width: `${(doneCount / work.length) * 100}%` }} /></div>}
          <ul className="space-y-0.5 text-xs">
            {work.map((x) => (
              <li key={x.key} className="flex gap-2">
                <span className={x.status === "fertig" ? "text-ok" : x.status === "fehler" ? "text-danger" : x.status === "schreibt" ? "animate-pulse text-gold" : "text-muted"}>{x.status === "fertig" ? "✓" : x.status === "fehler" ? "!" : x.status === "schreibt" ? "✦" : "○"}</span>
                <span>{title(x.key)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Du kannst die Seite schließen, die Anpassung läuft weiter. Kapitel lassen sich so lange nicht bearbeiten.</p>
        </div>
      )}

      {tab === "anpassen" && run && !running && run.status === "fertig" && (
        <div className="space-y-2 rounded-xl bg-surface p-3 text-sm">
          <p className="text-xs text-muted">{new Date(run.at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{run.message ? ` · „${run.message.length > 90 ? `${run.message.slice(0, 90)} …` : run.message}“` : " · ganzer Plan abgeglichen"}</p>
          {run.undone ? (
            <p className="text-muted">Rückgängig gemacht, der Stand davor ist wieder da.</p>
          ) : (
            <>
              <p><span className="text-gold">✦</span> {run.result?.note || (work.length ? "Angepasst." : "Alles stimmig, nichts geändert.")}</p>
              {work.length > 0 && (
                <p>
                  {work.filter((x) => x.status === "fertig").length} Kapitel angepasst{run.result?.glance ? `, „Auf einen Blick“ mit ${run.result.glance} Angaben` : ""}.{" "}
                  <button type="button" className="link" onClick={() => setDetails(!details)}>{details ? "Weniger" : "Was wurde geändert?"}</button>
                </p>
              )}
              {failed.length > 0 && <p className="text-danger">Nicht geschafft: {failed.map((x) => title(x.key)).join(", ")}. Einfach noch einmal starten.</p>}
              {details && (
                <ul className="divide-y divide-line-soft">
                  {chapters.map((x) => (
                    <li key={x.key} className="py-1.5">
                      <button type="button" className="link font-medium" onClick={() => p.onOpen(x.key)}>{title(x.key)}</button>
                      <span className="text-xs text-muted"> · {ACTION[x.action]}</span>
                      {x.reason && <p className="text-xs text-muted">{x.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {work.length > 0 && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void undo()}>Rückgängig</button>}
            </>
          )}
        </div>
      )}
      {tab === "anpassen" && run && !running && run.status === "fehler" && (
        <div className="space-y-2 rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger">
          <p>{run.error ?? "Das hat nicht geklappt."}</p>
          {!run.undone && work.some((x) => x.status === "fertig") && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void undo()}>Schon geänderte Kapitel zurücksetzen</button>}
        </div>
      )}
    </div>
  );
}
