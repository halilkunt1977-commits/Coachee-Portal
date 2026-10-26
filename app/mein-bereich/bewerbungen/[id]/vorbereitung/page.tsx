import { notFound } from "next/navigation";
import { InterviewView } from "@/components/jobs/InterviewView";
import { PrintButton } from "@/components/jobs/PrintButton";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { normalizeInterview } from "@/lib/jobs/interview-shared";

export const metadata = { title: "Gesprächsvorbereitung" };

/** Gesprächsvorbereitung für eine Stelle, nur zum Lesen. Nur mit Freigabe des Coachs und nur, wenn er sie erstellt hat. */
export default async function MyInterviewPrep({ params }: PageProps<"/mein-bereich/bewerbungen/[id]/vorbereitung">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c || c.coaching_type !== "job") notFound();
  if (!hasFeature(c, "gespraechsvorbereitung")) return <Empty>Die Gesprächsvorbereitung schaltet dein Coach für dich frei.</Empty>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await one<{ id: string; title: string; employer: string; location: string; interview: unknown; seen: boolean; coach_name: string | null }>(
    `SELECT a.id, a.title, a.employer, a.location, a.interview, a.interview_seen_at IS NOT NULL AS seen, u.name AS coach_name
       FROM applications a JOIN coachees c ON c.id = a.coachee_id LEFT JOIN users u ON u.id = c.coach_id
      WHERE a.id = $1 AND a.coachee_id = $2 AND a.interview IS NOT NULL`,
    [id, c.id],
  );
  if (!a) notFound();
  // Für die Übersicht des Coachs: zuerst geöffnet am
  if (!a.seen) await query("UPDATE applications SET interview_seen_at = now() WHERE id = $1 AND interview_seen_at IS NULL", [a.id]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/mein-bereich/bewerbungen?stelle=${a.id}`, label: "Meine Bewerbungen" }}
        eyebrow="Gesprächsvorbereitung"
        title={a.title}
        description={`${[a.employer, a.location].filter(Boolean).join(" · ")}${a.employer || a.location ? ". " : ""}Lies dir alles in Ruhe durch und sprich die Antworten ein paarmal laut. Sag sie in deinen eigenen Worten, nicht auswendig gelernt.`}
        actions={<PrintButton />}
      />
      <InterviewView interview={normalizeInterview(a.interview)} coachName={a.coach_name?.split(" ")[0] || "deinem Coach"} />
    </div>
  );
}
