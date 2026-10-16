import { notFound } from "next/navigation";
import { BewerbungenPanel } from "@/components/jobs/Panels";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Meine Bewerbungen" };

export default async function MyApplications() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  if (c.coaching_type !== "job") notFound();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Meine Bewerbungen</h1>
        <p className="text-muted">Vorschläge deines Coachs, gemerkte Stellen und alle Bewerbungen an einem Ort. Dein Coach sieht denselben Stand. Den Nachweis deiner Bewerbungen kannst du als PDF herunterladen.</p>
      </div>
      <BewerbungenPanel user={user} coachee={c} links={{ search: "/mein-bereich/stellen", tracker: "/mein-bereich/bewerbungen" }} />
    </div>
  );
}
