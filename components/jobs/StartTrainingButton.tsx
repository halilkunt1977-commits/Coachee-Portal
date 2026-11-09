"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newTraining } from "@/app/actions/training";
import { useT } from "@/components/i18n/LangProvider";
import { DEFAULT_COUNT, INTERVIEWER, QUESTION_COUNTS, type TrainingLang, type TrainingVoice } from "@/lib/jobs/training-shared";
import { Interviewer } from "./Interviewer";

/** Training starten: Gegenüber (Interviewerin oder Interviewer) und Zahl der Fragen wählen */
export function StartTrainingButton({ appId, again, lang }: { appId: string; again: boolean; lang: TrainingLang }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<TrainingVoice>("f");
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const label = (n: number) => (n === 6 ? t("kurz") : n === 10 ? t("normal") : t("ausführlich"));
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t("Wer führt das Gespräch?")}</p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {(["f", "m"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={voice === v} onClick={() => setVoice(v)} className={`tap overflow-hidden rounded-2xl border-2 text-left transition ${voice === v ? "border-accent" : "border-line-soft hover:border-line"}`}>
              <div className="aspect-[4/3] w-full"><Interviewer voice={v} level={0} /></div>
              <div className="px-3 py-2">
                <span className="block text-sm font-semibold">{INTERVIEWER[v][lang]}</span>
                <span className="block text-xs text-muted">{v === "f" ? t("Interviewerin von Gründarium") : t("Interviewer von Gründarium")}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t("Wie viele Fragen?")}</p>
        <div role="radiogroup" className="inline-flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={`tap rounded-xl border px-3 py-2 text-sm ${count === n ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"}`}>
              <b>{n}</b> <span className={count === n ? "text-white/80" : "text-muted"}>· {label(n)}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await newTraining(appId, { count, voice });
            if (r.ok) router.push(`/mein-bereich/bewerbungen/${appId}/training?t=${r.id}`);
            else setError(t(r.error));
          })
        }
      >
        {busy ? t("Fragen werden vorbereitet …") : again ? t("Neues Training starten") : t("Training starten")}
      </button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
