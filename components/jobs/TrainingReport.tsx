import type { TrainingRow } from "@/lib/jobs/training-shared";
import { speechStats } from "@/lib/jobs/training-shared";

/*
 * Auswertung eines Interview-Trainings. Coachee (übersetzte Überschriften über t) und Coach (Deutsch) sehen dieselbe
 * Ansicht; der Text der Auswertung steht schon in der Sprache des Coachees.
 */
type T = (s: string, v?: Record<string, string | number>) => string;

const tone = (n: number) => (n >= 75 ? "text-ok" : n >= 50 ? "text-gold" : "text-danger");

export function TrainingReportView({ training, t }: { training: TrainingRow; t: T }) {
  const r = training.report;
  if (!r) return null;
  const lang = training.feedback_lang;
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-5">
        <div className={`grid size-24 shrink-0 place-items-center rounded-full border-4 border-current ${tone(r.score)}`}>
          <span className="text-3xl font-bold">{r.score}</span>
        </div>
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Gesamteindruck")}</p>
          <p lang={lang} className="leading-relaxed">{r.summary}</p>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Box title={t("Das war gut")} items={r.strengths} lang={lang} mark="✓" cls="text-ok" />
        <Box title={t("Das übst du als Nächstes")} items={r.improve} lang={lang} mark="→" cls="text-accent" />
        <section className="card space-y-1">
          <h3 className="font-semibold">{t("Mimik und Auftreten")}</h3>
          <p lang={lang} className="text-sm leading-relaxed">{r.body}</p>
        </section>
        <section className="card space-y-1">
          <h3 className="font-semibold">{t("Sprechweise")}</h3>
          <p lang={lang} className="text-sm leading-relaxed">{r.speech}</p>
        </section>
      </div>
      <section className="space-y-3">
        <h3 className="h2">{t("Deine Antworten")}</h3>
        {training.questions.map((q, i) => {
          const a = training.answers?.[i];
          const ar = r.answers[i];
          const s = a ? speechStats(a.text, a.seconds, training.interview_lang) : null;
          return (
            <details key={i} className="card group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className={`mt-0.5 w-10 shrink-0 text-right font-bold ${ar ? tone(ar.score) : "text-muted"}`}>{ar?.score ?? "–"}</span>
                <span lang={training.interview_lang} className="min-w-0 flex-1 font-semibold">{q}</span>
                <span className="text-muted transition group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 space-y-3 pl-13 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("Deine Antwort")}
                    {a && s ? ` · ${a.seconds} s · ${t("{n} Wörter/Min.", { n: s.wpm })}` : ""}
                  </p>
                  <p lang={training.interview_lang} className="italic text-muted">{a?.text || t("(keine Antwort)")}</p>
                </div>
                {ar?.good && <p lang={lang}><b className="text-ok">✓ </b>{ar.good}</p>}
                {ar?.improve && <p lang={lang}><b className="text-accent">→ </b>{ar.improve}</p>}
                {ar?.better && (
                  <div className="rounded-xl bg-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("So kannst du es sagen")}</p>
                    <p lang={training.interview_lang} className="leading-relaxed">{ar.better}</p>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

function Box({ title, items, lang, mark, cls }: { title: string; items: string[]; lang: string; mark: string; cls: string }) {
  return (
    <section className="card space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2" lang={lang}><span className={`${cls} font-bold`}>{mark}</span><span className="min-w-0">{x}</span></li>
        ))}
      </ul>
    </section>
  );
}
