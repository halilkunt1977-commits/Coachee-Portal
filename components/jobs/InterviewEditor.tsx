"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { aiEditInterview, deleteInterview, generateInterview, saveInterview, type InterviewBrief } from "@/app/actions/gespraechsvorbereitung";
import { LIST_SECTIONS, emptyInterview, type Interview, type InterviewAiTask, type ListKey } from "@/lib/jobs/interview-shared";
import { ShareButton } from "../teilen/ShareButton";

/*
 * Gesprächsvorbereitung einer Stelle bearbeiten, nur für den Coach: Stelle und Gespräch beschreiben („Zur Stelle“),
 * mit KI erstellen und überarbeiten, selbst nachbessern, dann dem Coachee schicken. Listen werden als Text mit einem
 * Eintrag je Zeile bearbeitet und erst beim Speichern zerlegt, damit beim Tippen nichts verspringt.
 * Was die KI liefert, landet als ungespeicherte Änderung im Editor; der Coach prüft, nimmt zurück oder speichert.
 */
type Props = {
  coacheeId: string;
  firstName: string;
  app: { id: string; title: string; meta: string };
  brief: InterviewBrief;
  initial: Interview | null;
  updatedAt: string | null;
  seenAt: string | null;
  /** Zuletzt geschickt, und ob die gespeicherte Fassung seitdem anders ist */
  sent: { at: string; changed: boolean } | null;
  ai: boolean;
};

type DraftQuestion = { key: number; question: string; answer: string; tips: string; followups: string };
type Draft = { focus: string; coach: string; questions: DraftQuestion[]; lists: Record<ListKey, string> };
type Busy = "erstellen" | "speichern" | "loeschen" | "revise" | "more" | `q${number}`;

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
const FAILED = { ok: false as const, error: "Das hat gerade nicht geklappt. Bitte noch einmal versuchen." };

export function InterviewEditor({ coacheeId, firstName, app, brief: initialBrief, initial, updatedAt, seenAt, sent: initialSent, ai }: Props) {
  const anchor = `vorbereitung-${app.id}`;
  const [draft, setDraft] = useState<Draft | null>(() => (initial ? toDraft(initial) : null));
  const [brief, setBrief] = useState(initialBrief);
  const [briefOpen, setBriefOpen] = useState(!initial);
  const [saved, setSaved] = useState(updatedAt);
  const [sent, setSent] = useState(initialSent);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"neu" | "loeschen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Busy | null>(null);
  // KI-Werkzeug: Anweisung für die ganze Fassung bzw. für eine einzelne Frage
  const [instruction, setInstruction] = useState("");
  const [askFor, setAskFor] = useState<{ key: number; text: string } | null>(null);
  // Vor dem letzten KI-Schritt, für „Rückgängig“
  const [undo, setUndo] = useState<{ draft: Draft; label: string } | null>(null);

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
  const editBrief = (patch: Partial<InterviewBrief>) => {
    setBrief((b) => ({ ...b, ...patch }));
    setDirty(true);
  };

  const run = (what: "erstellen" | "speichern" | "loeschen") =>
    start(async () => {
      setError(null);
      setBusy(what);
      const r = await (what === "erstellen"
        ? generateInterview(coacheeId, app.id, brief)
        : what === "speichern"
          ? saveInterview(coacheeId, app.id, fromDraft(draft!), brief)
          : deleteInterview(coacheeId, app.id)
      ).catch(() => FAILED);
      setBusy(null);
      setConfirm(null);
      if (!r.ok) return setError(r.error);
      setDraft(r.interview ? toDraft(r.interview) : null);
      setSaved(r.savedAt);
      setDirty(false);
      setUndo(null);
      if (what === "loeschen") setSent(null);
      else if (sent) setSent({ ...sent, changed: true });
    });

  /** KI-Schritt auf der Fassung im Editor; das Ergebnis ist eine ungespeicherte Änderung */
  const aiStep = (task: InterviewAiTask, label: string, key: Busy) =>
    start(async () => {
      if (!draft) return;
      setError(null);
      setBusy(key);
      const before = draft;
      const r = await aiEditInterview(coacheeId, app.id, fromDraft(draft), task, brief).catch(() => FAILED);
      setBusy(null);
      if (!r.ok) return setError(r.error);
      // Unveränderte Fragen behalten ihren Schlüssel, damit offene Felder nicht springen
      const next = toDraft(r.interview);
      next.questions = next.questions.map((q, n) => (before.questions[n] && before.questions[n].question === q.question ? { ...q, key: before.questions[n].key } : q));
      setDraft(next);
      setDirty(true);
      setUndo({ draft: before, label });
      setAskFor(null);
      if (task.mode !== "question") setInstruction("");
    });

  const badge = !draft
    ? <span className="text-xs text-muted">noch nicht vorbereitet</span>
    : sent
      ? <span className="rounded-full bg-[#efe7f8] px-2.5 py-0.5 text-xs font-semibold text-[#6b3fa0]">{seenAt ? `von ${firstName} gelesen` : `an ${firstName} geschickt`}</span>
      : <span className="rounded-full bg-[#e3f1e7] px-2.5 py-0.5 text-xs font-semibold text-[#2f6b45]">{seenAt ? `von ${firstName} gelesen` : "vorbereitet"}</span>;

  const working = pending || busy !== null;

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

      <div className="space-y-5 border-t border-line-soft pt-4 text-sm">
        {/* Zur Stelle: nur für den Coach, Grundlage für die KI */}
        <div className="rounded-xl border border-line-soft">
          <button type="button" aria-expanded={briefOpen} className="tap flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setBriefOpen(!briefOpen)}>
            <span className="min-w-0">
              <span className="block font-semibold">Zur Stelle <span className="font-normal text-muted">(nur für dich)</span></span>
              <span className="block text-xs text-muted">
                {brief.jobText.trim() || brief.brief.trim()
                  ? [brief.jobText.trim() && "Stellentext", brief.brief.trim() && "deine Hinweise"].filter(Boolean).join(" und ") + " hinterlegt"
                  : "Stelle und Gespräch genauer beschreiben, dann passen Fragen und Antworten besser"}
              </span>
            </span>
            <span aria-hidden className="text-muted">{briefOpen ? "▴" : "▾"}</span>
          </button>
          {briefOpen && (
            <div className="grid gap-3 border-t border-line-soft p-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="label !mb-0.5">Stellenanzeige</span>
                <span className="mb-1.5 block text-xs text-muted">Aufgaben, Anforderungen, Angebot. Derselbe Text wie in der Stellenanalyse.</span>
                <textarea className="input min-h-28 field-sizing-content" maxLength={20000} value={brief.jobText} placeholder="Anzeige hier einfügen …" onChange={(e) => editBrief({ jobText: e.target.value })} />
              </label>
              <label className="block min-w-0">
                <span className="label !mb-0.5">Was du über Stelle und Gespräch weißt</span>
                <span className="mb-1.5 block text-xs text-muted">z. B. Gesprächspartner, Ablauf, Schwerpunkte, Betrieb, worauf es dem Chef ankommt. Keine Gesundheitsangaben.</span>
                <textarea
                  className="input min-h-28 field-sizing-content"
                  maxLength={6000}
                  value={brief.brief}
                  placeholder="z. B. Gespräch mit dem Lagerleiter, 30 Minuten, danach Probearbeit. Wichtig sind Staplerschein und Schichtbereitschaft."
                  onChange={(e) => editBrief({ brief: e.target.value })}
                />
              </label>
            </div>
          )}
        </div>

        {!draft ? (
          <div className="space-y-3">
            <p className="text-muted">Fragen des Arbeitgebers mit ehrlichem Antwortvorschlag aus Lebenslauf und Kompetenzprofil, mögliche Nachfragen, Auftreten und Fragen an den Arbeitgeber.</p>
            <div className="flex flex-wrap gap-2">
              {ai && (
                <button type="button" className="btn btn-sm tap" disabled={working} onClick={() => run("erstellen")}>
                  {busy === "erstellen" ? "Wird erstellt … (bis zu einer Minute)" : "Vorbereitung mit KI erstellen"}
                </button>
              )}
              <button type="button" className="btn-ghost btn-sm tap" disabled={working} onClick={() => { setDraft(toDraft(emptyInterview())); setDirty(true); }}>
                Selbst schreiben
              </button>
            </div>
          </div>
        ) : (
          <>
            {ai && (
              <div className="space-y-2 rounded-xl bg-tint/50 p-3">
                <label className="block">
                  <span className="label !mb-0.5">✦ Mit KI bearbeiten</span>
                  <span className="mb-1.5 block text-xs text-muted">Schreib, was anders werden soll. Das Ergebnis prüfst du und speicherst es selbst. Deine Empfehlungen gehen nicht an die KI.</span>
                  <textarea
                    className="input min-h-16 field-sizing-content"
                    maxLength={2000}
                    value={instruction}
                    placeholder="z. B. Antworten kürzer und einfacher. Mehr zur Schichtarbeit. Fragen zum Staplerschein ergänzen."
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm tap" disabled={working || !instruction.trim()} onClick={() => aiStep({ mode: "revise", instruction }, "Überarbeitung", "revise")}>
                    {busy === "revise" ? "Wird überarbeitet … (bis zu einer Minute)" : "Ganze Vorbereitung überarbeiten"}
                  </button>
                  <button type="button" className="btn-ghost btn-sm tap" disabled={working} onClick={() => aiStep({ mode: "more", instruction }, "neue Fragen", "more")}>
                    {busy === "more" ? "Neue Fragen kommen …" : instruction.trim() ? "Neue Fragen dazu erstellen" : "Weitere Fragen erstellen"}
                  </button>
                </div>
              </div>
            )}

            {undo && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fbf1e3] px-3.5 py-2.5" role="status">
                <span className="min-w-0">KI-Vorschlag ({undo.label}) ist eingesetzt. Prüfen, anpassen und speichern.</span>
                <button type="button" className="link" onClick={() => { setDraft(undo.draft); setUndo(null); }}>Rückgängig</button>
              </div>
            )}

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
                    {ai && (
                      <button type="button" className="tap shrink-0 px-2 pt-2 text-xs text-accent hover:underline" disabled={working} onClick={() => setAskFor(askFor?.key === q.key ? null : { key: q.key, text: "" })}>
                        ✦ KI
                      </button>
                    )}
                    <button type="button" className="tap shrink-0 px-2 pt-2 text-xs text-muted hover:text-danger" onClick={() => change((d) => ({ ...d, questions: d.questions.filter((x) => x.key !== q.key) }))}>
                      Entfernen
                    </button>
                  </div>
                  {askFor?.key === q.key && (
                    <form
                      className="flex flex-wrap items-end gap-2 rounded-lg bg-tint/50 p-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        aiStep({ mode: "question", instruction: askFor.text, index: n }, `Frage ${n + 1}`, `q${n}`);
                      }}
                    >
                      <label className="block min-w-0 flex-1 basis-60">
                        <span className="mb-1 block text-xs font-medium text-muted">Was soll an dieser Frage anders werden?</span>
                        <input className="input !py-2" maxLength={2000} autoFocus value={askFor.text} placeholder="z. B. Antwort kürzer, mit Beispiel aus dem Lager" onChange={(e) => setAskFor({ key: q.key, text: e.target.value })} />
                      </label>
                      <button className="btn btn-sm tap" disabled={working}>{busy === `q${n}` ? "Wird überarbeitet …" : "Überarbeiten"}</button>
                    </form>
                  )}
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
          </>
        )}

        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            <button type="button" className="btn btn-sm tap" disabled={working} onClick={() => run("speichern")}>
              {busy === "speichern" ? "Wird gespeichert …" : "Speichern"}
            </button>
            {saved && !dirty && (
              <>
                <ShareButton
                  kind="vorbereitung"
                  refId={app.id}
                  role="coach"
                  coacheeId={coacheeId}
                  recipient={firstName}
                  title={app.title}
                  label={sent ? `Erneut an ${firstName} schicken` : `An ${firstName} schicken`}
                  className={sent && !sent.changed ? "btn-ghost btn-sm" : "btn btn-sm"}
                  onSent={(r) => r.ok && setSent({ at: new Date().toISOString(), changed: false })}
                />
                <Link href={`/coach/coachees/${coacheeId}/vorbereitung/${app.id}`} className="btn-ghost btn-sm tap">So sieht {firstName} es · Drucken</Link>
              </>
            )}
            <span className="text-xs text-muted">
              {dirty
                ? `Änderungen noch nicht gespeichert${saved ? ". Zum Schicken erst speichern." : ""}`
                : [saved && `Gespeichert am ${time(saved)}`, sent && `geschickt am ${time(sent.at)}`, sent?.changed && "seitdem geändert"].filter(Boolean).join(" · ")}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              {confirm ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs">{confirm === "neu" ? "Alles außer deinen Empfehlungen wird ersetzt." : `Vorbereitung ganz löschen? ${sent ? `Auch ${firstName} sieht sie dann nicht mehr.` : ""}`}</span>
                  <button type="button" className="btn btn-sm tap !bg-danger" disabled={working} onClick={() => run(confirm === "neu" ? "erstellen" : "loeschen")}>
                    {busy === "erstellen" ? "Wird erstellt …" : busy === "loeschen" ? "Wird gelöscht …" : confirm === "neu" ? "Ja, neu erstellen" : "Ja, löschen"}
                  </button>
                  <button type="button" className="btn-ghost btn-sm tap" onClick={() => setConfirm(null)}>Nein</button>
                </span>
              ) : (
                <>
                  {ai && <button type="button" className="btn-ghost btn-sm tap" disabled={working} onClick={() => setConfirm("neu")}>Neu erstellen</button>}
                  <button type="button" className="btn-ghost btn-sm tap hover:!text-danger" disabled={working} onClick={() => (saved ? setConfirm("loeschen") : (setDraft(null), setDirty(false)))}>
                    {saved ? "Löschen" : "Verwerfen"}
                  </button>
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </details>
  );
}
