import { PageHeader } from "@/components/shell/AppShell";
import { Notice } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { one } from "@/lib/db";
import type { Grant } from "@/lib/inbox/classify";
import NewForm from "./NewForm";

export const metadata = { title: "Neuer Coachee" };

type Lead = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; city: string | null; coaching_type: "job" | "gruendung" | null; source: string; details: Grant };

export default async function NewCoacheePage({ searchParams }: PageProps<"/coach/neu">) {
  const coach = await requireCoach();
  const { anfrage } = await searchParams;
  // Aus einer Anfrage: Name, Kontakt und Träger schon eingetragen
  const lead =
    typeof anfrage === "string" && /^[0-9a-f-]{36}$/i.test(anfrage)
      ? await one<Lead>("SELECT id, first_name, last_name, email, phone, city, coaching_type, source, details FROM leads WHERE id = $1 AND coach_id = $2", [anfrage, coach.id])
      : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Neue Akte" title="Neuer Coachee" description="Lege die Akte an. Lebenslauf, Businessplan und alles Weitere füllt ihr danach gemeinsam." />
      {lead && <Notice>Aus der Anfrage von {lead.first_name} {lead.last_name} übernommen. Bitte die Angaben prüfen und ergänzen.</Notice>}
      <NewForm
        leadId={lead?.id}
        defaults={
          lead
            ? {
                first_name: lead.first_name,
                last_name: lead.last_name,
                email: lead.email ?? "",
                phone: lead.phone,
                city: lead.city,
                coaching_type: lead.coaching_type ?? undefined,
                traeger: lead.source === "avocons" || lead.source === "erfolgspfad" ? lead.source : null,
                ...(lead.details.voucher_number ? { voucher_number: lead.details.voucher_number, funding: "avgs" as const } : {}),
                ...(lead.details.units_total ? { units_total: lead.details.units_total } : {}),
                ...(lead.details.start_date ? { start_date: lead.details.start_date } : {}),
                ...(lead.details.end_date ? { end_date: lead.details.end_date } : {}),
              }
            : undefined
        }
      />
    </div>
  );
}
