import { LetterEditor } from "@/components/letter/LetterEditor";
import { ShareButton } from "@/components/teilen/ShareButton";
import { fullName } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { hasFeature } from "@/lib/features";
import { getT } from "@/lib/i18n-server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { letterFor } from "@/lib/letter/store";
import { signatureId } from "@/lib/signature";

export const generateMetadata = async () => ({ title: (await getT())("Anschreiben") });

export default async function LetterPage({ params, searchParams }: PageProps<"/anschreiben/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { app, coachee, stored, auto, color, email, cvId } = await letterFor(user, id);
  const { ansicht } = await searchParams;
  // Auswahl oben: alle Bewerbungen dieses Coachees, zuletzt bearbeitete zuerst
  const applications = await query<{ id: string; title: string; employer: string }>("SELECT id, title, employer FROM applications WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 200", [coachee.id]);
  await audit(user.id, "letter_opened", coachee.id, { application: app.id });
  const coach = user.role === "coach";
  return (
    <LetterEditor
      key={app.id}
      applicationId={app.id}
      coacheeId={coachee.id}
      job={{ title: app.title, employer: app.employer, refnr: app.refnr, contact: app.contact, salutation: app.salutation }}
      applications={applications.map((a) => ({ id: a.id, label: [a.title, a.employer].filter(Boolean).join(" · ") }))}
      email={email}
      cvId={cvId}
      initialMode={ansicht === "email" ? "email" : "brief"}
      auto={auto}
      stored={stored}
      color={color}
      signName={`${coachee.first_name} ${coachee.last_name}`}
      signatureId={await signatureId(coachee.id)}
      coach={coach}
      // Die Schreibhilfe hat der Coach immer, Coachees nur nach Freigabe in der Akte und ohne Hinweis auf die Technik dahinter
      draft={aiEnabled() && (coach || hasFeature(coachee, "anschreiben"))}
      backHref={coach ? `/coach/coachees/${coachee.id}?tab=bewerbungen` : "/mein-bereich/bewerbungen"}
      backLabel={coach ? `${fullName(coachee)} · Bewerbungen` : (await getT())("Meine Bewerbungen")}
      share={<ShareButton kind="anschreiben" refId={app.id} role={user.role} coacheeId={coachee.id} recipient={coachee.first_name} title={[app.title, app.employer].filter(Boolean).join(" · ")} className="btn-ghost" />}
    />
  );
}
