"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { RunView } from "@/lib/bp/gesamt-ki";
import { BANK_ZWECKE, type BankZweck } from "@/lib/bp/bank";
import { BANK_SECTIONS } from "@/lib/bp/bank-sections";
import { BUNDESWEIT, landOf } from "@/lib/bp/foerderung";
import { SECTIONS, chapterProgress, type GlanceItem, type SectionDef, type Sections } from "@/lib/bp/sections";
import type { PlanStand } from "@/lib/bp/stand";
import { Markdown } from "../assistant/Markdown";
import type { BankState } from "./BankAbgabe";
import { ChatBox } from "./ChatBox";
import { Answer } from "./PlanChat";
import { FiguresTable } from "./PlanEditor";
import { openFile } from "./openFile";

/*
 * Businessplan für den Coach: eine Seite für beide Fassungen.
 * Oben „Für wen?“: Amt (Agentur für Arbeit, Jobcenter) oder Bank und Förderung.
 * Links: Änderungen eingeben (die KI schreibt danach den ganzen Plan neu) und die Kapitel als Menü.
 * Rechts: der Plan so, wie er im PDF aussieht (Gliederung und Farben der Vorlage).
 * Sind seit dem letzten Schreiben neue Angaben da (Fragebogen, Finanzplan), steht oben ein Hinweis mit „Neu schreiben“.
 */

type Fassung = "amt" | "bank";
type Props = {
  fassung: Fassung;
  onFassung: (f: Fassung) => void;
  name: string;
  vorname: string;
  title: string;
  sections: Sections;
  glance: GlanceItem[];
  bankSections: Sections;
  figures: string[][] | null;
  runs: RunView[];
  stand: PlanStand;
  fragebogenDa: boolean;
  financeDa: boolean;
  href: string;
  bankHref: string;
  pdfHref: string;
  wordHref: string;
  ai: boolean;
  bank: BankState;
  onEdit: () => void;
  onChange: (sections: Sections, glance: GlanceItem[]) => void;
  onBankChange: (sections: Sections) => void;
};

const NEU_SCHREIBEN = "Schreib den ganzen Businessplan neu mit allen aktuellen Angaben aus Fragebogen, Finanzplan und Gesprächen.";
const SUGGESTIONS = ["Businessplan komplett schreiben", "Start ist erst im April", "Mach den Plan überzeugender für die fachkundige Stelle", "Mehr zum Marketing mit konkreten Maßnahmen und Kosten"];

const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ error: "Keine Verbindung. Bitte gleich noch einmal versuchen." }));

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export function PlanStudio(p: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [runs, setRuns] = useState(p.runs);
  const [error, setError] = useState<string | null>(null);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [mobile, setMobile] = useState<"plan" | "aendern">("plan");
  const last = runs[runs.length - 1] ?? null;
  const running = last?.status === "laeuft";
  const cb = useRef(p.onChange);
  useEffect(() => {
    cb.current = p.onChange;
  });

  const upsert = (run: RunView) => setRuns((all) => (all.some((r) => r.id === run.id) ? all.map((r) => (r.id === run.id ? run : r)) : [...all, run]));

  // Laufendes Schreiben abfragen, bis es fertig ist; danach den neuen Plan übernehmen und den Stand oben auffrischen
  useEffect(() => {
    if (!running || !last) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const res = (await fetch(`${p.href}?run=${last.id}`).then((r) => r.json()).catch(() => null)) as { run?: RunView; sections?: Sections; glance?: GlanceItem[] } | null;
      if (stop) return;
      if (res?.run) upsert(res.run);
      if (res?.run && res.run.status !== "laeuft") {
        if (res.sections && res.glance) cb.current(res.sections, res.glance);
        router.refresh();
      }
      if (!res?.run || res.run.status === "laeuft") timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, last?.id, p.href]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, files: { id: string; name: string }[] = []) {
    setError(null);
    const res = (await post(p.href, { message: text, files: files.map((f) => f.id), fileNames: files.map((f) => f.name) })) as { run?: RunView; error?: string };
    if (res.error || !res.run) {
      setError(res.error ?? "Das hat gerade nicht geklappt.");
      return false;
    }
    upsert(res.run);
    return true;
  }

  // Aus dem Fragebogen kommend (?schreiben=1): gleich den ganzen Plan schreiben
  const started = useRef(false);
  useEffect(() => {
    if (started.current || sp.get("schreiben") !== "1" || !p.ai) return;
    started.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("schreiben");
    window.history.replaceState(null, "", url);
    // erst nach dem Rendern senden (setState nicht direkt im Effekt)
    if (!running) queueMicrotask(() => void send("Schreib den ganzen Businessplan auf Grundlage des Gründungsfragebogens und des Finanzplans."));
  }, [sp, p.ai]); // eslint-disable-line react-hooks/exhaustive-deps

  async function undo(run: RunView) {
    setError(null);
    const res = (await post(p.href, { decide: run.id, decision: "verworfen" })) as { run?: RunView; sections?: Sections; glance?: GlanceItem[]; error?: string };
    if (res.run) upsert(res.run);
    if (res.sections && res.glance) p.onChange(res.sections, res.glance);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function writeBank() {
    setBankBusy(true);
    setBankError(null);
    await p.bank.save();
    const res = (await post(p.bankHref, { plan: true, all: true })) as { sections?: Sections; error?: string };
    setBankBusy(false);
    if (res.sections) {
      p.onBankChange(res.sections);
      router.refresh();
    }
    if (res.error) setBankError(res.error);
  }

  const isBank = p.fassung === "bank";
  const defs: SectionDef[] = isBank ? BANK_SECTIONS : SECTIONS;
  const sections = isBank ? p.bankSections : p.sections;
  const written = defs.filter((s) => sections[s.key]?.text.trim()).length;
  const lastDone = [...runs].reverse().find((r) => r.status === "fertig");
  const changed = new Set(isBank ? [] : (lastDone?.changes ?? []).filter((x) => x.decision !== "verworfen").map((x) => x.key));
  const busy = running || bankBusy;
  const pdf = `${p.pdfHref}${isBank ? "?fassung=bank&ansehen" : "?ansehen"}`;

  // Hinweis oben: noch nicht geschrieben, neue Angaben, läuft gerade
  let banner: ReactNode = null;
  if (running) banner = <Banner tone="work" text={last?.progress.phase === "bank" ? "Die Bankfassung wird passend zum neuen Plan geschrieben …" : "Der ganze Businessplan wird gerade neu geschrieben. Das dauert ein bis drei Minuten, du kannst die Seite offen lassen."} />;
  else if (bankBusy) banner = <Banner tone="work" text="Die Fassung für Bank und Förderung wird geschrieben. Das dauert ein bis zwei Minuten." />;
  else if (!isBank && !SECTIONS.some((s) => p.sections[s.key]?.text.trim()))
    banner = p.fragebogenDa || p.financeDa ? (
      <Banner tone="todo" text={`Der Businessplan ist noch nicht geschrieben. ${p.fragebogenDa ? "Fragebogen" : "Finanzplan"} ist da, daraus wird der ganze Plan nach deiner Vorlage geschrieben.`} action={p.ai ? { label: "Businessplan jetzt schreiben", onClick: () => void send("Schreib den ganzen Businessplan auf Grundlage des Gründungsfragebogens und des Finanzplans.") } : undefined} />
    ) : (
      <Banner tone="todo" text={`Noch keine Angaben. Am besten schickt ${p.vorname} zuerst den Gründungsfragebogen, oder du lädst links Unterlagen hoch.`} />
    );
  else if (!isBank && p.stand.neu.length)
    banner = <Banner tone="todo" text={`Neue Angaben seit dem letzten Schreiben: ${p.stand.neu.join(" und ")}.`} action={p.ai ? { label: "Ganzen Plan neu schreiben", onClick: () => void send(NEU_SCHREIBEN) } : undefined} />;
  else if (isBank && !written)
    banner = <Banner tone="todo" text="Die Fassung für Bank und Förderung ist noch nicht geschrieben. Wähle links, für wen sie ist, und lass sie schreiben." />;
  else if (isBank && p.stand.bankVeraltet)
    banner = <Banner tone="todo" text="Der Plan fürs Amt wurde nach der Bankfassung geändert." action={p.ai ? { label: "Bankfassung neu schreiben", onClick: () => void writeBank() } : undefined} />;

  const left = isBank ? (
    <BankZiel bank={p.bank} busy={busy} ai={p.ai} written={written > 0} error={bankError} onWrite={() => void writeBank()} onEdit={p.onEdit} />
  ) : (
    <ChatBox
      title="Änderungen"
      className="h-[34rem]"
      items={runs.map((r) => ({ id: r.id, user: r.message.trim() || "Businessplan komplett schreiben", answer: <Answer run={r} onUndo={() => undo(r)} onShow={() => setMobile("plan")} /> }))}
      uploadHref={`${p.href}/datei`}
      onSend={send}
      working={running}
      enabled={p.ai}
      emptyTitle="Was soll sich ändern?"
      emptyText="Schreib neue Angaben oder Wünsche hinein, zum Beispiel „Start ist erst im April“. Danach wird der ganze Plan neu geschrieben, damit alles zusammenpasst. Unterlagen und Fotos kannst du mitgeben."
      suggestions={SUGGESTIONS}
      filesOnly="Übernimm diese Unterlagen und schreib den ganzen Businessplan neu."
      onClear={() => void post(p.href, { clear: true }).then(() => setRuns([]))}
      error={error}
      scrollKey={last ? `${last.id}${last.status}` : ""}
    />
  );

  return (
    <div className="space-y-4">
      <section className="night relative overflow-hidden rounded-[24px] px-4 py-5 sm:px-7 sm:py-6">
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-soft">{isBank ? "Businessplan für Bank und Förderung" : "Businessplan fürs Amt"} · {written} von {defs.length} Kapiteln</p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-balance">{p.title || p.name}</h2>
            <p className="text-sm text-white/65">{p.name}{!isBank && p.stand.geschrieben ? ` · zuletzt geschrieben am ${day(p.stand.geschrieben)}` : ""}{isBank && p.stand.bankGeschrieben ? ` · Stand ${day(p.stand.bankGeschrieben)}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-gold btn-sm" disabled={!written || busy} onClick={() => void openFile(pdf, undefined, true)}>PDF ansehen</button>
            {!isBank && <button type="button" className="btn-sm rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20 disabled:opacity-50" disabled={!written || busy} onClick={() => void openFile(p.wordHref)}>Word</button>}
            <button type="button" className="btn-sm rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20 disabled:opacity-50" disabled={busy} onClick={p.onEdit}>Selbst bearbeiten</button>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Für wen ist der Plan?">
          <span className="mr-1 text-xs font-semibold text-white/60">Für wen?</span>
          {([["amt", "Amt: Agentur für Arbeit, Jobcenter"], ["bank", "Bank und Förderung"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={p.fassung === k} disabled={busy && p.fassung !== k} onClick={() => p.onFassung(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${p.fassung === k ? "bg-white text-night shadow" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {banner}

      <div className="flex gap-1 rounded-full border border-line-soft bg-surface p-1 lg:hidden" role="tablist">
        {([["plan", "Plan"], ["aendern", isBank ? "Für wen und Kapitel" : "Ändern und Kapitel"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mobile === k} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${mobile === k ? "bg-accent text-white" : "text-muted"}`} onClick={() => setMobile(k)}>{label}</button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className={`min-w-0 space-y-4 lg:sticky lg:top-[6rem] ${mobile === "aendern" ? "" : "hidden lg:block"}`}>
          {left}
          <Kapitel defs={defs} sections={sections} changed={changed} onPick={() => setMobile("plan")} />
        </div>
        <div className={`min-w-0 ${mobile === "plan" ? "" : "hidden lg:block"}`}>
          <Dokument defs={defs} sections={sections} glance={isBank ? [] : p.glance} figures={p.figures} changed={changed} title={p.title} name={p.name} isBank={isBank} bank={p.bank} />
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, text, action }: { tone: "todo" | "work"; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${tone === "work" ? "border-accent/20 bg-accent/5" : "border-gold/60 bg-gold-soft/40"}`} role="status">
      <p className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium">
        {tone === "work" ? <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /> : <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-bold text-night" aria-hidden>!</span>}
        {text}
      </p>
      {action && <button type="button" className="btn btn-sm" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

/** Kapitel als Menü: antippen springt zum Kapitel im Plan */
function Kapitel({ defs, sections, changed, onPick }: { defs: SectionDef[]; sections: Sections; changed: Set<string>; onPick: () => void }) {
  function jump(key: string) {
    onPick();
    requestAnimationFrame(() => document.getElementById(`kap-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  return (
    <nav className="card !p-2" aria-label="Kapitel">
      <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Kapitel</p>
      <ol className="space-y-0.5">
        {defs.map((d, i) => {
          const pr = chapterProgress(sections[d.key]?.text ?? "", d);
          return (
            <li key={d.key}>
              <button type="button" onClick={() => jump(d.key)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <span className={`size-2.5 shrink-0 rounded-full ${pr.state === "fertig" ? "bg-ok" : pr.state === "begonnen" ? "bg-gold" : "bg-line"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{i + 1}. {d.title}</span>
                {changed.has(d.key) ? <span className="rounded-full bg-gold-soft px-1.5 text-[10px] font-semibold text-night">neu</span> : <span className="text-[11px] tabular-nums text-muted">{pr.words ? `${pr.words} W.` : "leer"}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Für wen die Bankfassung ist, und schreiben lassen */
function BankZiel({ bank, busy, ai, written, error, onWrite, onEdit }: { bank: BankState; busy: boolean; ai: boolean; written: boolean; error: string | null; onWrite: () => void; onEdit: () => void }) {
  const b = bank.b;
  const land = landOf(b.land);
  const programme = [...BUNDESWEIT, ...(land?.programme ?? [])].filter((x) => (b.zweck === "foerderung" ? x.art !== "Kredit" : b.zweck === "foerderkredit" ? x.art === "Kredit" : false));
  return (
    <section className="card space-y-4">
      <div>
        <p className="text-sm font-semibold"><span className="text-gold">✦</span> Für wen ist diese Fassung?</p>
        <p className="mt-1 text-xs text-muted">Du entscheidest, wofür der Plan eingereicht wird. Danach wird er passend für diesen Leser geschrieben.</p>
      </div>
      <div className="grid gap-1.5" role="radiogroup" aria-label="Zweck">
        {BANK_ZWECKE.map((z) => (
          <label key={z.key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm ${b.zweck === z.key ? "border-accent bg-accent/5" : "border-line-soft hover:border-accent/40"}`}>
            <input type="radio" name="bank-zweck" className="mt-0.5 accent-[var(--accent)]" checked={b.zweck === z.key} onChange={() => bank.set({ zweck: z.key as BankZweck })} />
            <span><span className="block font-semibold">{z.label}</span><span className="block text-xs text-muted">{z.text}</span></span>
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="label">{b.zweck === "foerderung" ? "Förderprogramm" : b.zweck === "foerderkredit" ? "Förderkredit und Bank" : "Bank"}</span>
        <input className="input" list="bank-empfaenger" value={b.empfaenger} maxLength={160} placeholder={b.zweck === "foerderung" ? "z. B. Mikrokredit, Gründungsprämie des Landes" : b.zweck === "foerderkredit" ? "z. B. KfW StartGeld über die Sparkasse" : "z. B. Sparkasse Köln"} onChange={(e) => bank.set({ empfaenger: e.target.value })} />
        <datalist id="bank-empfaenger">{programme.map((x) => <option key={x.name} value={x.name} />)}</datalist>
      </label>
      {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" disabled={busy || !ai} onClick={onWrite}>{written ? "Neu schreiben" : "Fassung schreiben"}</button>
        <button type="button" className="link text-sm" onClick={onEdit}>Sicherheiten, Vermögen, Bankfragen →</button>
      </div>
      {!ai && <p className="text-xs text-muted">Die KI ist auf dem Server noch nicht eingerichtet.</p>}
    </section>
  );
}

/** Der Plan wie im PDF: Gliederung und Farben der Vorlage (Navy, Petrol) */
function Dokument({ defs, sections, glance, figures, changed, title, name, isBank, bank }: { defs: SectionDef[]; sections: Sections; glance: GlanceItem[]; figures: string[][] | null; changed: Set<string>; title: string; name: string; isBank: boolean; bank: BankState }) {
  const items = glance.filter((g) => g.label.trim() && g.value.trim());
  const any = defs.some((d) => sections[d.key]?.text.trim());
  const zweck = BANK_ZWECKE.find((z) => z.key === bank.b.zweck);
  return (
    <article className="overflow-hidden rounded-[20px] bg-white text-[#1d2433] shadow-[0_1px_3px_rgba(14,40,65,.08),0_12px_32px_-12px_rgba(14,40,65,.18)] ring-1 ring-black/5" aria-label="Businessplan">
      <header className="bg-[#0e2841] px-6 pt-8 pb-6 text-white sm:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{isBank ? `Businessplan · ${zweck?.text ?? "Bank"}` : "Businessplan"}</p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight sm:text-[28px]">{title || name}</h3>
        <p className="mt-1 text-sm text-[#9ec5d6]">{name}{isBank && bank.b.empfaenger ? ` · ${bank.b.empfaenger}` : ""}</p>
        <div className="mt-5 h-1.5 w-24 bg-[#156082]" aria-hidden />
      </header>
      <div className="space-y-8 px-6 py-7 sm:px-10 sm:py-9">
        {!any && <p className="text-sm text-[#5b6577]">Noch leer. Sobald der Plan geschrieben ist, steht er hier so, wie er im PDF aussieht.</p>}
        {items.length > 0 && (
          <section className={changed.has("blick") ? "-ml-3 border-l-4 border-gold pl-2" : ""}>
            <h4 className="mb-3 border-b-2 border-[#156082] pb-1.5 text-lg font-semibold text-[#0e2841]">Auf einen Blick</h4>
            <dl className="grid overflow-hidden rounded-lg border border-[#d9dee6] text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
              {items.map((g, i) => (
                <Fragment key={i}>
                  <dt className={`bg-[#eef3f7] px-3 py-2 font-semibold text-[#0e2841] ${i ? "border-t border-[#d9dee6]" : ""}`}>{g.label}</dt>
                  <dd className={`whitespace-pre-wrap px-3 py-2 ${i ? "sm:border-t border-[#d9dee6]" : ""}`}>{g.value}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        )}
        {defs.map((d, i) => {
          const text = sections[d.key]?.text.trim();
          return (
            <section key={d.key} id={`kap-${d.key}`} className={`scroll-mt-28 space-y-3 ${changed.has(d.key) ? "-ml-3 border-l-4 border-gold pl-2" : ""}`}>
              <h4 className="flex items-baseline gap-3 border-b-2 border-[#156082] pb-1.5 text-xl font-semibold text-[#0e2841]">
                <span className="text-[#156082]">{i + 1}.</span>
                <span className="flex-1">{d.title}</span>
                {changed.has(d.key) && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-night">gerade neu geschrieben</span>}
              </h4>
              {text ? <div className="bp-text bp-vorlage text-[15px] leading-relaxed"><Markdown text={text} /></div> : <p className="text-sm italic text-[#8a93a3]">Noch nicht geschrieben.</p>}
              {(d.key === "finanzen" || d.key === "rentabilitaet") && figures && <FiguresTable rows={figures} />}
            </section>
          );
        })}
      </div>
    </article>
  );
}
