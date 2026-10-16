import { PageHeader } from "@/components/shell/AppShell";
import NewForm from "./NewForm";

export const metadata = { title: "Neuer Coachee" };

export default function NewCoacheePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Neue Akte" title="Neuer Coachee" description="Lege die Akte an. Lebenslauf, Businessplan und alles Weitere füllt ihr danach gemeinsam." />
      <NewForm />
    </div>
  );
}
