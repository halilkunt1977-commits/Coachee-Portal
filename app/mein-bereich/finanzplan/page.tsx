import { notFound } from "next/navigation";
import { FinancePanel } from "@/components/bp/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Mein Finanzplan" };

export default async function MyFinance() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  if (c.coaching_type !== "gruendung") notFound();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Mein Finanzplan</h1>
        <p className="text-muted">Kapitalbedarf, Finanzierung, Umsatz und Kosten eintragen. Rentabilität und Liquidität für drei Jahre rechnen sich sofort mit, als Excel oder zusammen mit dem Businessplan als PDF.</p>
      </div>
      <FinancePanel user={user} coachee={c} links={{ plan: "/mein-bereich/businessplan", finance: "/mein-bereich/finanzplan", zahlen: null }} />
    </div>
  );
}
