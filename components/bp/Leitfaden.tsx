"use client";
import { useEffect, useRef, useState } from "react";
import { termine, type LeitfadenStand } from "@/lib/bp/leitfaden";
import { SECTIONS } from "@/lib/bp/sections";

/*
 * Gesprächsleitfaden (nur Coach): fünf Termine mit den Fragen für alle Kapitel, ergänzt um die Branche.
 * Beantwortete Fragen erkennt die KI aus Protokollen und Notizen (automatisch, wenn es neue Gespräche gibt);
 * abhaken geht auch von Hand. Als PDF zum Mitnehmen ins Gespräch.
 */

const chapterNo = (key: string) => SECTIONS.findIndex((s) => s.key === key) + 1;

export function Leitfaden({ href, branche, ai }: { href: string; branche: string; ai: boolean }) {
  const [stand, setStand] = useState<LeitfadenStand | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const started = useRef(false);
  const list = termine(branche);

  async function check() {
    setChecking(true);
    setError(null);
    const res = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: true }) }).then((r) => r.json()).catch(() => ({ error: "Keine Verbindung." }))) as { stand?: LeitfadenStand; error?: string };
    setChecking(false);
    if (res.stand) setStand(res.stand);
    if (res.error) setError(res.error);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const res = (await fetch(href).then((r) => r.json()).catch(() => null)) as { stand?: LeitfadenStand; stale?: boolean } | null;
      if (!res?.stand) return;
      setStand(res.stand);
      // neue Gespräche seit dem letzten Abgleich: gleich abgleichen
      if (res.stale && ai) void check();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(id: string, done: boolean) {
    setStand((s) => (s ? { ...s, answers: done ? { ...s.answers, [id]: { answer: s.answers[id]?.answer ?? "", by: "coach", at: new Date().toISOString() } } : Object.fromEntries(Object.entries(s.answers).filter(([k]) => k !== id)) } : s));
    const res = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toggle: id, done }) }).then((r) => r.json()).catch(() => null)) as { stand?: LeitfadenStand } | null;
    if (res?.stand) setStand(res.stand);
  }

  const answers = stand?.answers ?? {};
  const total = list.reduce((n, t) => n + t.fragen.length, 0);
  const done = list.reduce((n, t) => n + t.fragen.filter((f) => answers[f.id]).length, 0);

  return (
    <details className="card !p-4" aria-label="Gesprächsleitfaden">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Gesprächsleitfaden · {done} von {total} Fragen beantwortet</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="h-1.5 w-28 rounded-full bg-line-soft"><span className="block h-1.5 rounded-full bg-ok" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
          {checking ? "gleicht ab …" : stand?.checkedAt ? `abgeglichen ${new Date(stand.checkedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">Fünf Termine, die zusammen alle Angaben für den Businessplan liefern. Was in den Gesprächsprotokollen, Notizen oder im Plan schon steht, hakt die KI selbst ab; du kannst auch von Hand abhaken.</p>
        <div className="flex flex-wrap gap-2">
          {ai && <button type="button" className="btn-ghost btn-sm" disabled={checking} onClick={() => void check()}>{checking ? "Gleicht ab …" : "✦ Mit Gesprächen abgleichen"}</button>}
          <a className="btn-ghost btn-sm" href={`${href}?pdf=1`}>Als PDF fürs Gespräch</a>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <ol className="space-y-2">
          {list.map((t) => {
            const n = t.fragen.filter((f) => answers[f.id]).length;
            const isOpen = open === t.nr;
            return (
              <li key={t.nr} className="rounded-xl border border-line-soft">
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.nr)}>
                  <span className="min-w-0">
                    <span className="font-semibold">Termin {t.nr}: {t.title}</span>
                    <span className="block text-xs text-muted">Kapitel {t.chapters.map(chapterNo).join(", ")} · mitbringen: {t.mitbringen.join(", ")}</span>
                  </span>
                  <span className={`text-xs ${n === t.fragen.length ? "text-ok" : "text-muted"}`}>{n} / {t.fragen.length}</span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-line-soft border-t border-line-soft">
                    {t.fragen.map((f) => {
                      const a = answers[f.id];
                      return (
                        <li key={f.id} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-1" checked={Boolean(a)} onChange={(e) => void toggle(f.id, e.target.checked)} aria-label={f.text} />
                          <span className="min-w-0">
                            <span className={a ? "text-muted line-through decoration-ok/40" : ""}>{f.text}</span>
                            {f.branche && <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">Branche</span>}
                            {a?.answer && <span className="block text-xs text-ok">{a.answer}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
