import { HelpView } from "@/components/erklaervideo/HelpView";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { greetingVoiceEnabled } from "@/lib/greeting-audio";

export const metadata = { title: "So funktioniert dein Portal" };

/** Erklärvideo für den Coachee: begrüßt ihn mit Vornamen, auf Deutsch oder Türkisch, passend zur Coaching-Art */
export default async function Hilfe() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  if (!hasFeature(c, "erklaervideo")) return <Empty>Dieses Video schaltet dein Coach für dich frei.</Empty>;
  return (
    <div className="mx-auto max-w-5xl">
      <HelpView coacheeId={c.id} firstName={c.first_name} type={c.coaching_type} language={c.language} voice={greetingVoiceEnabled()} />
    </div>
  );
}
