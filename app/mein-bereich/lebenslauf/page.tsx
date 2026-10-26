import { PageHeader } from "@/components/shell/AppShell";
import { CvList } from "@/components/cv/CvList";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { OwnContactForm } from "@/components/cv/OwnContactForm";
import { germanDate } from "@/lib/cv/types";

export const metadata = { title: "Mein Lebenslauf" };

export default async function MyCvs() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Meine Unterlagen" title="Mein Lebenslauf" description="Felder ausfüllen, Design und Farbe wählen, als PDF herunterladen. Dein Coach sieht den Lebenslauf und kann mit dir daran arbeiten." />
      <CvList
        coacheeId={c.id}
        coach={false}
        importAllowed={hasFeature(c, "lebenslauf_import")}
        aside={
          <div className="card space-y-3">
            <h2 className="h2">Meine Daten</h2>
            <OwnContactForm name={`${c.first_name} ${c.last_name}`} email={c.email} phone={c.phone ?? ""} birthDate={germanDate(c.birth_date) || null} />
          </div>
        }
      />
    </div>
  );
}
