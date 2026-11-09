"use client";
import { useState, useTransition } from "react";
import { textTurkish } from "@/app/actions/uebersetzen";
import { useLang, useT } from "@/components/i18n/LangProvider";

/*
 * Türkische Fassung unter Brieftext und E-Mail, nur für Coachees mit türkischer Oberfläche. Der Text an den
 * Arbeitgeber bleibt deutsch; die Übersetzung ist zum Verstehen. Ändert sich der Text, kann neu übersetzt werden.
 */
export function TrBox({ text, coach }: { text: string; coach: boolean }) {
  const t = useT();
  const lang = useLang();
  const [res, setRes] = useState<{ src: string; tr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  if (coach || lang !== "tr" || !text.trim()) return null;

  const stale = res !== null && res.src !== text;
  const run = () =>
    start(async () => {
      setError(null);
      const src = text;
      const r = await textTurkish(src);
      if (r.ok) {
        setRes({ src, tr: r.tr });
        setOpen(true);
      } else setError(t(r.error));
    });

  return (
    <div className="space-y-2 rounded-xl bg-bg p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {res && !stale ? (
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? t("Türkische Fassung ausblenden") : t("Türkische Fassung zeigen")}
          </button>
        ) : (
          <button type="button" className="text-sm font-semibold text-accent hover:underline disabled:opacity-50" disabled={busy} onClick={run}>
            {busy ? t("Wird übersetzt …") : stale ? t("Text geändert: neu übersetzen") : t("Türkische Fassung zeigen")}
          </button>
        )}
        <span className="text-xs text-muted">{t("Nur zum Verstehen. An den Arbeitgeber geht der deutsche Text.")}</span>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {res && open && (
        <p lang="tr" className={`whitespace-pre-line border-l-2 border-gold/60 pl-3 text-sm italic leading-relaxed text-muted ${stale ? "opacity-60" : ""}`}>
          {res.tr}
        </p>
      )}
    </div>
  );
}
