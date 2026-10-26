import { PageHeader } from "@/components/shell/AppShell";
import { notFound } from "next/navigation";
import { BewerbungenPanel } from "@/components/jobs/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Meine Bewerbungen") });

export default async function MyApplications({ searchParams }: PageProps<"/mein-bereich/bewerbungen">) {
  const user = await requireUser("coachee");
  const t = await getT();
  const c = await ownCoachee(user);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  if (c.coaching_type !== "job") notFound();
  const { stelle } = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Meine Jobsuche")} title={t("Meine Bewerbungen")} description={t("Vorschläge deines Coachs, gemerkte Stellen und alle Bewerbungen an einem Ort. Dein Coach sieht denselben Stand. Den Nachweis deiner Bewerbungen kannst du als PDF herunterladen.")} />
      <BewerbungenPanel user={user} coachee={c} links={{ search: "/mein-bereich/stellen", tracker: "/mein-bereich/bewerbungen" }} focus={typeof stelle === "string" ? stelle : null} />
    </div>
  );
}
