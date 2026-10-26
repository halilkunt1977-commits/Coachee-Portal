import { PageHeader } from "@/components/shell/AppShell";
import { SurveyPanel } from "@/components/survey/Panel";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Mein Erfahrungsbogen") });

export default async function MySurvey() {
  const user = await requireUser("coachee");
  const [c, t] = await Promise.all([ownCoachee(user), getT()]);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Meine Unterlagen")} title={t("Mein Erfahrungsbogen")} description={t("Was hast du in deinen bisherigen Stellen wirklich gemacht? Kreuz es an, dann sieht dein Coach auf einen Blick, was du kannst.")} />
      <SurveyPanel coachee={c} coach={false} />
    </div>
  );
}
