import { CvList } from "@/components/cv/CvList";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Mein Lebenslauf" };

export default async function MyCvs() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Mein Lebenslauf</h1>
        <p className="text-muted">Felder ausfüllen, Design und Farbe wählen, als PDF herunterladen. Dein Coach sieht den Lebenslauf und kann mit dir daran arbeiten.</p>
      </div>
      <CvList coacheeId={c.id} coach={false} />
    </div>
  );
}
