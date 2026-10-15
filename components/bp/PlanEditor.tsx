"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { draftSection, saveSection, saveTitle } from "@/app/actions/businessplan";
import { SECTIONS, sectionDone, type Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { SaveBadge, useAutosave, type SaveResult } from "./useAutosave";

type Baustein = { category: string; title: string; detail: string };
type Props = {
  coacheeId: string;
  coach: boolean;
  firstName: string;
  title: string;
  sections: Sections;
  names: Record<string, string>;
  bausteine: Baustein[];
  categoryLabels: Record<string, string>;
  ai: boolean;
  pdfHref: string;
  financeHref: string;
};

type Sec = { text: string; saved: string; version: number; updatedAt: string | null; updatedBy: string | null; conflict?: { text: string; version: number; by: string | null } };

export function PlanEditor(p: Props) {
  const [secs, setSecs] = useState<Record<string, Sec>>(() =>
    Object.fromEntries(SECTIONS.map((s) => {
      const v = p.sections[s.key];
      return [s.key, { text: v.text, saved: v.text, version: v.version, updatedAt: v.updated_at, updatedBy: v.updated_by }];
    })),
  );
  const [active, setActive] = useState(() => SECTIONS.find((s) => s.key !== "zusammenfassung" && !sectionDone(p.sections[s.key]))?.key ?? "idee");
  const [title, setTitle] = useState(p.title);
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const latest = useRef(secs);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    latest.current = secs;
  }, [secs]);

  // Alle geänderten Abschnitte speichern; ein Abschnitt mit Konflikt wartet auf die Entscheidung des Nutzers.
  const { state, schedule, save } = useAutosave(async (): Promise<SaveResult> => {
    for (const key of Object.keys(latest.current)) {
      const s = latest.current[key];
      if (s.text === s.saved || s.conflict) continue;
      const text = s.text;
      const res = await saveSection(p.coacheeId, key, s.version, text);
      const apply = (fn: (x: Sec) => Sec) => {
        latest.current = { ...latest.current, [key]: fn(latest.current[key]) };
        setSecs((prev) => ({ ...prev, [key]: fn(prev[key]) }));
      };
      if (res.ok) apply((x) => ({ ...x, saved: text, version: res.version, updatedAt: res.savedAt, updatedBy: "me" }));
      else if (res.conflict) apply((x) => ({ ...x, conflict: res.conflict }));
      else return { ok: false, error: res.error };
    }
    return { ok: true };
  });

  const setText = (key: string, text: string) => {
    setSecs((prev) => ({ ...prev, [key]: { ...prev[key], text } }));
    schedule();
  };

  // Textfeld wächst mit dem Inhalt
  const current = secs[active];
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(320, el.scrollHeight + 4)}px`;
  }, [current.text, active]);

  const def = SECTIONS.find((s) => s.key === active)!;
  const index = SECTIONS.indexOf(def);
  const done = SECTIONS.filter((s) => sectionDone({ text: secs[s.key].text, version: 0, updated_at: null, updated_by: null })).length;
  const bausteine = p.bausteine.filter((b) => def.from.includes(b.category));
  const words = current.text.trim() ? current.text.trim().split(/\s+/).length : 0;
  const by = current.updatedBy === "me" ? "dir" : current.updatedBy ? p.names[current.updatedBy] ?? null : null;

  async function askAi() {
    setAiError(null);
    setDrafting(active);
    const key = active;
    const res = await draftSection(p.coacheeId, key).catch(() => ({ error: "Die KI hat gerade nicht geantwortet.", text: undefined }));
    setDrafting(null);
    if (res.text) setDraft({ key, text: res.text });
    else setAiError(res.error ?? "Die KI hat gerade nicht geantwortet.");
  }

  function go(key: string) {
    setActive(key);
    setDraft(null);
    setAiError(null);
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-4 !p-4">
        <label className="min-w-0 flex-1 basis-64">
          <span className="label">Titel des Vorhabens</span>
          <input
            className="input font-semibold"
            value={title}
            maxLength={120}
            placeholder="z. B. Gebäudereinigung Schmidt für Praxen und Kanzleien"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle(p.coacheeId, title)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={p.financeHref} className="btn-ghost">Finanzplan</Link>
          <a
            href={p.pdfHref}
            className="btn"
            onClick={async (e) => {
              // erst speichern, damit das PDF den letzten Stand enthält
              e.preventDefault();
              await save();
              const a = document.createElement("a");
              a.href = p.pdfHref;
              a.click();
            }}
          >
            Businessplan als PDF
          </a>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="card space-y-3 !p-4 lg:sticky lg:top-20">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="whitespace-nowrap font-semibold">{done} von {SECTIONS.length} geschrieben</span>
              <SaveBadge state={state} />
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-ok transition-all" style={{ width: `${(done / SECTIONS.length) * 100}%` }} /></div>
          </div>
          <label className="block lg:hidden">
            <span className="sr-only">Abschnitt</span>
            <select className="input" value={active} onChange={(e) => go(e.target.value)}>
              {SECTIONS.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {s.title}{secs[s.key].conflict ? " (Konflikt)" : ""}</option>)}
            </select>
          </label>
          <ol className="hidden space-y-0.5 lg:block">
            {SECTIONS.map((s, i) => {
              const sec = secs[s.key];
              const ok = sectionDone({ text: sec.text, version: 0, updated_at: null, updated_by: null });
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => go(s.key)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${s.key === active ? "bg-tint font-semibold text-accent" : "hover:bg-bg"}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-ok text-white" : sec.text.trim() ? "bg-gold/20 text-gold" : "bg-line-soft text-muted"}`}>{ok ? "✓" : i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {sec.conflict && <span className="text-danger" title="Konflikt">!</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-line-soft pt-3 text-xs text-muted">Ein Abschnitt gilt ab etwa 300 Zeichen als geschrieben. Die Zusammenfassung am besten zum Schluss.</p>
        </aside>

        <section className="card min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Abschnitt {index + 1} von {SECTIONS.length}</p>
              <h2 className="h2">{def.title}</h2>
              <p className="text-sm text-muted">{def.hint}</p>
            </div>
            {p.ai && (
              <button type="button" className="btn-ghost btn-sm" disabled={drafting !== null || Boolean(current.conflict)} onClick={askAi}>
                {drafting === active ? "Schreibt …" : current.text.trim() ? "✦ Mit KI überarbeiten" : "✦ KI-Entwurf schreiben"}
              </button>
            )}
          </div>

          <div className="rounded-xl bg-bg px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Leitfragen</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{def.questions.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>

          {current.conflict && (
            <div className="space-y-3 rounded-xl border border-danger/30 bg-[#f8e6e3] p-4 text-sm" role="alert">
              <p className="font-semibold text-danger">{current.conflict.by ?? "Jemand anderes"} hat diesen Abschnitt gerade auch geändert. Welche Fassung soll gelten?</p>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-ink">{current.conflict.text || "(leer)"}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" onClick={() => {
                  const c = current.conflict!;
                  setSecs((prev) => ({ ...prev, [active]: { ...prev[active], text: c.text, saved: c.text, version: c.version, conflict: undefined, updatedBy: null } }));
                }}>Diese Fassung übernehmen</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => {
                  const c = current.conflict!;
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
              <div className="text-[15px]"><Markdown text={draft.text} /></div>
              <p className="text-xs text-muted">Stellen in [eckigen Klammern] fehlen noch. Bitte mit echten Angaben ersetzen.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" onClick={() => { setText(active, draft.text); setDraft(null); }}>Übernehmen</button>
                {current.text.trim() && <button type="button" className="btn-ghost btn-sm" onClick={() => { setText(active, `${current.text.trimEnd()}\n\n${draft.text}`); setDraft(null); }}>Unten anfügen</button>}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)}>Verwerfen</button>
              </div>
            </div>
          )}

          <div>
            <textarea
              ref={field}
              aria-label={`Text für ${def.title}`}
              className="input min-h-80 resize-none text-[15px] leading-relaxed"
              value={current.text}
              disabled={Boolean(current.conflict)}
              placeholder={p.coach ? `Hier entsteht der Abschnitt „${def.title}“ für ${p.firstName}. Schreib selbst oder lass die KI aus den Gesprächsbausteinen einen Entwurf machen.` : `Hier schreibst du den Abschnitt „${def.title}“. Die Leitfragen oben helfen dir.`}
              onChange={(e) => setText(active, e.target.value)}
            />
            <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>{words} Wörter · Absätze mit Leerzeile, Aufzählungen mit „- “, **fett**</span>
              {current.updatedAt && <span>Zuletzt {by ? `von ${by} ` : ""}am {new Date(current.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
            </p>
          </div>

          {bausteine.length > 0 && (
            <details className="rounded-xl border border-line-soft" open={!current.text.trim()}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Aus den Gesprächen ({bausteine.length})</summary>
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {bausteine.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.title} <span className="text-xs font-normal text-muted">· {p.categoryLabels[b.category] ?? b.category}</span></p>
                      {b.detail && <p className="text-muted">{b.detail}</p>}
                    </div>
                    <button type="button" className="link shrink-0 text-xs" disabled={Boolean(current.conflict)} onClick={() => setText(active, `${current.text.trimEnd()}${current.text.trim() ? "\n\n" : ""}${b.detail || b.title}`)}>Einfügen</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex justify-between gap-2 border-t border-line-soft pt-4">
            <button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => go(SECTIONS[index - 1].key)}>← {SECTIONS[index - 1]?.title ?? "Zurück"}</button>
            <button type="button" className="btn-ghost btn-sm" disabled={index === SECTIONS.length - 1} onClick={() => go(SECTIONS[index + 1].key)}>{SECTIONS[index + 1]?.title ?? "Weiter"} →</button>
          </div>
        </section>
      </div>
    </div>
  );
}
