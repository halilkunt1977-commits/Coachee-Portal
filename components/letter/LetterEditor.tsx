"use client";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { draftLetterBody, resetLetter, saveLetter } from "@/app/actions/anschreiben";
import { CvPreview } from "@/components/cv/CvPreview";
import { SignatureField } from "@/components/cv/SignatureField";
import { renderLetterHtml } from "@/lib/letter/render";
import { LETTER_FIELDS, resolveLetter, type LetterField, type StoredLetter } from "@/lib/letter/types";

type Auto = Record<LetterField, string> & { body: string };
type Props = {
  applicationId: string;
  coacheeId: string;
  job: { title: string; employer: string };
  auto: Auto;
  stored: StoredLetter | null;
  color: string;
  signatureId: string | null;
  coach: boolean;
  /** Schreibhilfe verfügbar (beim Coachee ohne Hinweis auf die Technik) */
  draft: boolean;
  backHref: string;
  backLabel: string;
};

type SaveState = "saved" | "dirty" | "saving" | "error";
const PREVIEW_FONTS = '@import url("/api/lebenslauf/schriften.css");';
const pick = (v: Record<LetterField, string>) => Object.fromEntries(LETTER_FIELDS.map((k) => [k, v[k]])) as Record<LetterField, string>;

export function LetterEditor(p: Props) {
  const initial = useMemo(() => resolveLetter(p.auto, p.stored), [p.auto, p.stored]);
  const [values, setValues] = useState<Record<LetterField, string>>(() => pick(initial));
  const [body, setBody] = useState(initial.body);
  const [adText, setAdText] = useState(p.stored?.adText ?? "");
  const [useSignature, setUseSignature] = useState(initial.signature);
  const [signatureId, setSignatureId] = useState(p.signatureId);
  const [save, setSave] = useState<SaveState>("saved");
  const [view, setView] = useState<"form" | "preview">("form");
  // Neues Anschreiben mit Schreibhilfe: der erste Entwurf entsteht gleich beim Öffnen
  const autoDraft = useRef(p.draft && !p.stored);
  const [drafting, setDrafting] = useState(p.draft && !p.stored);
  const [draftError, setDraftError] = useState<string | null>(null);
  const touched = useRef(false);

  // ---------- Automatisch speichern ----------
  const latest = useRef({ values, body, adText, signature: useSignature });
  const timer = useRef<number | null>(null);
  const busy = useRef<Promise<void> | null>(null);
  const first = useRef(true);

  const doSave = useCallback(async () => {
    if (busy.current) await busy.current;
    busy.current = (async () => {
      setSave("saving");
      const res = await saveLetter(p.applicationId, latest.current).catch(() => ({ ok: false as const, error: "" }));
      setSave(res.ok ? "saved" : "error");
    })();
    await busy.current;
    busy.current = null;
  }, [p.applicationId]);

  useEffect(() => {
    latest.current = { values, body, adText, signature: useSignature };
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void doSave(), 900);
  }, [values, body, adText, useSignature, doSave]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (save === "dirty" || save === "error") await doSave();
    else if (busy.current) await busy.current;
  }, [save, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // ---------- Text entwerfen ----------
  const runDraft = useCallback(
    async (text: string) => {
      const res = await draftLetterBody(p.applicationId, text).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
      setDrafting(false);
      if (res.ok) {
        if (!touched.current) setBody(res.text);
        return null;
      }
      return res.error;
    },
    [p.applicationId],
  );

  useEffect(() => {
    if (!autoDraft.current) return;
    autoDraft.current = false;
    // Klappt der Entwurf nicht, bleibt einfach die Vorlage stehen
    void runDraft("");
  }, [runDraft]);

  // ---------- Vorschau ----------
  const signatureUrl = signatureId ? `/api/dateien/${signatureId}` : null;
  const current = useMemo(() => ({ ...values, body, signature: useSignature }), [values, body, useSignature]);
  const letter = useDeferredValue(current);
  const html = useMemo(() => renderLetterHtml(letter, { color: p.color, signature: signatureUrl, fontCss: PREVIEW_FONTS }), [letter, p.color, signatureUrl]);

  const set = (k: LetterField) => (v: string) => setValues((x) => ({ ...x, [k]: v }));
  const field = (k: LetterField) => ({ value: values[k], onChange: set(k), auto: p.auto[k], onReset: () => set(k)(p.auto[k]) });

  async function download(kind: "pdf" | "word") {
    await flush();
    const a = document.createElement("a");
    a.href = `/api/anschreiben/${p.applicationId}/${kind}`;
    a.click();
  }

  const draftLabel = p.coach ? "Text mit KI neu entwerfen" : "Neuen Textvorschlag erstellen";
  const draftBusy = p.coach ? "Die KI schreibt einen Entwurf …" : "Der Text wird vorbereitet …";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href={p.backHref} className="w-full text-sm text-muted hover:text-ink sm:w-auto" onClick={() => void flush()}>← {p.backLabel}</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight sm:text-2xl">Anschreiben</h1>
          <p className="truncate text-sm text-muted">{[p.job.title, p.job.employer].filter(Boolean).join(" · ")}</p>
        </div>
        <SaveBadge state={save} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" className="btn-ghost" onClick={() => download("word")}>Word herunterladen</button>
          <button type="button" className="btn" onClick={() => download("pdf")}>PDF herunterladen</button>
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1 text-sm font-semibold lg:hidden">
        {(["form", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg py-2 ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "form" ? "Bearbeiten" : "Vorschau"}</button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className={`space-y-3 ${view === "form" ? "" : "hidden lg:block"}`}>
          <Card title="Empfänger und Betreff" hint="Kommt aus der gespeicherten Bewerbung. Wer dort Anschrift oder Ansprechperson korrigiert, ändert sie auch hier, solange das Feld hier nicht von Hand geändert wurde.">
            <Field label="Anschrift des Arbeitgebers" rows={4} placeholder={"Firma\nAnsprechperson\nStraße\nPLZ Ort"} {...field("recipient")} />
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
              <Field label="Ort" {...field("place")} />
              <Field label="Datum" {...field("date")} />
            </div>
            <Field label="Betreff" {...field("subject")} />
            <Field label="Zeile unter dem Betreff" placeholder="z. B. Referenznummer" {...field("reference")} />
          </Card>

          <Card title="Brieftext">
            <Field label="Anrede" {...field("salutation")} />
            <label className="block">
              <span className="label">Text</span>
              <textarea
                className="input min-h-72 leading-relaxed"
                rows={14}
                value={body}
                disabled={drafting}
                onChange={(e) => {
                  touched.current = true;
                  setBody(e.target.value);
                }}
              />
              <span className="mt-1 block text-xs text-muted">{drafting ? draftBusy : "Absätze mit einer Leerzeile trennen. Im Brief steht der Text im Blocksatz."}</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {body.trim() !== p.auto.body.trim() && (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-ink"
                  onClick={() => {
                    touched.current = true;
                    setBody(p.auto.body);
                  }}
                >
                  Vorlage wiederherstellen
                </button>
              )}
            </div>
            {p.draft && (
              <div className="space-y-2 rounded-xl bg-bg p-3">
                <label className="block">
                  <span className="label">Text der Stellenanzeige <span className="font-normal text-muted">(optional)</span></span>
                  <textarea className="input text-sm" rows={4} value={adText} onChange={(e) => setAdText(e.target.value)} placeholder="Anzeige hier hineinkopieren, dann passt der Vorschlag genauer zu den Anforderungen." />
                </label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline disabled:opacity-50"
                  disabled={drafting}
                  onClick={async () => {
                    setDrafting(true);
                    setDraftError(null);
                    touched.current = false;
                    setDraftError(await runDraft(adText));
                  }}
                >
                  <span aria-hidden>✦</span> {drafting ? draftBusy : draftLabel}
                </button>
                {draftError && <p className="text-sm text-danger">{draftError}</p>}
              </div>
            )}
          </Card>

          <Card title="Gruß, Unterschrift und Anlagen">
            <Field label="Grußformel" {...field("closing")} />
            <SignatureField coacheeId={p.coacheeId} value={signatureId} onChange={setSignatureId} />
            {signatureId && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useSignature} onChange={(e) => setUseSignature(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Unterschrift in diesem Anschreiben zeigen</label>
            )}
            <Field label="Anlagen" hint="eine pro Zeile" rows={3} {...field("attachments")} />
          </Card>

          <Card title="Absender" hint="Aus dem neuesten Lebenslauf. Fehlt etwas, am besten dort ergänzen.">
            <Field label="Name" {...field("senderName")} />
            <Field label="Straße und Hausnummer" {...field("senderStreet")} />
            <Field label="PLZ und Ort" {...field("senderCity")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Telefon" {...field("senderPhone")} />
              <Field label="E-Mail" {...field("senderEmail")} />
            </div>
          </Card>

          <ResetAll applicationId={p.applicationId} />
        </div>

        <div className={`lg:sticky lg:top-20 ${view === "preview" ? "" : "hidden lg:block"}`}>
          <CvPreview html={html} showBreaks={false} title="Vorschau des Anschreibens" />
          <p className="mt-2 text-center text-xs text-muted">So sieht das Anschreiben im PDF aus. Die Word-Datei hat denselben Aufbau.</p>
        </div>
      </div>
    </div>
  );
}

function ResetAll({ applicationId }: { applicationId: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <p className="px-1 text-right text-sm">
      {confirm ? (
        <span className="inline-flex items-center gap-2">
          Alle eigenen Änderungen verwerfen?
          <button
            type="button"
            className="font-semibold text-danger hover:underline"
            onClick={async () => {
              await resetLetter(applicationId);
              window.location.reload();
            }}
          >
            Ja, neu beginnen
          </button>
          <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirm(false)}>Nein</button>
        </span>
      ) : (
        <button type="button" className="text-muted hover:text-danger" onClick={() => setConfirm(true)}>Anschreiben neu beginnen</button>
      )}
    </p>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const text = { saved: "Gespeichert", dirty: "Änderungen …", saving: "Speichert …", error: "Nicht gespeichert" }[state];
  const tone = state === "error" ? "text-danger" : state === "saved" ? "text-ok" : "text-muted";
  return <span className={`text-xs font-medium ${tone}`} aria-live="polite">{text}</span>;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Eingabefeld mit „zurücksetzen“, sobald es vom automatischen Wert abweicht */
function Field({ label, value, onChange, auto, onReset, hint, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; auto: string; onReset: () => void; hint?: string; rows?: number; placeholder?: string }) {
  const changed = value !== auto;
  return (
    <label className="block min-w-0">
      <span className="label flex items-baseline justify-between gap-2">
        <span>{label}{hint && <span className="ml-1 font-normal text-muted">({hint})</span>}</span>
        {changed && auto !== undefined && (
          <button type="button" className="text-xs font-normal text-muted hover:text-accent" onClick={(e) => { e.preventDefault(); onReset(); }} title={auto ? `Automatisch: ${auto}` : "Automatisch leer"}>
            ↺ automatisch
          </button>
        )}
      </span>
      {rows ? (
        <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
