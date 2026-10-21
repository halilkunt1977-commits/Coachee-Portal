import { CvEditor } from "@/components/cv/CvEditor";
import { ShareButton } from "@/components/teilen/ShareButton";
import { aiEnabled } from "@/lib/ai";
import { fullName } from "@/lib/access";
import { audit, requireUser } from "@/lib/auth";
import { cvFor, personalLockOf } from "@/lib/cv/store";
import { signatureId } from "@/lib/signature";

export const metadata = { title: "Lebenslauf bearbeiten" };

export default async function CvPage({ params }: PageProps<"/lebenslauf/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { cv, coachee } = await cvFor(user, id);
  await audit(user.id, "cv_opened", coachee.id, { cv: cv.id });
  const coach = user.role === "coach";
  return (
    <CvEditor
      key={`${cv.id}-${cv.version}`}
      cvId={cv.id}
      coacheeId={coachee.id}
      signatureId={await signatureId(coachee.id)}
      initial={{ name: cv.name, template: cv.template, color: cv.color, data: cv.data, version: cv.version, photoId: cv.photo_file_id }}
      ai={aiEnabled() && coach}
      backHref={coach ? `/coach/coachees/${coachee.id}?tab=lebenslauf` : "/mein-bereich/lebenslauf"}
      backLabel={coach ? fullName(coachee) : "Meine Lebensläufe"}
      locked={coach ? null : personalLockOf(coachee)}
      share={<ShareButton kind="lebenslauf" refId={cv.id} role={user.role} coacheeId={coachee.id} recipient={coachee.first_name} title={cv.name} className="btn-ghost" />}
    />
  );
}
