import { PageHeader } from "@/components/shell/AppShell";
import { notFound } from "next/navigation";
import { StellenPanel } from "@/components/jobs/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Stellen finden") });

export default async function MyJobs() {
  const user = await requireUser("coachee");
  const t = await getT();
  const c = await ownCoachee(user);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  if (c.coaching_type !== "job") notFound();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Meine Jobsuche")} title={t("Stellen finden")} description={t("Aktuelle Stellen aus der Jobbörse der Arbeitsagentur und weiteren Jobbörsen. Merk dir, was dich interessiert, dann landet es in deinen Bewerbungen.")} />
      <StellenPanel user={user} coachee={c} links={{ search: "/mein-bereich/stellen", tracker: "/mein-bereich/bewerbungen" }} />
    </div>
  );
}
