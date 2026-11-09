import { notFound } from "next/navigation";
import { StartTrainingButton } from "@/components/jobs/StartTrainingButton";
import { TrainingReportView } from "@/components/jobs/TrainingReport";
import { TrainingRoom } from "@/components/jobs/TrainingRoom";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { getT } from "@/lib/i18n-server";
import { loadTraining, trainingLangFor, trainingsFor } from "@/lib/jobs/training";

export const generateMetadata = async () => ({ title: (await getT())("Interview-Training") });

const dateFmt = (d: string, lang: string) => new Date(d).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Interview-Training für eine Stelle: starten, üben, Auswertungen ansehen */
export default async function TrainingPage({ params, searchParams }: PageProps<"/mein-bereich/bewerbungen/[id]/training">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c || c.coaching_type !== "job") notFound();
  const t = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const app = await one<{ id: string; title: string; employer: string; location: string }>("SELECT id, title, employer, location FROM applications WHERE id = $1 AND coachee_id = $2", [id, c.id]);
  if (!app) notFound();
  if (!hasFeature(c, "interview_training")) return <Empty>{t("Diese Funktion hat dein Coach für dich noch nicht freigeschaltet.")}</Empty>;
  const sp = await searchParams;
  const tid = typeof sp.t === "string" ? sp.t : null;
  const current = tid ? await loadTraining(c, tid) : null;
  const header = (
    <PageHeader
      back={{ href: `/mein-bereich/bewerbungen?stelle=${app.id}`, label: t("Meine Bewerbungen") }}
      eyebrow={t("Interview-Training")}
      title={app.title}
      description={[app.employer, app.location].filter(Boolean).join(" · ")}
    />
  );

  // Laufendes Training
  if (current && !current.report && current.application_id === app.id) {
    const answered = (current.answers ?? []).filter((a) => a && (a.text || a.seconds)).length;
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {header}
        <TrainingRoom trainingId={current.id} questions={current.questions} lang={current.interview_lang} voice={current.voice} startAt={answered} />
      </div>
    );
  }

  const past = await trainingsFor(c.id, app.id);
  const shown = current?.report ? current : past[0] ?? null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {header}
      <section className="card space-y-3">
        <p className="text-sm">{t("Übe das Vorstellungsgespräch für diese Stelle vor der Kamera: Du bekommst Fragen wie im echten Gespräch und antwortest laut. Danach siehst du, was gut war, was du üben kannst, und wie du vor der Kamera wirkst.")}</p>
        <p className="text-xs text-muted">{t("Dein Bild bleibt auf deinem Gerät und wird nicht übertragen oder gespeichert. Deine Antworten werden in Text umgewandelt, die Aufnahme selbst wird nicht gespeichert. Dein Coach sieht die Auswertung.")}</p>
        <StartTrainingButton appId={app.id} again={past.length > 0} lang={await trainingLangFor(c, app.id)} />
      </section>
      {shown && (
        <section className="space-y-3">
          <h2 className="h2">{t("Auswertung vom {datum}", { datum: dateFmt(shown.finished_at ?? shown.created_at, c.language) })}</h2>
          <TrainingReportView training={shown} t={t} />
        </section>
      )}
      {past.length > 1 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{t("Frühere Trainings")}</h2>
          <ul className="space-y-1 text-sm">
            {past.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <a className="text-accent hover:underline" href={`?t=${p.id}`}>{dateFmt(p.finished_at ?? p.created_at, c.language)}</a>
                <span className="font-semibold">{p.report?.score ?? "–"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
