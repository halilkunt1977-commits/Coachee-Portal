import { BruttoNetto } from "@/components/dashboard/BruttoNetto";
import { GruenderWissen, HebesatzCard } from "@/components/dashboard/Gruender";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { setCoacheeCity } from "@/app/actions/dashboard";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { findeHebesatz } from "@/lib/tax/hebesaetze";
import { BUNDESLAENDER, type Bundesland } from "@/lib/tax/lohnsteuer";

export const metadata = { title: "Rechner" };

/** Rechner für Coachees, von der Startseite hierher verlegt: Brutto-Netto (Jobcoaching) bzw. Gewerbesteuer und Gründerwissen */
export default async function Rechner() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  const gruendung = c.coaching_type === "gruendung";
  // Bundesland für den Brutto-Netto-Rechner aus dem Wohnort vorbelegen (Kirchensteuer, Pflegeversicherung in Sachsen)
  const land = findeHebesatz(c.city)?.treffer.land;
  const defaultLand = BUNDESLAENDER.find((b) => b.key === land)?.key as Bundesland | undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Werkzeuge"
        title={gruendung ? "Rechner und Gründerwissen" : "Brutto-Netto-Rechner"}
        back={{ href: "/mein-bereich", label: "Start" }}
        description={gruendung ? "Gewerbesteuer an deinem Ort und das Wichtigste zu Rechtsform und Kleinunternehmerregelung." : "Rechne aus, was vom Gehalt einer Stelle bei dir ankommt."}
      />
      {gruendung ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <HebesatzCard city={c.city} action={setCoacheeCity.bind(null, c.id)} />
          <GruenderWissen />
        </div>
      ) : (
        <div className="max-w-2xl">
          <BruttoNetto defaultLand={defaultLand} />
        </div>
      )}
    </div>
  );
}
