import { PageHeader } from "@/components/shell/AppShell";
import { notFound } from "next/navigation";
import { FinancePanel } from "@/components/bp/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";

export const generateMetadata = async () => ({ title: (await getT())("Mein Finanzplan") });

export default async function MyFinance() {
  const user = await requireUser("coachee");
  const [c, t] = await Promise.all([ownCoachee(user), getT()]);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  if (c.coaching_type !== "gruendung") notFound();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Meine Gründung")} title={t("Mein Finanzplan")} description={t("Dein Coach erstellt deinen Finanzplan. Hier siehst du die wichtigsten Zahlen und kannst den ganzen Plan als Excel oder zusammen mit dem Businessplan öffnen.")} />
      <FinancePanel user={user} coachee={c} links={{ plan: "/mein-bereich/businessplan", finance: "/mein-bereich/finanzplan", zahlen: null }} />
    </div>
  );
}
