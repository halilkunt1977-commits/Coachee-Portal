import { BruttoNetto } from "@/components/dashboard/BruttoNetto";
import { GruenderWissen, HebesatzCard } from "@/components/dashboard/Gruender";
import { FoerderCard } from "@/components/handbuch/FoerderCard";
import { EINSTIEGSGELD, GRUENDUNGSZUSCHUSS } from "@/lib/handbuch/foerderung";
import { PageHeader } from "@/components/shell/AppShell";
import { requireCoach } from "@/lib/auth";

export const metadata = { title: "Rechner & Wissen" };

/** Alles, was Coachees auf ihrer Startseite haben, für den Coach an einem Ort: Brutto-Netto, Gewerbesteuer je Ort, Gründungsförderung, Gründerwissen */
export default async function CoachTools({ searchParams }: PageProps<"/coach/werkzeuge">) {
  await requireCoach();
  const sp = await searchParams;
  const ort = typeof sp.ort === "string" ? sp.ort.trim().slice(0, 80) : "";
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Werkzeuge" title="Rechner & Wissen" description="Die Rechner und Infos von den Startseiten deiner Coachees, für Gespräche und zum schnellen Nachrechnen." />
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Jobcoaching</h2>
        <BruttoNetto />
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Existenzgründung</h2>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <FoerderCard info={GRUENDUNGSZUSCHUSS} you={false} />
          <FoerderCard info={EINSTIEGSGELD} you={false} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <HebesatzCard city={ort || null} title="Gewerbesteuer nach Ort" />
          <GruenderWissen />
        </div>
      </section>
    </div>
  );
}
