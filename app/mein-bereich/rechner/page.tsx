import { BruttoNetto } from "@/components/dashboard/BruttoNetto";
import { GruenderWissen, HebesatzCard } from "@/components/dashboard/Gruender";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { setCoacheeCity } from "@/app/actions/dashboard";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { findeHebesatz } from "@/lib/tax/hebesaetze";
import { BUNDESLAENDER, type Bundesland } from "@/lib/tax/lohnsteuer";

export const generateMetadata = async () => ({ title: (await getT())("Rechner") });

/** Rechner für Coachees, von der Startseite hierher verlegt: Brutto-Netto (Jobcoaching) bzw. Gewerbesteuer und Gründerwissen */
export default async function Rechner() {
  const user = await requireUser("coachee");
  const [c, t] = await Promise.all([ownCoachee(user), getT()]);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;
  const gruendung = c.coaching_type === "gruendung";
  // Bundesland für den Brutto-Netto-Rechner aus dem Wohnort vorbelegen (Kirchensteuer, Pflegeversicherung in Sachsen)
  const land = findeHebesatz(c.city)?.treffer.land;
  const defaultLand = BUNDESLAENDER.find((b) => b.key === land)?.key as Bundesland | undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Werkzeuge")}
        title={gruendung ? t("Rechner und Gründerwissen") : t("Brutto-Netto-Rechner")}
        back={{ href: "/mein-bereich", label: t("Start") }}
        description={gruendung ? t("Gewerbesteuer an deinem Ort und das Wichtigste zu Rechtsform und Kleinunternehmerregelung.") : t("Rechne aus, was vom Gehalt einer Stelle bei dir ankommt.")}
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
