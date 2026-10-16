import { notFound } from "next/navigation";
import { StellenPanel } from "@/components/jobs/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Stellen finden" };

export default async function MyJobs() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  if (c.coaching_type !== "job") notFound();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Stellen finden</h1>
        <p className="text-muted">Aktuelle Stellen aus der Jobbörse der Arbeitsagentur. Merk dir, was dich interessiert, dann landet es in deinen Bewerbungen.</p>
      </div>
      <StellenPanel user={user} coachee={c} links={{ search: "/mein-bereich/stellen", tracker: "/mein-bereich/bewerbungen" }} />
    </div>
  );
}
