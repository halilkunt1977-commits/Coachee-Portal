"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { draftSection, saveGlance, saveSection, saveTitle } from "@/app/actions/businessplan";
import { GLANCE_PRESETS, SECTIONS, sectionDone, type GlanceItem, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { ImportFileButton } from "./ImportButtons";
import { SaveBadge, useAutosave, type SaveResult } from "./useAutosave";

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
};

type Sec = { text: string; sources: string; saved: string; version: number; updatedAt: string | null; updatedBy: string | null; conflict?: { text: string; sources: string; version: number; by: string | null } };
const snapshot = (s: { text: string; sources: string }) => `${s.text}\u0000${s.sources}`;
const BLICK = "blick";

export function PlanEditor(p: Props) {
  const [secs, setSecs] = useState<Record<string, Sec>>(() =>
    Object.fromEntries(SECTIONS.map((s) => {
      const v = p.sections[s.key];
      return [s.key, { text: v.text, sources: v.sources, saved: snapshot(v), version: v.version, updatedAt: v.updated_at, updatedBy: v.updated_by }];
    })),
  );
  const [active, setActive] = useState(() => (p.glance.every((g) => !g.value.trim() || g.label === "Gründer" || g.label === "Firmenname") ? BLICK : SECTIONS.find((s) => s.key !== "summary" && !sectionDone(p.sections[s.key]))?.key ?? "idee"));
  const [title, setTitle] = useState(p.title);
  const [draft, setDraft] = useState<{ key: string; text: string; sources: string } | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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

  const done = SECTIONS.filter((s) => sectionDone(secs[s.key])).length;

  async function download(href: string) {
    // erst speichern, damit die Datei den letzten Stand enthält
    await save();
    const a = document.createElement("a");
    a.href = href;
    a.click();
  }

  function go(key: string) {
    setActive(key);
    setDraft(null);
    setAiError(null);
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
            <span className="label">Untertitel: das Vorhaben</span>
            <input
              className="input font-semibold"
              value={title}
              maxLength={120}
              placeholder="z. B. Gründung eines Malerbetriebs"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle(p.coacheeId, title)}
            />
            <span className="mt-1 block text-xs text-muted">Auf dem Deckblatt steht „BUSINESSPLAN – {p.name}“ und darunter dieser Untertitel.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={p.financeHref} className="btn-ghost">Finanzplan</Link>
            {p.share}
            <button type="button" className="btn-ghost" onClick={() => void download(p.wordHref)}>Word</button>
            <button type="button" className="btn" onClick={() => void download(p.pdfHref)}>PDF</button>
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

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="card space-y-3 !p-4 lg:sticky lg:top-20">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="whitespace-nowrap font-semibold">{done} von {SECTIONS.length} Kapiteln</span>
              <SaveBadge state={state} />
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-ok transition-all" style={{ width: `${(done / SECTIONS.length) * 100}%` }} /></div>
          </div>
          <label className="block lg:hidden">
            <span className="sr-only">Kapitel</span>
            <select className="input" value={active} onChange={(e) => go(e.target.value)}>
              <option value={BLICK}>Auf einen Blick</option>
              {SECTIONS.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {s.title}{secs[s.key].conflict ? " (Konflikt)" : ""}</option>)}
            </select>
          </label>
          <ol className="hidden space-y-0.5 lg:block">
            <li>
              <button type="button" onClick={() => go(BLICK)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${active === BLICK ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-line-soft text-[11px] font-bold text-muted">i</span>
                <span className="min-w-0 flex-1 truncate">Auf einen Blick</span>
              </button>
            </li>
            {SECTIONS.map((s, i) => {
              const sec = secs[s.key];
              const ok = sectionDone(sec);
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => go(s.key)} title={s.title} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${s.key === active ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-ok text-white" : sec.text.trim() ? "bg-gold/20 text-gold" : "bg-line-soft text-muted"}`}>{ok ? "✓" : i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {sec.conflict && <span className="text-danger" title="Konflikt">!</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-line-soft pt-3 text-xs text-muted">Ein Kapitel gilt ab etwa 300 Zeichen als geschrieben. Die Executive Summary am besten zum Schluss.</p>
        </aside>

        {active === BLICK ? (
          <GlanceEditor coacheeId={p.coacheeId} initial={p.glance} figures={p.figures} financeHref={p.financeHref} />
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

    async function askAi() {
      setAiError(null);
      setDrafting(active);
      const key = active;
      const res = await draftSection(p.coacheeId, key).catch(() => ({ error: "Das hat gerade nicht geklappt.", text: undefined, sources: undefined }));
      setDrafting(null);
      if (res.text) setDraft({ key, text: res.text, sources: res.sources ?? "" });
      else setAiError(res.error ?? "Das hat gerade nicht geklappt.");
    }

    return (
      <section className="card min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kapitel {index + 1} von {SECTIONS.length}</p>
            <h2 className="h2">{index + 1}. {def.title}</h2>
            <p className="text-sm text-muted">{def.hint}</p>
          </div>
          {p.ai && (
            <button type="button" className="btn-ghost btn-sm" disabled={drafting !== null || Boolean(sec.conflict)} onClick={askAi}>
              {drafting === active ? "Schreibt …" : sec.text.trim() ? "✦ Mit KI überarbeiten" : "✦ KI-Entwurf schreiben"}
            </button>
          )}
        </div>

        <details className="rounded-xl bg-bg px-4 py-3" open={!sec.text.trim()}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Leitfragen</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{def.questions.map((q) => <li key={q}>{q}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">Umfang in der Vorlage: etwa {def.words[0]} bis {def.words[1]} Wörter, sachlich in der dritten Person.</p>
        </details>

        {sec.conflict && (
          <div className="space-y-3 rounded-xl border border-danger/30 bg-[#f8e6e3] p-4 text-sm" role="alert">
            <p className="font-semibold text-danger">{sec.conflict.by ?? "Jemand anderes"} hat dieses Kapitel gerade auch geändert. Welche Fassung soll gelten?</p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-ink">{sec.conflict.text || "(leer)"}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => {
                const c = sec.conflict!;
                setSecs((prev) => ({ ...prev, [active]: { ...prev[active], text: c.text, sources: c.sources, saved: snapshot(c), version: c.version, conflict: undefined, updatedBy: null } }));
              }}>Diese Fassung übernehmen</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => {
                const c = sec.conflict!;
                setSecs((prev) => ({ ...prev, [active]: { ...prev[active], version: c.version, conflict: undefined } }));
                schedule();
              }}>Meine Fassung behalten</button>
            </div>
          </div>
        )}

        {aiError && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{aiError}</p>}
        {draft?.key === active && (
          <div className="space-y-3 rounded-xl border border-gold/40 bg-[#fbf6ec] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold">✦ Vorschlag der KI, bitte prüfen</p>
            <div className="bp-text text-[15px]"><Markdown text={draft.text} /></div>
            {draft.sources && <div className="text-xs text-muted"><b>Quellen:</b> {draft.sources.split("\n").join(" · ")}</div>}
            <p className="text-xs text-muted">Stellen in [eckigen Klammern] fehlen noch. Bitte mit echten Angaben ersetzen und Quellen prüfen.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => { patch(active, { text: draft.text, sources: draft.sources || sec.sources }); setDraft(null); }}>Übernehmen</button>
              {sec.text.trim() && <button type="button" className="btn-ghost btn-sm" onClick={() => { patch(active, { text: `${sec.text.trimEnd()}\n\n${draft.text}`, sources: [sec.sources.trim(), draft.sources].filter(Boolean).join("\n") }); setDraft(null); }}>Unten anfügen</button>}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)}>Verwerfen</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict)} onClick={() => insert("### Zwischenüberschrift", "Zwischenüberschrift")}>Zwischenüberschrift</button>
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict)} onClick={() => insert("- Erster Punkt\n- Zweiter Punkt", "Erster Punkt")}>Aufzählung</button>
            <button type="button" className="btn-ghost btn-sm" disabled={preview || Boolean(sec.conflict)} onClick={() => insert("| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n| | | |\n| | | |", "Spalte 1")}>Tabelle</button>
            <span className="flex-1" />
            <button type="button" className="btn-ghost btn-sm" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Bearbeiten" : "Vorschau"}</button>
          </div>
          {preview ? (
            <div className="bp-text min-h-80 rounded-xl border border-line-soft bg-surface px-4 py-3 text-[15px] leading-relaxed">{sec.text.trim() ? <Markdown text={sec.text} /> : <p className="text-muted">Noch kein Text.</p>}</div>
          ) : (
            <textarea
              ref={field}
              aria-label={`Text für ${def.title}`}
              className="input min-h-80 resize-none text-[15px] leading-relaxed"
              value={sec.text}
              disabled={Boolean(sec.conflict)}
              placeholder={p.coach ? `Hier entsteht das Kapitel „${def.title}“ für ${p.name}. Selbst schreiben oder einen Entwurf aus den Gesprächsbausteinen machen lassen.` : `Hier schreibst du das Kapitel „${def.title}“. Die Leitfragen oben helfen dir.`}
              onChange={(e) => patch(active, { text: e.target.value })}
            />
          )}
          <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>{words} Wörter · Absätze mit Leerzeile, Aufzählungen mit „- “, Zwischenüberschrift mit „### “, **fett**</span>
            {sec.updatedAt && <span>Zuletzt {by ? `von ${by} ` : ""}am {new Date(sec.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
        </div>

        {def.key === "finanzen" && (
          <div className="rounded-xl bg-bg px-4 py-3 text-sm">
            <p className="font-semibold">Kennzahlen aus dem Finanzplan</p>
            {p.figures ? <FiguresTable rows={p.figures} /> : <p className="text-muted">Sobald der <Link className="link" href={p.financeHref}>Finanzplan</Link> Zahlen hat, steht hier im fertigen Plan automatisch die Tabelle mit Umsatz, Material, Rohertrag, Ergebnis und Personal.</p>}
          </div>
        )}

        <label className="block">
          <span className="label">Quellen</span>
          <textarea
            className="input min-h-20 text-sm"
            rows={Math.min(8, Math.max(2, sec.sources.split("\n").length + 1))}
            value={sec.sources}
            disabled={Boolean(sec.conflict)}
            placeholder="Eine Quelle pro Zeile, z. B. Statistisches Landesamt (2025): Bestand an Wohngebäuden – https://…"
            onChange={(e) => patch(active, { sources: e.target.value })}
          />
          <span className="mt-1 block text-xs text-muted">Steht am Ende des Kapitels unter „Quellen“. Bitte nur echte, überprüfbare Quellen.</span>
        </label>

        {bausteine.length > 0 && (
          <details className="rounded-xl border border-line-soft" open={!sec.text.trim()}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Aus den Gesprächen ({bausteine.length})</summary>
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {bausteine.map((b, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.title} <span className="text-xs font-normal text-muted">· {p.categoryLabels[b.category] ?? b.category}</span></p>
                    {b.detail && <p className="text-muted">{b.detail}</p>}
                  </div>
                  <button type="button" className="link shrink-0 text-xs" disabled={Boolean(sec.conflict)} onClick={() => patch(active, { text: `${sec.text.trimEnd()}${sec.text.trim() ? "\n\n" : ""}${b.detail || b.title}` })}>Einfügen</button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex justify-between gap-2 border-t border-line-soft pt-4">
          <button type="button" className="btn-ghost btn-sm min-w-0 truncate" onClick={() => go(index === 0 ? BLICK : SECTIONS[index - 1].key)}>← {index === 0 ? "Auf einen Blick" : SECTIONS[index - 1].title}</button>
          <button type="button" className="btn-ghost btn-sm min-w-0 truncate" disabled={index === SECTIONS.length - 1} onClick={() => go(SECTIONS[index + 1].key)}>{SECTIONS[index + 1]?.title ?? "Weiter"} →</button>
        </div>
      </section>
    );
  }
}

function FiguresTable({ rows }: { rows: string[][] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm tabular-nums">
        <thead><tr className="border-b border-line-soft text-left text-xs text-muted">{rows[0].map((c, i) => <th key={i} className={`py-1.5 pr-3 font-medium ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((r) => <tr key={r[0]} className="border-b border-line-soft last:border-0">{r.map((c, i) => <td key={i} className={`py-1.5 pr-3 ${i ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** „Auf einen Blick“: die Steckbrief-Angaben der Vorlage, darunter die Kennzahlen aus dem Finanzplan */
function GlanceEditor({ coacheeId, initial, figures, financeHref }: { coacheeId: string; initial: GlanceItem[]; figures: string[][] | null; financeHref: string }) {
  const [items, setItems] = useState(initial);
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
  return (
    <section className="card min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="h2">Auf einen Blick</h2>
          <p className="text-sm text-muted">Die wichtigsten Angaben in Stichworten, wie auf der zweiten Seite des Plans. Leere Felder erscheinen nicht im fertigen Plan.</p>
        </div>
        <SaveBadge state={state} />
      </div>
      <div className="space-y-3">
        {items.map((g, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-line-soft bg-bg/50 p-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
            <input className="input !py-2 text-sm font-semibold" aria-label="Bezeichnung" value={g.label} onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <button type="button" aria-label="Angabe löschen" title="Löschen" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger sm:order-3" onClick={() => update(items.filter((_, j) => j !== i))}>✕</button>
            <textarea
              className="input col-span-2 !py-2 text-sm sm:order-2 sm:col-span-1"
              aria-label={g.label || "Angabe"}
              rows={Math.min(6, Math.max(1, Math.ceil(g.value.length / 70) + g.value.split("\n").length - 1))}
              value={g.value}
              placeholder={g.label === "Startdatum" ? "z. B. 01.02.2027" : ""}
              onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => update([...items, { label: "", value: "" }])}>+ Eigene Angabe</button>
        {missing.map((l) => (
          <button key={l} type="button" className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={() => update([...items, { label: l, value: "" }])}>+ {l}</button>
        ))}
      </div>
      <div className="rounded-xl bg-bg px-4 py-3 text-sm">
        <p className="font-semibold">Kennzahlen aus dem Finanzplan</p>
        {figures ? <FiguresTable rows={figures} /> : <p className="text-muted">Noch keine Zahlen. Die Tabelle entsteht aus dem <Link className="link" href={financeHref}>Finanzplan</Link>.</p>}
      </div>
    </section>
  );
}
