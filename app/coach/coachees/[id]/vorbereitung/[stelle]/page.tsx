import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureToggle } from "@/components/features/FeatureToggle";
import { InterviewView } from "@/components/jobs/InterviewView";
import { PrintButton } from "@/components/jobs/PrintButton";
import { PageHeader } from "@/components/shell/AppShell";
import { formatDate } from "@/components/ui";
import { coacheeFor, fullName } from "@/lib/access";
import { requireCoach } from "@/lib/auth";
import { one } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { normalizeInterview } from "@/lib/jobs/interview-shared";

export const metadata = { title: "Gesprächsvorbereitung" };

/** Vorschau: die Gesprächsvorbereitung genau so, wie der Coachee sie nach der Freigabe sieht, auch zum Ausdrucken */
export default async function CoachInterviewPreview({ params }: PageProps<"/coach/coachees/[id]/vorbereitung/[stelle]">) {
  const coach = await requireCoach();
  const { id, stelle } = await params;
  const c = await coacheeFor(coach, id);
  if (!/^[0-9a-f-]{36}$/i.test(stelle)) notFound();
  const a = await one<{ id: string; title: string; employer: string; location: string; interview: unknown; interview_seen_at: string | null; sent_at: string | null; changed: boolean }>(
    `SELECT id, title, employer, location, interview, interview_seen_at, interview_sent_at AS sent_at, interview_sent IS DISTINCT FROM interview AS changed
       FROM applications WHERE id = $1 AND coachee_id = $2 AND interview IS NOT NULL`,
    [stelle, c.id],
  );
  if (!a) notFound();
  const released = hasFeature(c, "gespraechsvorbereitung");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/coach/coachees/${c.id}?tab=bewerbungen#vorbereitung-${a.id}`, label: fullName(c) }}
        eyebrow={`Gesprächsvorbereitung · So sieht ${c.first_name} sie`}
        title={a.title}
        description={[a.employer, a.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/coach/coachees/${c.id}?tab=bewerbungen#vorbereitung-${a.id}`} className="btn-ghost btn-sm tap print:hidden">Bearbeiten</Link>
            <PrintButton />
          </>
        }
      />
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
        <p className="min-w-0 text-muted">
          {a.sent_at
            ? `Am ${formatDate(a.sent_at)} an ${c.first_name} geschickt${a.interview_seen_at ? `, am ${formatDate(a.interview_seen_at)} geöffnet` : ", noch nicht geöffnet"}.${a.changed ? ` Seitdem geändert: ${c.first_name} sieht noch die geschickte Fassung, bis du erneut schickst.` : ""}`
            : released
            ? a.interview_seen_at ? `${c.first_name} hat sie am ${formatDate(a.interview_seen_at)} zuerst geöffnet.` : `Freigegeben, ${c.first_name} hat sie noch nicht geöffnet.`
            : `Nur für dich sichtbar, bis du sie ${c.first_name} schickst (unter Bewerbungen bei der Stelle).`}
        </p>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted">Für {c.first_name} freigeben</span>
          <FeatureToggle coacheeId={c.id} feature="gespraechsvorbereitung" on={released} label={`Gesprächsvorbereitung für ${c.first_name}`} showState={false} />
        </span>
      </div>
      <InterviewView interview={normalizeInterview(a.interview)} coachName={coach.name.split(" ")[0]} />
    </div>
  );
}
