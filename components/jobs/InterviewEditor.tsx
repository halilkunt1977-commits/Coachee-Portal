"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteInterview, generateInterview, saveInterview } from "@/app/actions/gespraechsvorbereitung";
import { LIST_SECTIONS, emptyInterview, type Interview, type ListKey } from "@/lib/jobs/interview-shared";

/*
 * Gesprächsvorbereitung einer Stelle bearbeiten, nur für den Coach. Listen werden als Text mit einem Eintrag je Zeile bearbeitet
 * und erst beim Speichern zerlegt, damit beim Tippen nichts verspringt.
 */
type Props = {
  coacheeId: string;
  firstName: string;
  app: { id: string; title: string; meta: string; hasAd: boolean };
  initial: Interview | null;
  updatedAt: string | null;
  seenAt: string | null;
  ai: boolean;
};

type DraftQuestion = { key: number; question: string; answer: string; tips: string; followups: string };
type Draft = { focus: string; coach: string; questions: DraftQuestion[]; lists: Record<ListKey, string> };

let nextKey = 1;
const toDraft = (i: Interview): Draft => ({
  focus: i.focus,
  coach: i.coach,
  questions: i.questions.map((q) => ({ key: nextKey++, question: q.question, answer: q.answer, tips: q.tips, followups: q.followups.join("\n") })),
  lists: Object.fromEntries(LIST_SECTIONS.map((s) => [s.key, i[s.key].join("\n")])) as Record<ListKey, string>,
});
const lines = (t: string) => t.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
const fromDraft = (d: Draft): Interview => ({
  ...emptyInterview(),
  focus: d.focus,
  coach: d.coach,
  questions: d.questions.map((q) => ({ question: q.question, answer: q.answer, tips: q.tips, followups: lines(q.followups) })),
  ...(Object.fromEntries(LIST_SECTIONS.map((s) => [s.key, lines(d.lists[s.key])])) as Record<ListKey, string[]>),
});
const time = (d: string) => new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function InterviewEditor({ coacheeId, firstName, app, initial, updatedAt, seenAt, ai }: Props) {
  const anchor = `vorbereitung-${app.id}`;
  const [draft, setDraft] = useState<Draft | null>(() => (initial ? toDraft(initial) : null));
  const [saved, setSaved] = useState(updatedAt);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"neu" | "loeschen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"erstellen" | "speichern" | "loeschen" | null>(null);

  // Aus der Vorschau zurück („Bearbeiten“): diese Stelle aufgeklappt zeigen
  useEffect(() => {
    const el = document.getElementById(anchor) as HTMLDetailsElement | null;
    if (el && window.location.hash === `#${anchor}`) {
      el.open = true;
      el.scrollIntoView({ block: "start" });
    }
  }, [anchor]);

  const change = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const setQ = (key: number, patch: Partial<DraftQuestion>) => change((d) => ({ ...d, questions: d.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) }));

  const run = (what: "erstellen" | "speichern" | "loeschen") =>
    start(async () => {
      setError(null);
      setBusy(what);
      const r = await (what === "erstellen"
        ? generateInterview(coacheeId, app.id)
        : what === "speichern"
          ? saveInterview(coacheeId, app.id, fromDraft(draft!))
          : deleteInterview(coacheeId, app.id)
      ).catch(() => ({ ok: false as const, error: "Das hat gerade nicht geklappt. Bitte noch einmal versuchen." }));
      setBusy(null);
      setConfirm(null);
      if (!r.ok) return setError(r.error);
      setDraft(r.interview ? toDraft(r.interview) : null);
      setSaved(r.savedAt);
      setDirty(false);
    });

  const badge = !draft
    ? <span className="text-xs text-muted">noch nicht vorbereitet</span>
    : <span className="rounded-full bg-[#e3f1e7] px-2.5 py-0.5 text-xs font-semibold text-[#2f6b45]">{seenAt ? `von ${firstName} gelesen` : "vorbereitet"}</span>;

  return (
    <details id={anchor} className="card scroll-mt-24 space-y-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{app.title}</span>
          <span className="block text-sm text-muted">{app.meta}</span>
        </span>
        {dirty ? <span className="text-xs font-semibold text-gold">nicht gespeichert</span> : badge}
      </summary>

      {error && <p className="rounded-xl bg-[#f8e6e3] px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}

      {!draft ? (
        <div className="space-y-3 border-t border-line-soft pt-3 text-sm">
          <p className="text-muted">
            Fragen des Arbeitgebers mit ehrlichem Antwortvorschlag aus Lebenslauf und Kompetenzprofil, mögliche Nachfragen, Auftreten und Fragen an den Arbeitgeber.
            {app.hasAd ? "" : " Mit dem Stellentext (unter Stellenanalyse einfügen) wird die Vorbereitung genauer."}
          </p>
          <div className="flex flex-wrap gap-2">
            {ai && (
              <button type="button" className="btn btn-sm tap" disabled={pending} onClick={() => run("erstellen")}>
                {busy === "erstellen" ? "Wird erstellt … (bis zu einer Minute)" : "Vorbereitung mit KI erstellen"}
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm tap" disabled={pending} onClick={() => { setDraft(toDraft(emptyInterview())); setDirty(true); }}>
              Selbst schreiben
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 border-t border-line-soft pt-4 text-sm">
          <label className="block rounded-xl bg-tint/50 p-3">
            <span className="label">Meine Empfehlungen für {firstName}</span>
            <span className="mb-1.5 block text-xs text-muted">Steht für {firstName} ganz oben. Geht nicht an die KI und bleibt beim Neu-Erstellen erhalten.</span>
            <textarea className="input min-h-24 field-sizing-content" maxLength={8000} value={draft.coach} placeholder="z. B. Sprich ruhig über die Pause 2023, du hast in der Zeit …" onChange={(e) => change((d) => ({ ...d, coach: e.target.value }))} />
          </label>

          <label className="block">
            <span className="label">Worauf es ankommt</span>
            <textarea className="input min-h-20 field-sizing-content" maxLength={2000} value={draft.focus} onChange={(e) => change((d) => ({ ...d, focus: e.target.value }))} />
          </label>

          <div className="space-y-3">
            <p className="label !mb-0">Fragen des Arbeitgebers ({draft.questions.length})</p>
            {draft.questions.map((q, n) => (
              <fieldset key={q.key} className="space-y-2 rounded-xl border border-line-soft p-3">
                <div className="flex items-start gap-2">
                  <span className="pt-2.5 font-semibold text-accent tabular-nums">{n + 1}.</span>
                  <label className="block min-w-0 flex-1">
                    <span className="sr-only">Frage {n + 1}</span>
                    <input className="input !py-2 font-semibold" maxLength={500} value={q.question} placeholder="Frage des Arbeitgebers" onChange={(e) => setQ(q.key, { question: e.target.value })} />
                  </label>
                  <button type="button" className="tap shrink-0 px-2 pt-2 text-xs text-muted hover:text-danger" onClick={() => change((d) => ({ ...d, questions: d.questions.filter((x) => x.key !== q.key) }))}>
                    Entfernen
                  </button>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Antwortvorschlag (Ich-Form)</span>
                  <textarea className="input min-h-20 field-sizing-content" maxLength={3000} value={q.answer} onChange={(e) => setQ(q.key, { answer: e.target.value })} />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Tipp, worauf achten</span>
                    <textarea className="input min-h-16 field-sizing-content" maxLength={1500} value={q.tips} onChange={(e) => setQ(q.key, { tips: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Mögliche Nachfragen (eine je Zeile)</span>
                    <textarea className="input min-h-16 field-sizing-content" value={q.followups} onChange={(e) => setQ(q.key, { followups: e.target.value })} />
                  </label>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn-ghost btn-sm tap"
              onClick={() => change((d) => ({ ...d, questions: [...d.questions, { key: nextKey++, question: "", answer: "", tips: "", followups: "" }] }))}
            >
              + Frage hinzufügen
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {LIST_SECTIONS.map((s) => (
              <label key={s.key} className="block">
                <span className="label !mb-0.5">{s.title}</span>
                <span className="mb-1.5 block text-xs text-muted">{s.hint}, ein Punkt je Zeile</span>
                <textarea className="input min-h-28 field-sizing-content" value={draft.lists[s.key]} onChange={(e) => change((d) => ({ ...d, lists: { ...d.lists, [s.key]: e.target.value } }))} />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            <button type="button" className="btn btn-sm tap" disabled={pending} onClick={() => run("speichern")}>
              {busy === "speichern" ? "Wird gespeichert …" : "Speichern"}
            </button>
            {saved && !dirty && <Link href={`/coach/coachees/${coacheeId}/vorbereitung/${app.id}`} className="btn-ghost btn-sm tap">So sieht {firstName} es · Drucken</Link>}
            <span className="text-xs text-muted">{dirty ? "Änderungen noch nicht gespeichert" : saved ? `Gespeichert am ${time(saved)}` : ""}</span>
            <span className="ml-auto flex flex-wrap gap-2">
              {confirm ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs">{confirm === "neu" ? "Alles außer deinen Empfehlungen wird ersetzt." : "Vorbereitung ganz löschen?"}</span>
                  <button type="button" className="btn btn-sm tap !bg-danger" disabled={pending} onClick={() => run(confirm === "neu" ? "erstellen" : "loeschen")}>
                    {busy === "erstellen" ? "Wird erstellt …" : busy === "loeschen" ? "Wird gelöscht …" : confirm === "neu" ? "Ja, neu erstellen" : "Ja, löschen"}
                  </button>
                  <button type="button" className="btn-ghost btn-sm tap" onClick={() => setConfirm(null)}>Nein</button>
                </span>
              ) : (
                <>
                  {ai && <button type="button" className="btn-ghost btn-sm tap" disabled={pending} onClick={() => setConfirm("neu")}>Neu erstellen</button>}
                  <button type="button" className="btn-ghost btn-sm tap hover:!text-danger" disabled={pending} onClick={() => (saved ? setConfirm("loeschen") : (setDraft(null), setDirty(false)))}>
                    {saved ? "Löschen" : "Verwerfen"}
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </details>
  );
}
