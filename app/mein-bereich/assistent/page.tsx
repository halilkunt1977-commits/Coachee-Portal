import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "KI-Assistent" };

export default async function MyAssistant({ searchParams }: PageProps<"/mein-bereich/assistent">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  const { chat } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">KI-Assistent</h1>
        <p className="text-muted">Für Anschreiben, Vorbereitung auf Gespräche und alles, wobei du einen Sparringspartner brauchst.</p>
      </div>
      <AssistantPanel user={user} coachee={c} chatId={typeof chat === "string" ? chat : null} base={{ chat: "/mein-bereich/assistent?chat=", fresh: "/mein-bereich/assistent" }} />
    </div>
  );
}
