import { after } from "next/server";
import { notFound } from "next/navigation";
import { InterviewView } from "@/components/jobs/InterviewView";
import { PrintButton } from "@/components/jobs/PrintButton";
import { SelfPrepButton } from "@/components/jobs/SelfPrepButton";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { getT } from "@/lib/i18n-server";
import { normalizeInterview } from "@/lib/jobs/interview-shared";
import { ensureInterviewTr, trFor } from "@/lib/jobs/interview-tr";

export const generateMetadata = async () => ({ title: (await getT())("Gesprächsvorbereitung") });

/**
 * Gesprächsvorbereitung für eine Stelle, nur zum Lesen: die Fassung, die der Coach geschickt hat, sonst mit Freigabe
 * „gespraechsvorbereitung“ die zuletzt gespeicherte.
 */
export default async function MyInterviewPrep({ params }: PageProps<"/mein-bereich/bewerbungen/[id]/vorbereitung">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c || c.coaching_type !== "job") notFound();
  const t = await getT();
  const self = hasFeature(c, "gespraechsvorbereitung_selbst");
  const released = hasFeature(c, "gespraechsvorbereitung") || self;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await one<{ id: string; title: string; employer: string; location: string; interview: unknown; interview_tr: unknown; seen: boolean; coach_name: string | null }>(
    `SELECT a.id, a.title, a.employer, a.location, COALESCE(a.interview_sent, CASE WHEN $3 THEN a.interview END) AS interview, a.interview_tr,
            a.interview_seen_at IS NOT NULL AS seen, u.name AS coach_name
       FROM applications a JOIN coachees c ON c.id = a.coachee_id LEFT JOIN users u ON u.id = c.coach_id
      WHERE a.id = $1 AND a.coachee_id = $2`,
    [id, c.id, released],
  );
  if (!a) notFound();
  if (!a.interview && !self) return <Empty>{t("Die Gesprächsvorbereitung für diese Stelle bekommst du von deinem Coach.")}</Empty>;
  if (!a.interview)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader back={{ href: `/mein-bereich/bewerbungen?stelle=${a.id}`, label: t("Meine Bewerbungen") }} eyebrow={t("Gesprächsvorbereitung")} title={a.title} description={[a.employer, a.location].filter(Boolean).join(" · ")} />
        <section className="card space-y-3">
          <p className="text-sm">{t("Lass dir eine Vorbereitung auf das Vorstellungsgespräch für diese Stelle erstellen: Fragen, die kommen können, mit Antwortvorschlägen, Tipps zum Auftreten und Fragen an den Arbeitgeber.")}</p>
          <SelfPrepButton appId={a.id} again={false} />
        </section>
      </div>
    );
  // Für die Übersicht des Coachs: zuerst geöffnet am
  if (!a.seen) await query("UPDATE applications SET interview_seen_at = now() WHERE id = $1 AND interview_seen_at IS NULL", [a.id]);
  const interview = normalizeInterview(a.interview);
  // Türkische Oberfläche: Übersetzung unter dem deutschen Text; fehlt sie noch, entsteht sie im Hintergrund
  const tr = c.language === "tr" ? trFor(a.interview_tr, interview) : null;
  if (c.language === "tr" && !tr) after(() => ensureInterviewTr(c, a.id, user.id));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/mein-bereich/bewerbungen?stelle=${a.id}`, label: t("Meine Bewerbungen") }}
        eyebrow={t("Gesprächsvorbereitung")}
        title={a.title}
        description={`${[a.employer, a.location].filter(Boolean).join(" · ")}${a.employer || a.location ? ". " : ""}${t("Lies dir alles in Ruhe durch und sprich die Antworten ein paarmal laut. Sag sie in deinen eigenen Worten, nicht auswendig gelernt.")}`}
        actions={<>{self && <SelfPrepButton appId={a.id} again />}<PrintButton /></>}
      />
      {c.language === "tr" && !tr && <p className="card mb-4 text-sm text-muted">{t("Die türkische Übersetzung wird gerade vorbereitet. Lade die Seite in ein paar Minuten neu.")}</p>}
      <InterviewView interview={interview} tr={tr} coachName={a.coach_name?.split(" ")[0] || t("deinem Coach")} />
    </div>
  );
}
