"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markVideoSeen, setVideoLanguage } from "@/app/actions/erklaervideo";
import { chaptersFor, HELP_TEXT, LANGUAGE_LABEL, VIDEO_LANGUAGES, type CoachingType, type VideoLanguage } from "@/lib/erklaervideo";
import { ExplainerPlayer } from "./ExplainerPlayer";

/** Umschalter „Deutsch | Türkçe“; die Wahl wird beim Coachee gespeichert */
function LanguageToggle({ lang, label, onChange }: { lang: VideoLanguage; label: string; onChange: (l: VideoLanguage) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold">
      {VIDEO_LANGUAGES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => onChange(l)}
          className={`min-h-10 rounded-lg px-4 transition ${lang === l ? "bg-surface text-ink shadow-sm ring-1 ring-line-soft" : "text-muted hover:text-ink"}`}>
          {LANGUAGE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

/**
 * Erklärvideo mit Sprachwahl. Coachee: auf „So funktioniert dein Portal“, zählt als gesehen, wenn das Hauptvideo zu Ende ist.
 * Coach: Vorschau in der Akte mit Namen und Sprache des Coachees; die Sprachwahl dort ändert die Sprache des Coachees.
 */
export function HelpView({ coacheeId, firstName, type, language, voice, preview = false }: {
  coacheeId: string;
  firstName: string;
  type: CoachingType;
  language: VideoLanguage;
  voice: boolean;
  preview?: boolean;
}) {
  const [lang, setLang] = useState<VideoLanguage>(language);
  const [, startTransition] = useTransition();
  const t = HELP_TEXT[lang];
  const change = (l: VideoLanguage) => {
    if (l === lang) return;
    setLang(l);
    startTransition(() => setVideoLanguage(coacheeId, l));
  };
  return (
    <div lang={lang} className="space-y-5">
      {preview ? (
        <LanguageToggle lang={lang} label={t.language} onChange={change} />
      ) : (
        // Wie PageHeader, aber mit Überschrift in der gewählten Sprache
        <div className="rise flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 className="h1">{t.title}</h1>
            <p className="max-w-2xl text-muted">{t.intro}</p>
          </div>
          <LanguageToggle lang={lang} label={t.language} onChange={change} />
        </div>
      )}
      <ExplainerPlayer key={lang} coacheeId={coacheeId} firstName={firstName} type={type} lang={lang} voice={voice}
        onEnded={preview ? undefined : () => { void markVideoSeen(coacheeId); }} />
      <section className="card space-y-3">
        <h2 className="h2">{t.chapters}</h2>
        <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {chaptersFor(type).map((c, i) => (
            <li key={c.id} className="flex min-h-10 items-center gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-bold text-[#7a5520] tabular-nums">{i + 1}</span>
              {c.href && !preview ? <Link href={c.href} className="link">{c[lang]}</Link> : <span>{c[lang]}</span>}
            </li>
          ))}
        </ol>
        {!preview && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-sm text-muted">
            {t.question} <Link href="/mein-bereich/posteingang" className="link font-semibold">{t.toInbox}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
