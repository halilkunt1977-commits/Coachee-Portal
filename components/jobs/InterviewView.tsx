import { getT } from "@/lib/i18n-server";
import { LIST_SECTIONS, type Interview } from "@/lib/jobs/interview-shared";

/*
 * Gesprächsvorbereitung zum Lesen: für den Coachee (nach Freigabe) und als Vorschau für den Coach. Nur Text, nichts zum Bearbeiten,
 * auch zum Ausdrucken. Ohne Hinweis darauf, wie die Vorbereitung entstanden ist.
 */
export async function InterviewView({ interview: i, coachName }: { interview: Interview; coachName: string }) {
  const t = await getT();
  return (
    <div className="space-y-5">
      {i.coach && (
        <section className="card space-y-2 border-l-4 border-accent print:break-inside-avoid">
          <h2 className="h2">{t("Empfehlungen von {name}", { name: coachName })}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{i.coach}</p>
        </section>
      )}
      {i.focus && (
        <section className="card space-y-2 print:break-inside-avoid">
          <h2 className="h2">{t("Worauf es ankommt")}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{i.focus}</p>
        </section>
      )}
      {i.questions.length > 0 && (
        <section className="space-y-3">
          <h2 className="h2">{t("Fragen, die kommen können")}</h2>
          <ol className="space-y-3">
            {i.questions.map((q, n) => (
              <li key={n} className="card space-y-2 text-sm print:break-inside-avoid">
                <p className="font-semibold">
                  <span className="mr-1.5 text-accent tabular-nums">{n + 1}.</span>
                  {q.question}
                </p>
                {q.answer && (
                  <div className="rounded-lg bg-tint/50 px-3 py-2">
                    <p className="text-xs font-semibold text-accent">{t("So kannst du antworten")}</p>
                    <p className="whitespace-pre-line leading-relaxed">{q.answer}</p>
                  </div>
                )}
                {q.tips && (
                  <p className="text-muted"><span className="font-semibold text-ink">{t("Tipp:")} </span>{q.tips}</p>
                )}
                {q.followups.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted">{t("Mögliche Nachfragen")}</p>
                    <ul className="list-disc space-y-0.5 pl-5">{q.followups.map((f, k) => <li key={k}>{f}</li>)}</ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {LIST_SECTIONS.map((s) =>
          i[s.key].length ? (
            <section key={s.key} className="card space-y-1.5 text-sm print:break-inside-avoid">
              <h2 className="font-semibold">{t(s.title)}</h2>
              <ul className="list-disc space-y-1 pl-5">{i[s.key].map((x, k) => <li key={k}>{x}</li>)}</ul>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
