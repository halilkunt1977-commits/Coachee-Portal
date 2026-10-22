import { MessageForm } from "@/components/akte/MessageForm";
import { SetupHint } from "@/components/coach/SetupHint";
import { CopyLink } from "@/components/erklaervideo/CopyLink";
import { HelpView } from "@/components/erklaervideo/HelpView";
import { PageHeader } from "@/components/shell/AppShell";
import { formatDate } from "@/components/ui";
import { coacheeFor, fullName, typeLabel } from "@/lib/access";
import { requireCoach } from "@/lib/auth";
import { HELP_PATH, LANGUAGE_LABEL, videoMessage } from "@/lib/erklaervideo";
import { greetingVoiceEnabled } from "@/lib/greeting-audio";
import { portalUrl } from "@/lib/mail";

export const metadata = { title: "Erklärvideo" };

/** Vorschau: das Erklärvideo genau so, wie der Coachee es sieht (Vorname, Sprache, Coaching-Art), und zum Weiterschicken */
export default async function CoachVideoPreview({ params }: PageProps<"/coach/coachees/[id]/erklaervideo">) {
  const coach = await requireCoach();
  const { id } = await params;
  const c = await coacheeFor(coach, id);
  const voice = greetingVoiceEnabled();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: `/coach/coachees/${c.id}`, label: fullName(c) }}
        eyebrow="Erklärvideo"
        title={`So sieht ${c.first_name} das Video`}
        description={`${typeLabel[c.coaching_type]}, auf ${LANGUAGE_LABEL[c.language]}. ${c.first_name} findet es im Menü unter „So funktioniert’s“ und, bis es angesehen ist, oben auf der Startseite.`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <HelpView coacheeId={c.id} firstName={c.first_name} type={c.coaching_type} language={c.language} voice={voice} preview />
        <div className="space-y-4">
          <section className="card space-y-2 text-sm">
            <h2 className="h2">Stand</h2>
            <p>{c.video_seen_at ? `${c.first_name} hat das Video am ${formatDate(c.video_seen_at)} bis zum Ende angesehen.` : `${c.first_name} hat das Video noch nicht bis zum Ende angesehen.`}</p>
            <p className="text-muted">Die Sprache hier umzustellen, ändert sie auch für {c.first_name}.</p>
            {!voice && (
              <div className="text-muted">
                <p>Die Begrüßung erscheint gerade als Text auf der Titelkarte, ohne gesprochenen Gruß.</p>
                <SetupHint>Für die gesprochene Begrüßung in den Einstellungen der App ELEVENLABS_API_KEY eintragen (optional ELEVENLABS_VOICE_DE, ELEVENLABS_VOICE_TR, ELEVENLABS_MODEL), dann neu starten. Übermittelt wird nur der Begrüßungssatz mit dem Vornamen.</SetupHint>
              </div>
            )}
          </section>
          <section className="card space-y-3">
            <h2 className="h2">An {c.first_name} schicken</h2>
            {c.user_id ? (
              <>
                <p className="text-sm text-muted">Als Nachricht in den Posteingang. Du kannst den Text vorher ändern.</p>
                <MessageForm key={c.language} coacheeId={c.id} defaultValue={videoMessage(c.language)} />
              </>
            ) : (
              <p className="text-sm text-muted">{c.first_name} hat noch keinen Zugang zum Portal.</p>
            )}
            <div className="space-y-1.5 border-t border-line-soft pt-3">
              <p className="text-sm text-muted">Oder den Link selbst weitergeben (funktioniert nach der Anmeldung):</p>
              <CopyLink link={portalUrl(HELP_PATH)} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
