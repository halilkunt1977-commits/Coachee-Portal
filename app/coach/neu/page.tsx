import NewForm from "./NewForm";

export const metadata = { title: "Neuer Coachee" };

export default function NewCoacheePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Neuer Coachee</h1>
        <p className="text-muted">Lege die Akte an. Lebenslauf, Businessplan und alles Weitere füllt ihr danach gemeinsam.</p>
      </div>
      <NewForm />
    </div>
  );
}
