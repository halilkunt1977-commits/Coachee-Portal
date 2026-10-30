"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveGlance, saveProjectNotes, saveSection, saveTitle } from "@/app/actions/businessplan";
import type { RunView } from "@/lib/bp/gesamt-ki";
import { GLANCE_PRESETS, SECTIONS, chapterProgress, type GlanceItem, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { ImportFileButton } from "./ImportButtons";
import { GesamtKi } from "./GesamtKi";
import { SaveBadge, useAutosave, type SaveResult } from "./useAutosave";
import { useT } from "@/components/i18n/LangProvider";

type Baustein = { category: string; title: string; detail: string };
type Props = {
  coacheeId: string;
  coach: boolean;
  name: string;
  title: string;
  sections: Sections;
  glance: GlanceItem[];
  figures: string[][] | null;
  names: Record<string, string>;
  bausteine: Baustein[];
  categoryLabels: Record<string, string>;
  ai: boolean;
  /** „An … senden“ */
  share?: React.ReactNode;
  pdfHref: string;
  wordHref: string;
  financeHref: string;
  imported: { name: string; at: string } | null;
  filled: boolean;
  /** KI für den ganzen Plan und Notizen zum Vorhaben (nur Coach) */
  projectNotes: string;
  schreibhilfeHref: string;
  gesamtHref: string;
  lastRun: RunView | null;
};

type Sec = { text: string; sources: string; saved: string; version: number; updatedAt: string | null; updatedBy: string | null; conflict?: { text: string; sources: string; version: number; by: string | null } };
const snapshot = (s: { text: string; sources: string }) => `${s.text}\u0000${s.sources}`;
const BLICK = "blick";

export function PlanEditor(p: Props) {
  const t = useT();
  const [secs, setSecs] = useState<Record<string, Sec>>(() =>
    Object.fromEntries(SECTIONS.map((s) => {
      const v = p.sections[s.key];
      return [s.key, { text: v.text, sources: v.sources, saved: snapshot(v), version: v.version, updatedAt: v.updated_at, updatedBy: v.updated_by }];
    })),
  );
  const [active, setActive] = useState(() => (p.glance.every((g) => !g.value.trim() || g.label === "Gründer" || g.label === "Firmenname") ? BLICK : SECTIONS.find((s) => s.key !== "summary" && chapterProgress(p.sections[s.key].text, s).state !== "fertig")?.key ?? "idee"));
  const [title, setTitle] = useState(p.title);
  const [glance, setGlance] = useState({ items: p.glance, key: 0 });
  /** Die KI passt gerade den ganzen Plan an: so lange nichts bearbeiten */
  const [aiRunning, setAiRunning] = useState(false);
  const [preview, setPreview] = useState(false);
  const latest = useRef(secs);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    latest.current = secs;
  }, [secs]);

  // Alle geänderten Kapitel speichern; ein Kapitel mit Konflikt wartet auf die Entscheidung des Nutzers.
  const { state, schedule, save } = useAutosave(async (): Promise<SaveResult> => {
    for (const key of Object.keys(latest.current)) {
      const s = latest.current[key];
      if (snapshot(s) === s.saved || s.conflict) continue;
      const { text, sources } = s;
      const res = await saveSection(p.coacheeId, key, s.version, text, sources);
      const apply = (fn: (x: Sec) => Sec) => {
        latest.current = { ...latest.current, [key]: fn(latest.current[key]) };
        setSecs((prev) => ({ ...prev, [key]: fn(prev[key]) }));
      };
      if (res.ok) apply((x) => ({ ...x, saved: snapshot({ text, sources }), version: res.version, updatedAt: res.savedAt, updatedBy: "me" }));
      else if (res.conflict) apply((x) => ({ ...x, conflict: res.conflict }));
      else return { ok: false, error: res.error };
    }
    return { ok: true };
  });

  const patch = (key: string, fields: Partial<Pick<Sec, "text" | "sources">>) => {
    setSecs((prev) => ({ ...prev, [key]: { ...prev[key], ...fields } }));
    schedule();
  };

  // Textfeld wächst mit dem Inhalt
  const current = active === BLICK ? null : secs[active];
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(320, el.scrollHeight + 4)}px`;
  }, [current?.text, active, preview]);

  const progress = Object.fromEntries(SECTIONS.map((s) => [s.key, chapterProgress(secs[s.key].text, s)]));
  const done = SECTIONS.filter((s) => progress[s.key].state === "fertig").length;
  const overall = Math.round(SECTIONS.reduce((a, s) => a + progress[s.key].pct, 0) / SECTIONS.length);

  /** Stand nach einem Durchgang der KI übernehmen (alle Kapitel frisch vom Server) */
  function takeOver(sections: Sections, items: GlanceItem[]) {
    const next = Object.fromEntries(SECTIONS.map((s) => {
      const v = sections[s.key];
      return [s.key, { text: v.text, sources: v.sources, saved: snapshot(v), version: v.version, updatedAt: v.updated_at, updatedBy: v.updated_by }];
    }));
    latest.current = next;
    setSecs(next);
    setGlance((g) => ({ items, key: g.key + 1 }));
  }

  async function download(href: string) {
    // erst speichern, damit die Datei den letzten Stand enthält
    await save();
    const a = document.createElement("a");
    a.href = href;
    a.click();
  }

  function go(key: string) {
    setActive(key);
    setPreview(false);
  }

  /** Baustein (Zwischenüberschrift, Liste, Tabelle) an der Cursorposition einfügen */
  function insert(snippet: string, select?: string) {
    if (!current || active === BLICK) return;
    const el = field.current;
    const pos = el ? el.selectionEnd : current.text.length;
    const before = current.text.slice(0, pos).replace(/\s*$/, "");
    const after = current.text.slice(pos).replace(/^\s*/, "");
    const text = `${before}${before ? "\n\n" : ""}${snippet}${after ? `\n\n${after}` : ""}`;
    patch(active, { text });
    requestAnimationFrame(() => {
      if (!field.current) return;
      const start = before.length + (before ? 2 : 0) + (select ? snippet.indexOf(select) : snippet.length);
      field.current.focus();
      field.current.setSelectionRange(start, start + (select?.length ?? 0));
    });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3 !p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-0 flex-1 basis-64">
            <span className="label">{t("Untertitel: das Vorhaben")}</span>
            <input
              className="input font-semibold"
              value={title}
              maxLength={120}
              placeholder={t("z. B. Gründung eines Malerbetriebs")}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle(p.coacheeId, title)}
            />
            <span className="mt-1 block text-xs text-muted">{t("Auf dem Deckblatt steht „BUSINESSPLAN – {name}“ und darunter dieser Untertitel.", { name: p.name })}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={p.financeHref} className="btn-ghost">{t("Finanzplan")}</Link>
            {p.share}
            <button type="button" className="btn-ghost" onClick={() => void download(p.wordHref)}>{t("Word")}</button>
            <button type="button" className="btn" onClick={() => void download(p.pdfHref)}>{t("PDF")}</button>
          </div>
        </div>
        {p.coach && (
          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line-soft pt-3">
            <p className="text-xs text-muted">
              {p.imported ? `Übernommen aus „${p.imported.name}“ am ${new Date(p.imported.at).toLocaleDateString("de-DE")}.` : "Einen fertigen Businessplan nach der Vorlage (Word) oder den Finanzplan (Excel) hier hochladen und übernehmen."}
            </p>
            <ImportFileButton coacheeId={p.coacheeId} accept=".docx,.xlsx" filled={p.filled} label="Aus Word/Excel übernehmen" />
          </div>
        )}
      </div>

      {p.ai && (
        <GesamtKi
          href={p.gesamtHref}
          initial={p.lastRun}
          beforeStart={async () => void (await save())}
          onRunning={setAiRunning}
          onUpdate={takeOver}
          onOpen={go}
        />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="card space-y-3 !p-4 lg:sticky lg:top-20">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="whitespace-nowrap font-semibold">{t("{a} von {b} Kapiteln fertig", { a: done, b: SECTIONS.length })}</span>
              <SaveBadge state={state} />
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-ok transition-all" style={{ width: `${overall}%` }} /></div>
            <p className="mt-1 text-xs text-muted">{t("Ganzer Plan zu {n} % geschrieben", { n: overall })}</p>
          </div>
          <label className="block lg:hidden">
            <span className="sr-only">{t("Kapitel")}</span>
            <select className="input" value={active} onChange={(e) => go(e.target.value)}>
              <option value={BLICK}>{t("Auf einen Blick")}</option>
              {SECTIONS.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {t(s.title)} · {progress[s.key].state === "fertig" ? "✓" : `${progress[s.key].pct} %`}{secs[s.key].conflict ? ` (${t("Konflikt")})` : ""}</option>)}
            </select>
          </label>
          <ol className="hidden space-y-0.5 lg:block">
            <li>
              <button type="button" onClick={() => go(BLICK)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${active === BLICK ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-line-soft text-[11px] font-bold text-muted">i</span>
                <span className="min-w-0 flex-1 truncate">{t("Auf einen Blick")}</span>
              </button>
            </li>
            {SECTIONS.map((s, i) => {
              const sec = secs[s.key];
              const pr = progress[s.key];
              const ok = pr.state === "fertig";
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => go(s.key)} title={t(s.title)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${s.key === active ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-ok text-white" : sec.text.trim() ? "bg-gold/20 text-gold" : "bg-line-soft text-muted"}`}>{ok ? "✓" : i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t(s.title)}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 rounded-full bg-line-soft"><span className={`block h-1 rounded-full ${ok ? "bg-ok" : "bg-gold"}`} style={{ width: `${pr.pct}%` }} /></span>
                        <span className="w-14 shrink-0 text-right text-[11px] font-normal text-muted">{ok ? t("Fertig") : pr.open ? t("{n} offen", { n: pr.open }) : `${pr.pct} %`}</span>
                      </span>
                    </span>
                    {sec.conflict && <span className="text-danger" title={t("Konflikt")}>!</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-line-soft pt-3 text-xs text-muted">{t("Fertig heißt: Umfang der Vorlage erreicht und keine offenen Angaben in eckigen Klammern mehr.")}</p>
        </aside>

        {active === BLICK ? (
          <GlanceEditor key={glance.key} coacheeId={p.coacheeId} initial={glance.items} figures={p.figures} financeHref={p.financeHref} coach={p.coach} ai={p.ai} projectNotes={p.projectNotes} schreibhilfeHref={p.schreibhilfeHref} />
        ) : (
          renderChapter()
        )}
      </div>
    </div>
  );

  // als Funktion aufgerufen, nicht als Komponente: sonst würde das Textfeld bei jeder Eingabe neu aufgebaut
  function renderChapter() {
    const def = SECTIONS.find((s) => s.key === active)!;
    const index = SECTIONS.indexOf(def);
    const sec = secs[active];
    const bausteine = p.bausteine.filter((b) => def.from.includes(b.category));
    const words = sec.text.trim() ? sec.text.trim().split(/\s+/).length : 0;
    const by = sec.updatedBy === "me" ? "dir" : sec.updatedBy ? p.names[sec.updatedBy] ?? null : null;

    return (
      <section className="card min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Kapitel {a} von {b}", { a: index + 1, b: SECTIONS.length })}</p>
            <h2 className="h2">{index + 1}. {t(def.title)}</h2>
            <p className="text-sm text-muted">{t(def.hint)}</p>
          </div>
          <div className="w-full max-w-56 space-y-1 text-right text-xs text-muted sm:w-auto">
            <p className="font-semibold text-ink">{progress[active].state === "fertig" ? t("Fertig") : progress[active].state === "leer" ? t("Noch leer") : t("Zu {n} % geschrieben", { n: progress[active].pct })}</p>
            <div className="h-1.5 rounded-full bg-line-soft"><div className={`h-1.5 rounded-full ${progress[active].state === "fertig" ? "bg-ok" : "bg-gold"}`} style={{ width: `${progress[active].pct}%` }} /></div>
            <p>{t("{n} von etwa {a} bis {b} Wörtern", { n: words, a: def.words[0], b: def.words[1] })}{progress[active].open ? ` · ${t("{n} offene Angaben", { n: progress[active].open })}` : ""}</p>
          </div>
        </div>

        <details className="rounded-xl bg-bg px-4 py-3" open={!sec.text.trim()}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">{t("Leitfragen")}</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{def.questions.map((q) => <li key={q}>{t(q)}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">{t("Umfang in der Vorlage: etwa {a} bis {b} Wörter, sachlich in der dritten Person.", { a: def.words[0], b: def.words[1] })}</p>
        </details>

        {sec.conflict && (
          <div className="space-y-3 rounded-xl border border-danger/30 bg-[#f8e6e3] p-4 text-sm" role="alert">
            <p className="font-semibold text-danger">{t("{name} hat dieses Kapitel gerade auch geändert. Welche Fassung soll gelten?", { name: sec.conflict.by ?? t("Jemand anderes") })}</p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-ink">{sec.conflict.text || t("(leer)")}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => {
                const c = sec.conflict!;
                setSecs((prev) => ({ ...prev, [active]: { ...prev[active], text: c.text, sources: c.sources, saved: snapshot(c), version: c.version, conflict: undefined, updatedBy: null } }));
              }}>{t("Diese Fassung übernehmen")}</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => {
                const c = sec.conflict!;
                setSecs((prev) => ({ ...prev, [active]: { ...prev[active], version: c.version, conflict: undefined } }));
                schedule();
              }}>{t("Meine Fassung behalten")}</button>
            </div>
          </div>
        )}

        {aiRunning && <p className="rounded-xl bg-[#fdfaf3] px-4 py-3 text-sm" role="status"><span className="animate-pulse text-gold">✦</span> Die KI passt gerade den ganzen Plan an. Danach kannst du hier weiterschreiben.</p>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict) || aiRunning} onClick={() => insert("### Zwischenüberschrift", "Zwischenüberschrift")}>{t("Zwischenüberschrift")}</button>
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict) || aiRunning} onClick={() => insert("- Erster Punkt\n- Zweiter Punkt", "Erster Punkt")}>{t("Aufzählung")}</button>
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict) || aiRunning} onClick={() => insert("| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n| | | |\n| | | |", "Spalte 1")}>{t("Tabelle")}</button>
            <span className="flex-1" />
            <button type="button" className="btn-ghost btn-sm" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? t("Bearbeiten") : t("Vorschau")}</button>
          </div>
          {preview ? (
            <div className="bp-text min-h-80 rounded-xl border border-line-soft bg-surface px-4 py-3 text-[15px] leading-relaxed">{sec.text.trim() ? <Markdown text={sec.text} /> : <p className="text-muted">{t("Noch kein Text.")}</p>}</div>
          ) : (
            <textarea
              ref={field}
              aria-label={t("Text für {titel}", { titel: t(def.title) })}
              className="input min-h-80 resize-none text-[15px] leading-relaxed"
              value={sec.text}
              disabled={Boolean(sec.conflict) || aiRunning}
              placeholder={p.coach ? `Hier entsteht das Kapitel „${def.title}“ für ${p.name}. Selbst schreiben oder oben die KI den ganzen Plan anpassen lassen.` : t("Hier schreibst du das Kapitel „{titel}“. Die Leitfragen oben helfen dir.", { titel: t(def.title) })}
              onChange={(e) => patch(active, { text: e.target.value })}
            />
          )}
          <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>{t("{n} Wörter · Absätze mit Leerzeile, Aufzählungen mit „- “, Zwischenüberschrift mit „### “, **fett**", { n: words })}</span>
            {sec.updatedAt && <span>{t(by ? "Zuletzt von {name} am {zeit}" : "Zuletzt am {zeit}", { name: by === "dir" ? t("dir") : by ?? "", zeit: new Date(sec.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}</span>}
          </p>
        </div>

        {def.key === "finanzen" && (
          <div className="rounded-xl bg-bg px-4 py-3 text-sm">
            <p className="font-semibold">{t("Kennzahlen aus dem Finanzplan")}</p>
            {p.figures ? <FiguresTable rows={p.figures} /> : <p className="text-muted">{t("Sobald der")} <Link className="link" href={p.financeHref}>{t("Finanzplan")}</Link> {t("Zahlen hat, steht hier im fertigen Plan automatisch die Tabelle mit Umsatz, Material, Rohertrag, Ergebnis und Personal.")}</p>}
          </div>
        )}

        <label className="block">
          <span className="label">{t("Quellen")}</span>
          <textarea
            className="input min-h-20 text-sm"
            rows={Math.min(8, Math.max(2, sec.sources.split("\n").length + 1))}
            value={sec.sources}
            disabled={Boolean(sec.conflict) || aiRunning}
            placeholder={t("Eine Quelle pro Zeile, z. B. Statistisches Landesamt (2025): Bestand an Wohngebäuden – https://…")}
            onChange={(e) => patch(active, { sources: e.target.value })}
          />
          <span className="mt-1 block text-xs text-muted">{t("Steht am Ende des Kapitels unter „Quellen“. Bitte nur echte, überprüfbare Quellen.")}</span>
        </label>

        {bausteine.length > 0 && (
          <details className="rounded-xl border border-line-soft" open={!sec.text.trim()}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t("Aus den Gesprächen ({n})", { n: bausteine.length })}</summary>
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {bausteine.map((b, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.title} <span className="text-xs font-normal text-muted">· {t(p.categoryLabels[b.category] ?? b.category)}</span></p>
                    {b.detail && <p className="text-muted">{b.detail}</p>}
                  </div>
                  <button type="button" className="link shrink-0 text-xs" disabled={Boolean(sec.conflict) || aiRunning} onClick={() => patch(active, { text: `${sec.text.trimEnd()}${sec.text.trim() ? "\n\n" : ""}${b.detail || b.title}` })}>{t("Einfügen")}</button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex justify-between gap-2 border-t border-line-soft pt-4">
          <button type="button" className="btn-ghost btn-sm min-w-0 truncate" onClick={() => go(index === 0 ? BLICK : SECTIONS[index - 1].key)}>← {index === 0 ? t("Auf einen Blick") : t(SECTIONS[index - 1].title)}</button>
          <button type="button" className="btn-ghost btn-sm min-w-0 truncate" disabled={index === SECTIONS.length - 1} onClick={() => go(SECTIONS[index + 1].key)}>{SECTIONS[index + 1] ? t(SECTIONS[index + 1].title) : t("Weiter")} →</button>
        </div>
      </section>
    );
  }
}

function FiguresTable({ rows }: { rows: string[][] }) {
  const t = useT();
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm tabular-nums">
        <thead><tr className="border-b border-line-soft text-left text-xs text-muted">{rows[0].map((c, i) => <th key={i} className={`py-1.5 pr-3 font-medium ${i ? "text-right" : ""}`}>{t(c)}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((r) => <tr key={r[0]} className="border-b border-line-soft last:border-0">{r.map((c, i) => <td key={i} className={`py-1.5 pr-3 ${i ? "text-right" : ""}`}>{i ? c : t(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** „Auf einen Blick“: die Steckbrief-Angaben der Vorlage, darunter die Kennzahlen aus dem Finanzplan */
function GlanceEditor({ coacheeId, initial, figures, financeHref, coach, ai, projectNotes, schreibhilfeHref }: { coacheeId: string; initial: GlanceItem[]; figures: string[][] | null; financeHref: string; coach: boolean; ai: boolean; projectNotes: string; schreibhilfeHref: string }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [proposal, setProposal] = useState<(GlanceItem & { take: boolean })[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);
  const { state, schedule } = useAutosave(async () => {
    await saveGlance(coacheeId, latest.current);
    return { ok: true };
  });
  const update = (next: GlanceItem[]) => {
    setItems(next);
    schedule();
  };
  const missing = GLANCE_PRESETS.filter((l) => !items.some((g) => g.label === l));

  async function propose() {
    setProposing(true);
    setProposeError(null);
    setProposal(null);
    try {
      const res = await fetch(schreibhilfeHref, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blick: true }) });
      const data = (await res.json().catch(() => ({}))) as { items?: GlanceItem[]; error?: string };
      if (data.items) {
        if (!data.items.length) setProposeError(t("Aus den Inhalten ergibt sich nichts Neues für diese Seite."));
        // leere Felder sind vorausgewählt, schon ausgefüllte nicht
        else setProposal(data.items.map((g) => ({ ...g, take: !items.find((x) => x.label === g.label)?.value.trim() })));
      } else setProposeError(t(data.error ?? "Das hat gerade nicht geklappt."));
    } catch {
      setProposeError(t("Keine Verbindung. Bitte gleich noch einmal versuchen."));
    } finally {
      setProposing(false);
    }
  }

  function applyProposal() {
    if (!proposal) return;
    const take = proposal.filter((g) => g.take);
    const next = items.map((x) => take.find((g) => g.label === x.label) ?? x).map(({ label, value }) => ({ label, value }));
    for (const g of take) if (!next.some((x) => x.label === g.label)) next.push({ label: g.label, value: g.value });
    update(next);
    setProposal(null);
  }

  return (
    <section className="card min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="h2">{t("Auf einen Blick")}</h2>
          <p className="text-sm text-muted">{t("Die wichtigsten Angaben in Stichworten, wie auf der zweiten Seite des Plans. Leere Felder erscheinen nicht im fertigen Plan.")}</p>
        </div>
        <SaveBadge state={state} />
      </div>
      {coach && <ProjectNotes coacheeId={coacheeId} initial={projectNotes} />}
      {ai && (
        <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fdfaf3] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><span className="text-gold">✦</span> <b>{t("Aus den Inhalten ausfüllen:")}</b> <span className="text-muted">{t("Die KI schlägt Stichworte aus Kapiteln, Finanzplan und Notizen vor. Du wählst, was übernommen wird.")}</span></p>
            <button type="button" className="btn-ghost btn-sm" disabled={proposing} onClick={() => void propose()}>{proposing ? t("Liest die Inhalte …") : t("✦ Vorschlag machen")}</button>
          </div>
          {proposeError && <p className="text-sm text-danger" role="alert">{proposeError}</p>}
          {proposal && (
            <div className="space-y-2">
              <ul className="divide-y divide-line-soft rounded-lg border border-line-soft bg-surface">
                {proposal.map((g, i) => {
                  const before = items.find((x) => x.label === g.label)?.value.trim();
                  return (
                    <li key={g.label}>
                      <label className="flex items-start gap-3 px-3 py-2.5 text-sm">
                        <input type="checkbox" className="mt-1" checked={g.take} onChange={(e) => setProposal(proposal.map((x, j) => (j === i ? { ...x, take: e.target.checked } : x)))} />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{g.label}:</span> {g.value}
                          {before && <span className="block text-xs text-muted">Bisher: {before}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" disabled={!proposal.some((g) => g.take)} onClick={applyProposal}>{t("Ausgewählte übernehmen")}</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setProposal(null)}>{t("Verwerfen")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-3">
        {items.map((g, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-line-soft bg-bg/50 p-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
            <input className="input !py-2 text-sm font-semibold" aria-label={t("Bezeichnung")} value={g.label} onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <button type="button" aria-label={t("Angabe löschen")} title={t("Löschen")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger sm:order-3" onClick={() => update(items.filter((_, j) => j !== i))}>✕</button>
            <textarea
              className="input col-span-2 !py-2 text-sm sm:order-2 sm:col-span-1"
              aria-label={g.label ? t(g.label) : t("Angabe")}
              rows={Math.min(6, Math.max(1, Math.ceil(g.value.length / 70) + g.value.split("\n").length - 1))}
              value={g.value}
              placeholder={g.label === "Startdatum" ? t("z. B. 01.02.2027") : t(g.label) !== g.label ? t(g.label) : ""}
              onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => update([...items, { label: "", value: "" }])}>+ {t("Eigene Angabe")}</button>
        {missing.map((l) => (
          <button key={l} type="button" className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => update([...items, { label: l, value: "" }])}>+ {t(l)}</button>
        ))}
      </div>
      <div className="rounded-xl bg-bg px-4 py-3 text-sm">
        <p className="font-semibold">{t("Kennzahlen aus dem Finanzplan")}</p>
        {figures ? <FiguresTable rows={figures} /> : <p className="text-muted">{t("Noch keine Zahlen. Die Tabelle entsteht aus dem")} <Link className="link" href={financeHref}>{t("Finanzplan")}</Link>.</p>}
      </div>
    </section>
  );
}

/** Notizen des Coachs zum ganzen Vorhaben: fließen in die KI für den ganzen Plan ein, Coachees sehen sie nie */
function ProjectNotes({ coacheeId, initial }: { coacheeId: string; initial: string }) {
  const t = useT();
  const [text, setText] = useState(initial);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);
  const { state, schedule } = useAutosave(async () => {
    await saveProjectNotes(coacheeId, latest.current);
    return { ok: true };
  });
  return (
    <label className="block rounded-xl bg-bg px-4 py-3">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label !mb-0">{t("Notizen zum Vorhaben (nur für dich)")}</span>
        {text !== initial && <SaveBadge state={state} />}
      </span>
      <textarea
        className="input mt-1.5 min-h-28 text-sm"
        rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
        value={text}
        maxLength={8000}
        placeholder={t("Alles, was für den ganzen Plan gilt: Ideen, Eindrücke aus den Gesprächen, Auskünfte, offene Punkte … Die KI nutzt diese Notizen für den ganzen Plan.")}
        onChange={(e) => {
          setText(e.target.value);
          schedule();
        }}
      />
    </label>
  );
}
