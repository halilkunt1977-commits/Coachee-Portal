"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { draftEmailText, saveEmail } from "@/app/actions/anschreiben";
import {
  attachmentNames,
  autoEmail,
  composeEmailBody,
  emailSignature,
  fullEmailText,
  looksLikeEmail,
  mailtoHref,
  type EmailField,
  type EmailValues,
  type StoredEmail,
} from "@/lib/letter/email";
import type { LetterField } from "@/lib/letter/types";

type Props = {
  applicationId: string;
  app: { contact: string; refnr: string | null };
  /** Aktueller Stand des Anschreibens im Editor (auch ungespeichert) */
  letter: Record<LetterField, string> & { body: string };
  stored: StoredEmail;
  cvId: string | null;
  coach: boolean;
  /** Schreibhilfe verfügbar (beim Coachee ohne Hinweis auf die Technik) */
  draft: boolean;
  /** Anschreiben vor dem PDF-Download speichern */
  flushLetter: () => Promise<void>;
};

type SaveState = "saved" | "dirty" | "saving" | "error";
// Manche E-Mail-Programme kürzen sehr lange mailto:-Links (Outlook ab etwa 2000 Zeichen)
const MAILTO_SAFE = 1900;

export function EmailEditor(p: Props) {
  const auto = useMemo(() => autoEmail(p.letter, p.app), [p.letter, p.app]);
  // Eigene Werte; null = automatisch aus dem Anschreiben
  const [own, setOwn] = useState<StoredEmail>(p.stored);
  const values: EmailValues = { to: own.to ?? auto.to, subject: own.subject ?? auto.subject, body: own.body ?? auto.body };
  const signature = emailSignature(p.letter);
  const text = fullEmailText(values.body, signature);
  const [save, setSave] = useState<SaveState>("saved");
  const [drafting, setDrafting] = useState(false);
  const bodyId = useId();
  const [draftError, setDraftError] = useState<string | null>(null);

  // ---------- Automatisch speichern ----------
  const latest = useRef(own);
  const timer = useRef<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    latest.current = own;
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSave("saving");
      const res = await saveEmail(p.applicationId, latest.current).catch(() => ({ ok: false as const, error: "" }));
      setSave(res.ok ? "saved" : "error");
    }, 900);
  }, [own, p.applicationId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // Gleicht der Wert wieder dem automatischen, zählt er als automatisch: spätere Änderungen am Brief wirken dann weiter
  const set = (k: EmailField) => (v: string) => setOwn((x) => ({ ...x, [k]: v === auto[k] ? null : v }));
  const reset = (k: EmailField) => setOwn((x) => ({ ...x, [k]: null }));

  const mailto = mailtoHref(values.to, values.subject, text);
  const toInvalid = values.to.trim() !== "" && !looksLikeEmail(values.to);
  const extra = attachmentNames(p.letter.attachments).filter((n) => !/^(anschreiben|lebenslauf)$/i.test(n));

  const draftLabel = p.coach ? "Kurzfassung mit KI vorschlagen" : "Kurzfassung vorschlagen";
  const draftBusy = p.coach ? "Die KI schreibt eine Kurzfassung …" : "Der Text wird vorbereitet …";

  async function download(href: string, letter: boolean) {
    if (letter) await p.flushLetter();
    const a = document.createElement("a");
    a.href = href;
    a.click();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
      <section className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="h2">E-Mail-Bewerbung</h2>
            <p className="mt-1 text-xs text-muted">
              Kurze Nachricht für den Versand per E-Mail. Sie entsteht aus dem Anschreiben; das Anschreiben selbst und der Lebenslauf kommen als PDF in den Anhang.
            </p>
          </div>
          <SaveBadge state={save} />
        </div>

        <EmailInput
          label="An"
          type="email"
          placeholder="bewerbung@firma.de"
          value={values.to}
          onChange={set("to")}
          changed={own.to !== null}
          onReset={() => reset("to")}
          resetTitle={auto.to ? `Aus der Bewerbung: ${auto.to}` : "Leer"}
        />
        {toInvalid ? (
          <p className="-mt-2 text-xs text-danger">Das sieht nicht nach einer E-Mail-Adresse aus.</p>
        ) : (
          !values.to.trim() && <p className="-mt-2 text-xs text-muted">In der Bewerbung ist keine E-Mail-Adresse hinterlegt. Sie steht meist in der Stellenanzeige.</p>
        )}

        <EmailInput label="Betreff" value={values.subject} onChange={set("subject")} changed={own.subject !== null} onReset={() => reset("subject")} resetTitle={`Automatisch: ${auto.subject}`} />

        <div className="min-w-0">
          <FieldHead id={bodyId} label="Nachricht" changed={own.body !== null} onReset={() => reset("body")} resetTitle="Kurzfassung wieder aus dem Anschreiben erstellen" resetLabel="↺ aus dem Anschreiben" />
          <textarea id={bodyId} aria-describedby={`${bodyId}-hint`} className="input min-h-64 leading-relaxed" rows={13} value={values.body} disabled={drafting} onChange={(e) => set("body")(e.target.value)} />
          <span id={`${bodyId}-hint`} className="mt-1 block text-xs text-muted">
            {drafting ? draftBusy : own.body === null ? "Kurzfassung des Anschreibens. Ändert sich der Brief, passt sich dieser Text an, solange er hier nicht von Hand geändert wurde." : "Von Hand geändert."}
          </span>
        </div>

        {p.draft && (
          <div className="space-y-2 rounded-xl bg-bg p-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline disabled:opacity-50"
              disabled={drafting}
              onClick={async () => {
                setDrafting(true);
                setDraftError(null);
                const res = await draftEmailText(p.applicationId).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
                setDrafting(false);
                if (res.ok) setOwn((x) => ({ ...x, body: composeEmailBody(p.letter.salutation, res.text, p.letter.closing) }));
                else setDraftError(res.error);
              }}
            >
              <span aria-hidden>✦</span> {drafting ? draftBusy : draftLabel}
            </button>
            {draftError && <p className="text-sm text-danger">{draftError}</p>}
          </div>
        )}

        <div>
          <span className="label">Signatur <span className="font-normal text-muted">(aus dem Absender des Anschreibens)</span></span>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 font-[inherit] text-[15px] text-muted">{signature || "–"}</pre>
        </div>
      </section>

      <div className="space-y-3 lg:sticky lg:top-20">
        <section className="card space-y-3">
          <h2 className="h2">Versenden</h2>
          <a href={mailto} className="btn w-full justify-center text-center">In E-Mail-Programm öffnen</a>
          <div className="grid grid-cols-2 gap-2">
            <CopyButton label="Betreff kopieren" value={values.subject} />
            <CopyButton label="Text kopieren" value={text} />
          </div>
          {values.to.trim() && <CopyButton label="Adresse kopieren" value={values.to.trim()} wide />}
          <p className="text-xs text-muted">
            Das Portal verschickt die E-Mail nicht.{" "}
            {p.coach ? "Die Anhänge müssen im E-Mail-Programm von Hand hinzugefügt werden." : "Hänge die Unterlagen unten im E-Mail-Programm selbst an."}
            {mailto.length > MAILTO_SAFE && " Der Text ist recht lang: Manche E-Mail-Programme kürzen ihn beim Öffnen. Dann lieber „Text kopieren“ nutzen."}
          </p>
        </section>

        <section className="card space-y-3">
          <div>
            <h2 className="h2">Anhänge</h2>
            <p className="mt-1 text-xs text-muted">{p.coach ? "Als PDF herunterladen und an die E-Mail hängen." : "Lade sie als PDF herunter und hänge sie an die E-Mail."}</p>
          </div>
          <ul className="divide-y divide-line text-sm">
            <Attachment name="Anschreiben (PDF)">
              <button type="button" className="btn-ghost btn-sm" onClick={() => download(`/api/anschreiben/${p.applicationId}/pdf`, true)}>Herunterladen</button>
            </Attachment>
            <Attachment name="Lebenslauf (PDF)">
              {p.cvId ? (
                <button type="button" className="btn-ghost btn-sm" onClick={() => download(`/api/lebenslauf/${p.cvId}/pdf`, false)}>Herunterladen</button>
              ) : p.coach ? (
                <span className="text-xs text-muted">Noch kein Lebenslauf</span>
              ) : (
                <Link href="/mein-bereich/lebenslauf" className="text-xs font-semibold text-accent hover:underline">Lebenslauf anlegen</Link>
              )}
            </Attachment>
            {extra.map((n) => (
              <Attachment key={n} name={n}>
                <span className="text-right text-xs text-muted">{p.coach ? "selbst anhängen" : "selbst anhängen, z. B. eingescannt als PDF"}</span>
              </Attachment>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Attachment({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate font-medium">{name}</span>
      {children}
    </li>
  );
}

/** Kopiert in die Zwischenablage; ohne Clipboard-API (z. B. ältere Browser) über eine unsichtbare Textarea */
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyButton({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const reset = useRef<number | null>(null);
  const click = useCallback(async () => {
    setState((await copyText(value)) ? "ok" : "fail");
    if (reset.current) window.clearTimeout(reset.current);
    reset.current = window.setTimeout(() => setState("idle"), 2000);
  }, [value]);
  return (
    <button type="button" className={`btn-ghost justify-center ${wide ? "w-full" : ""}`} onClick={click} aria-live="polite">
      {state === "ok" ? "Kopiert ✓" : state === "fail" ? "Ging nicht" : label}
    </button>
  );
}

/** Label und „automatisch“-Knopf getrennt, damit das Feld einen sauberen Namen für Screenreader hat */
function FieldHead({ id, label, changed, onReset, resetTitle, resetLabel }: { id: string; label: string; changed: boolean; onReset: () => void; resetTitle: string; resetLabel?: string }) {
  return (
    <div className="label flex items-baseline justify-between gap-2">
      <label htmlFor={id}>{label}</label>
      {changed && (
        <button type="button" className="text-xs font-normal text-muted hover:text-accent" onClick={onReset} title={resetTitle}>
          {resetLabel ?? "↺ automatisch"}
        </button>
      )}
    </div>
  );
}

function EmailInput({ label, value, onChange, changed, onReset, resetTitle, type, placeholder }: { label: string; value: string; onChange: (v: string) => void; changed: boolean; onReset: () => void; resetTitle: string; type?: string; placeholder?: string }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <FieldHead id={id} label={label} changed={changed} onReset={onReset} resetTitle={resetTitle} />
      <input id={id} className="input" type={type ?? "text"} inputMode={type === "email" ? "email" : undefined} autoComplete="off" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const text = { saved: "Gespeichert", dirty: "Änderungen …", saving: "Speichert …", error: "Nicht gespeichert" }[state];
  const tone = state === "error" ? "text-danger" : state === "saved" ? "text-ok" : "text-muted";
  return <span className={`shrink-0 text-xs font-medium ${tone}`} aria-live="polite">{text}</span>;
}
