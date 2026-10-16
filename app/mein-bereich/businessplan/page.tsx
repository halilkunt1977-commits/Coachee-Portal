import { notFound } from "next/navigation";
import { PlanPanel } from "@/components/bp/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Mein Businessplan" };

export default async function MyPlan() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  if (c.coaching_type !== "gruendung") notFound();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Mein Businessplan</h1>
        <p className="text-muted">Abschnitt für Abschnitt, mit Leitfragen und KI-Hilfe. Dein Coach sieht jede Änderung und arbeitet mit dir daran. Alles wird automatisch gespeichert.</p>
      </div>
      <PlanPanel user={user} coachee={c} links={{ plan: "/mein-bereich/businessplan", finance: "/mein-bereich/finanzplan", zahlen: null }} />
    </div>
  );
}
