import { LetterEditor } from "@/components/letter/LetterEditor";
import { ShareButton } from "@/components/teilen/ShareButton";
import { fullName } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { audit, requireUser } from "@/lib/auth";
import { letterFor } from "@/lib/letter/store";
import { signatureId } from "@/lib/signature";

export const metadata = { title: "Anschreiben" };

export default async function LetterPage({ params }: PageProps<"/anschreiben/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { app, coachee, stored, auto, color } = await letterFor(user, id);
  await audit(user.id, "letter_opened", coachee.id, { application: app.id });
  const coach = user.role === "coach";
  return (
    <LetterEditor
      applicationId={app.id}
      coacheeId={coachee.id}
      job={{ title: app.title, employer: app.employer }}
      auto={auto}
      stored={stored}
      color={color}
      signatureId={await signatureId(coachee.id)}
      coach={coach}
      // Die Schreibhilfe hat der Coach immer, Coachees nur nach Freigabe in der Akte und ohne Hinweis auf die Technik dahinter
      draft={aiEnabled() && (coach || coachee.letter_help)}
      backHref={coach ? `/coach/coachees/${coachee.id}?tab=bewerbungen` : "/mein-bereich/bewerbungen"}
      backLabel={coach ? `${fullName(coachee)} · Bewerbungen` : "Meine Bewerbungen"}
      share={<ShareButton kind="anschreiben" refId={app.id} role={user.role} coacheeId={coachee.id} recipient={coachee.first_name} title={[app.title, app.employer].filter(Boolean).join(" · ")} className="btn-ghost" />}
    />
  );
}
