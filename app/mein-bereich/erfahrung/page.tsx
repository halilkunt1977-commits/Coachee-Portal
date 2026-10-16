import { PageHeader } from "@/components/shell/AppShell";
import { SurveyPanel } from "@/components/survey/Panel";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Mein Erfahrungsbogen" };

export default async function MySurvey() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Meine Unterlagen" title="Mein Erfahrungsbogen" description="Was hast du in deinen bisherigen Stellen wirklich gemacht? Kreuz es an, dann sieht dein Coach auf einen Blick, was du kannst." />
      <SurveyPanel coachee={c} coach={false} />
    </div>
  );
}
