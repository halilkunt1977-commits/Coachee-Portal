"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { draftLetterBody, resetLetter, saveContact, saveLetter } from "@/app/actions/anschreiben";
import { CvPreview } from "@/components/cv/CvPreview";
import { SignatureField } from "@/components/cv/SignatureField";
import { EmailEditor } from "@/components/letter/EmailEditor";
import type { StoredEmail } from "@/lib/letter/email";
import { renderLetterHtml } from "@/lib/letter/render";
import { LETTER_FIELDS, resolveLetter, splitContact, type LetterField, type StoredLetter } from "@/lib/letter/types";
import { useT } from "@/components/i18n/LangProvider";

type Auto = Record<LetterField, string> & { body: string };
type Props = {
  applicationId: string;
  coacheeId: string;
  /** Vor- und Nachname für die Unterschrift-Vorschläge */
  signName: string;
  job: { title: string; employer: string; refnr: string | null; contact: string; salutation: string };
  /** Alle Bewerbungen des Coachees für die Auswahl oben */
  applications: { id: string; label: string }[];
  /** Gespeicherte E-Mail-Bewerbung (null-Felder = automatisch) */
  email: StoredEmail;
  /** Neuester Lebenslauf für den PDF-Anhang */
  cvId: string | null;
  /** Start in der Ansicht „E-Mail“ (?ansicht=email) */
  initialMode?: "brief" | "email";
  auto: Auto;
  stored: StoredLetter | null;
  color: string;
  signatureId: string | null;
  coach: boolean;
  /** Schreibhilfe verfügbar (beim Coachee ohne Hinweis auf die Technik) */
  draft: boolean;
  /** „An … senden“ */
  share?: React.ReactNode;
  backHref: string;
  backLabel: string;
};

type SaveState = "saved" | "dirty" | "saving" | "error";
const PREVIEW_FONTS = '@import url("/api/lebenslauf/schriften.css");';
const pick = (v: Record<LetterField, string>) => Object.fromEntries(LETTER_FIELDS.map((k) => [k, v[k]])) as Record<LetterField, string>;

export function LetterEditor(p: Props) {
  const t = useT();
  // Automatische Werte; Anschrift und Anrede ändern sich, wenn hier die Ansprechperson geändert wird
  const [auto, setAuto] = useState<Auto>(p.auto);
  const [contact, setContact] = useState(p.job.contact);
  const initial = useMemo(() => resolveLetter(p.auto, p.stored), [p.auto, p.stored]);
  const [values, setValues] = useState<Record<LetterField, string>>(() => pick(initial));
  const [body, setBody] = useState(initial.body);
  const [adText, setAdText] = useState(p.stored?.adText ?? "");
  const [useSignature, setUseSignature] = useState(initial.signature);
  const [signatureId, setSignatureId] = useState(p.signatureId);
  const [fit, setFit] = useState({ level: 0, overflow: false });
  const [save, setSave] = useState<SaveState>("saved");
  const [view, setView] = useState<"form" | "preview">("form");
  const [mode, setModeState] = useState<"brief" | "email">(p.initialMode ?? "brief");
  const setMode = (m: "brief" | "email") => {
    setModeState(m);
    // Ansicht in der Adresse merken, damit Neuladen und Zurück in derselben Ansicht landen
    const url = new URL(window.location.href);
    if (m === "email") url.searchParams.set("ansicht", "email");
    else url.searchParams.delete("ansicht");
    window.history.replaceState(window.history.state, "", url);
  };
  // Neues Anschreiben mit Schreibhilfe: der erste Entwurf entsteht gleich beim Öffnen
  const autoDraft = useRef(p.draft && !p.stored);
  const [drafting, setDrafting] = useState(p.draft && !p.stored);
  const [draftError, setDraftError] = useState<string | null>(null);
  const touched = useRef(false);

  // ---------- Automatisch speichern ----------
  const latest = useRef({ values, body, adText, signature: useSignature });
  const timer = useRef<number | null>(null);
  const busy = useRef<Promise<void> | null>(null);
  // Öffnen allein speichert nie: gespeichert wird erst, wenn sich etwas gegenüber dem geladenen Stand ändert.
  // (Ein Merker „erster Durchlauf“ reicht nicht: StrictMode führt Effekte beim Öffnen zweimal aus.)
  const [initialJson] = useState(() => JSON.stringify({ values, body, adText, signature: useSignature }));
  const changed = useRef(false);

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
    if (!changed.current && JSON.stringify(latest.current) === initialJson) return;
    changed.current = true;
    setSave("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void doSave(), 900);
  }, [values, body, adText, useSignature, doSave, initialJson]);

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
      const res = await draftLetterBody(p.applicationId, text).catch(() => ({ ok: false as const, error: t("Gerade keine Verbindung. Bitte noch einmal versuchen.") }));
      setDrafting(false);
      if (res.ok) {
        if (!touched.current) setBody(res.text);
        return null;
      }
      return res.error;
    },
    [p.applicationId, t],
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
  const field = (k: LetterField) => ({ value: values[k], onChange: set(k), auto: auto[k], onReset: () => set(k)(auto[k]) });

  /** Neue automatische Anschrift und Anrede übernehmen, außer dort steht schon etwas eigenes */
  const contactSaved = (next: { contact: string; recipient: string; salutation: string }) => {
    setContact(next.contact);
    setValues((v) => ({
      ...v,
      recipient: v.recipient === auto.recipient ? next.recipient : v.recipient,
      salutation: v.salutation === auto.salutation ? next.salutation : v.salutation,
    }));
    setAuto((a) => ({ ...a, recipient: next.recipient, salutation: next.salutation }));
  };

  const router = useRouter();
  async function switchJob(id: string) {
    await flush();
    router.push(`/anschreiben/${id}${mode === "email" ? "?ansicht=email" : ""}`);
  }

  async function download(kind: "pdf" | "word") {
    await flush();
    const a = document.createElement("a");
    a.href = `/api/anschreiben/${p.applicationId}/${kind}`;
    a.click();
  }

  const emailApp = useMemo(() => ({ contact, refnr: p.job.refnr }), [contact, p.job.refnr]);

  const draftLabel = p.coach ? t("Text mit KI neu entwerfen") : t("Neuen Textvorschlag erstellen");
  const draftBusy = p.coach ? t("Die KI schreibt einen Entwurf …") : t("Der Text wird vorbereitet …");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href={p.backHref} className="w-full text-sm text-muted hover:text-ink sm:w-auto" onClick={() => void flush()}>← {p.backLabel}</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight sm:text-2xl">{t("Anschreiben")}</h1>
          <p className="truncate text-sm text-muted">{[p.job.title, p.job.employer].filter(Boolean).join(" · ")}</p>
        </div>
        <SaveBadge state={save} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {p.share}
          <button type="button" className="btn-ghost" onClick={() => download("word")}>{t("Word herunterladen")}</button>
          <button type="button" className="btn" onClick={() => download("pdf")}>{t("PDF herunterladen")}</button>
        </div>
      </div>

      <div role="tablist" aria-label={t("Art der Bewerbung")} className="flex gap-1 border-b border-line text-sm font-semibold">
        {(["brief", "email"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`-mb-px flex-1 border-b-2 px-4 py-2.5 sm:flex-none ${mode === m ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {m === "brief" ? t("Brief") : t("E-Mail-Bewerbung")}
          </button>
        ))}
      </div>

      <section className="card grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label htmlFor="stelle" className="label">{t("Stelle")}</label>
          <select id="stelle" aria-describedby="stelle-hint" className="input" value={p.applicationId} onChange={(e) => void switchJob(e.target.value)}>
            {p.applications.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <span id="stelle-hint" className="mt-1 block text-xs text-muted">{p.coach ? t("Brief und E-Mail entstehen aus dem neuesten Lebenslauf und dieser Stelle.") : t("Brief und E-Mail entstehen aus deinem neuesten Lebenslauf und dieser Stelle.")}</span>
        </div>
        <ContactFields key={p.applicationId} applicationId={p.applicationId} salutation={p.job.salutation} contact={p.job.contact} onSaved={contactSaved} />
      </section>

      <div className={mode === "email" ? "" : "hidden"}>
        <EmailEditor applicationId={p.applicationId} app={emailApp} letter={current} stored={p.email} cvId={p.cvId} coach={p.coach} draft={p.draft} flushLetter={flush} />
      </div>
      {mode === "brief" && (
      <>
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1 text-sm font-semibold lg:hidden">
        {(["form", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg py-2 ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "form" ? t("Bearbeiten") : t("Vorschau")}</button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className={`space-y-3 ${view === "form" ? "" : "hidden lg:block"}`}>
          <Card title={t("Empfänger und Betreff")} hint={t("Kommt aus der gespeicherten Bewerbung. Wer dort Anschrift oder Ansprechperson korrigiert, ändert sie auch hier, solange das Feld hier nicht von Hand geändert wurde.")}>
            <Field label="Anschrift des Arbeitgebers" rows={4} placeholder={t("Firma\nAnsprechperson\nStraße\nPLZ Ort")} {...field("recipient")} />
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
              <Field label="Ort" {...field("place")} />
              <Field label="Datum" {...field("date")} />
            </div>
            <Field label="Betreff" {...field("subject")} />
            <Field label="Zeile unter dem Betreff" placeholder={t("z. B. Referenznummer")} {...field("reference")} />
          </Card>

          <Card title={t("Brieftext")}>
            <Field label="Anrede" {...field("salutation")} />
            <label className="block">
              <span className="label">{t("Text")}</span>
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
              <span className="mt-1 block text-xs text-muted">{drafting ? draftBusy : t("Absätze mit einer Leerzeile trennen. Im Brief steht der Text im Blocksatz.")}</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {body.trim() !== auto.body.trim() && (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-ink"
                  onClick={() => {
                    touched.current = true;
                    setBody(auto.body);
                  }}
                >
                  {t("Vorlage wiederherstellen")}
                </button>
              )}
            </div>
            {p.draft && (
              <div className="space-y-2 rounded-xl bg-bg p-3">
                <label className="block">
                  <span className="label">{t("Text der Stellenanzeige")} <span className="font-normal text-muted">{t("(optional)")}</span></span>
                  <textarea className="input text-sm" rows={4} value={adText} onChange={(e) => setAdText(e.target.value)} placeholder={t("Anzeige hier hineinkopieren, dann passt der Vorschlag genauer zu den Anforderungen.")} />
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

          <Card title={t("Gruß, Unterschrift und Anlagen")}>
            <Field label="Grußformel" {...field("closing")} />
            <SignatureField coacheeId={p.coacheeId} name={p.signName} value={signatureId} onChange={setSignatureId} />
            {signatureId && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useSignature} onChange={(e) => setUseSignature(e.target.checked)} className="size-4 accent-[var(--accent)]" /> {t("Unterschrift in diesem Anschreiben zeigen")}</label>
            )}
            <Field label="Anlagen" hint="eine pro Zeile" rows={3} {...field("attachments")} />
          </Card>

          <Card title={t("Absender")} hint={p.coach ? t("Aus dem neuesten Lebenslauf. Fehlt etwas, am besten dort ergänzen.") : t("Name, Telefon und E-Mail kommen aus deinen Daten. Die Adresse aus deinem neuesten Lebenslauf.")}>
            <Field label="Name" {...field("senderName")} locked={!p.coach} />
            <Field label="Straße und Hausnummer" {...field("senderStreet")} />
            <Field label="PLZ und Ort" {...field("senderCity")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Telefon" {...field("senderPhone")} locked={!p.coach} />
              <Field label="E-Mail" {...field("senderEmail")} locked={!p.coach} />
            </div>
          </Card>

          <ResetAll applicationId={p.applicationId} />
        </div>

        <div className={`lg:sticky lg:top-20 ${view === "preview" ? "" : "hidden lg:block"}`}>
          <CvPreview html={html} showBreaks={false} onePage onFit={setFit} title={t("Vorschau des Anschreibens")} />
          {fit.overflow ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-center text-sm font-medium text-danger" role="alert">
              Der Text ist zu lang für eine Seite. Bitte kürzen, sonst fehlt am Ende etwas.
            </p>
          ) : fit.level >= 7 ? (
            <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-center text-sm text-ink">{t("Passt gerade noch auf eine Seite, aber sehr eng. Besser etwas kürzen, auch für die Word-Datei.")}</p>
          ) : fit.level > 0 ? (
            <p className="mt-2 text-center text-xs text-muted">{t("Etwas enger gesetzt, damit alles auf eine Seite passt. Kürzer wirkt meist besser.")}</p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted">{t("So sieht das Anschreiben im PDF aus, immer auf einer Seite. Die Word-Datei hat denselben Aufbau.")}</p>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/** Ansprechperson der Bewerbung: speichert in die Bewerbung, Anschrift und Anrede ziehen nach */
function ContactFields(p: { applicationId: string; salutation: string; contact: string; onSaved: (next: { contact: string; recipient: string; salutation: string }) => void }) {
  const t = useT();
  const [sal, setSal] = useState(p.salutation);
  const [name, setName] = useState(() => splitContact(p.contact).name);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | null>(null);
  const onSaved = useRef(p.onSaved);
  useEffect(() => {
    onSaved.current = p.onSaved;
  });
  const [initialContact] = useState(() => JSON.stringify([p.salutation, splitContact(p.contact).name]));
  const changed = useRef(false);
  useEffect(() => {
    if (!changed.current && JSON.stringify([sal, name]) === initialContact) return;
    changed.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setState("saving");
      const res = await saveContact(p.applicationId, { salutation: sal, name }).catch(() => ({ ok: false as const, error: "" }));
      if (res.ok) onSaved.current(res);
      setState(res.ok ? "saved" : "error");
    }, 700);
  }, [sal, name, p.applicationId, initialContact]);
  return (
    <div className="min-w-0">
      <span className="label flex items-baseline justify-between gap-2">
        <span>{t("Ansprechperson")} <span className="font-normal text-muted">{t("(falls vorhanden)")}</span></span>
        {state !== "idle" && <span className={`text-xs font-normal ${state === "error" ? "text-danger" : "text-muted"}`} aria-live="polite">{state === "saving" ? t("Speichert …") : state === "saved" ? t("In der Bewerbung gespeichert") : t("Nicht gespeichert")}</span>}
      </span>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
        <select className="input" aria-label={t("Anrede der Ansprechperson")} value={sal} onChange={(e) => setSal(e.target.value)}>
          <option value="">–</option>
          <option value="frau">{t("Frau")}</option>
          <option value="herr">{t("Herr")}</option>
        </select>
        <input className="input" aria-label={t("Name der Ansprechperson")} placeholder={t("z. B. Weber")} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <span className="mt-1 block text-xs text-muted">{t("Mit Namen: „Sehr geehrte Frau …“. Ohne: „Sehr geehrte Damen und Herren“.")}</span>
    </div>
  );
}

function ResetAll({ applicationId }: { applicationId: string }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <p className="px-1 text-right text-sm">
      {confirm ? (
        <span className="inline-flex items-center gap-2">
          {t("Alle eigenen Änderungen verwerfen?")}
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
          <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirm(false)}>{t("Nein")}</button>
        </span>
      ) : (
        <button type="button" className="text-muted hover:text-danger" onClick={() => setConfirm(true)}>{t("Anschreiben neu beginnen")}</button>
      )}
    </p>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const t = useT();
  const text = t({ saved: "Gespeichert ✓", dirty: "Wird gleich gespeichert", saving: "Wird gespeichert …", error: "Nicht gespeichert" }[state]);
  const tone = state === "error" ? "text-danger" : state === "saved" ? "text-ok" : "text-muted";
  return <span className={`shrink-0 whitespace-nowrap text-sm font-medium ${tone}`} aria-live="polite">{text}</span>;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const t = useT();
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">{t(title)}</h2>
        {hint && <p className="mt-1 text-xs text-muted">{t(hint)}</p>}
      </div>
      {children}
    </section>
  );
}

/** Eingabefeld mit „zurücksetzen“, sobald es vom automatischen Wert abweicht */
function Field({ label, value, onChange, auto, onReset, hint, rows, placeholder, locked }: { label: string; value: string; onChange: (v: string) => void; auto: string; onReset: () => void; hint?: string; rows?: number; placeholder?: string; locked?: boolean }) {
  const t = useT();
  const changed = value !== auto;
  if (locked) {
    return (
      <label className="block min-w-0">
        <span className="label">{t(label)} <span className="font-normal text-muted">{t("(aus deinen Daten)")}</span></span>
        <input className="input cursor-not-allowed bg-surface-2 text-muted" value={auto} readOnly />
      </label>
    );
  }
  return (
    <label className="block min-w-0">
      <span className="label flex items-baseline justify-between gap-2">
        <span>{t(label)}{hint && <span className="ml-1 font-normal text-muted">({t(hint)})</span>}</span>
        {changed && auto !== undefined && (
          <button type="button" className="text-xs font-normal text-muted hover:text-accent" onClick={(e) => { e.preventDefault(); onReset(); }} title={auto ? t("Automatisch: {wert}", { wert: auto }) : t("Automatisch leer")}>
            {t("↺ automatisch")}
          </button>
        )}
      </span>
      {rows ? (
        <textarea className="input" rows={rows} value={value} placeholder={placeholder && t(placeholder)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} placeholder={placeholder && t(placeholder)} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
