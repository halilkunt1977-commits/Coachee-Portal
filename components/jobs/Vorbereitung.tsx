import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { query } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { normalizeInterview } from "@/lib/jobs/interview-shared";
import { statusLabel } from "@/lib/jobs/shared";
import { FeatureToggle } from "../features/FeatureToggle";
import { InterviewEditor } from "./InterviewEditor";

/*
 * Gesprächsvorbereitung im Reiter „Bewerbungen“ der Akte: je Stelle ein Skript fürs Vorstellungsgespräch, das der Coach
 * erstellt, mit KI bearbeitet und dem Coachee schickt. Mit Freigabe sieht der Coachee auch Ungeschicktes, unter Bewerbungen bei der Stelle.
 */
type Row = {
  id: string; title: string; employer: string; location: string; status: string; interview: unknown; interview_updated_at: string | null; interview_seen_at: string | null;
  job_text: string; interview_brief: string; interview_sent_at: string | null; changed: boolean;
};

export async function GespraechsVorbereitung({ coachee: c }: { coachee: Coachee }) {
  const apps = await query<Row>(
    `SELECT id, title, employer, location, status, interview, interview_updated_at, interview_seen_at,
            CASE WHEN job_text <> '' THEN job_text ELSE coalesce(letter->>'adText', '') END AS job_text, interview_brief, interview_sent_at,
            (interview_sent IS NOT NULL AND interview_sent IS DISTINCT FROM interview) AS changed
       FROM applications WHERE coachee_id = $1 AND (status IN ('gemerkt', 'beworben', 'gespraech') OR interview IS NOT NULL)
      ORDER BY CASE status WHEN 'gespraech' THEN 0 WHEN 'beworben' THEN 1 WHEN 'gemerkt' THEN 2 ELSE 3 END, created_at DESC`,
    [c.id],
  );
  const released = hasFeature(c, "gespraechsvorbereitung");
  const ai = aiEnabled();
  return (
    <section id="vorbereitung" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="h2">Gesprächsvorbereitung</h2>
          <p className="text-sm text-muted">
            Je Stelle: Fragen des Arbeitgebers mit Antwortvorschlag, mögliche Nachfragen, Auftreten und Fragen an den Arbeitgeber, dazu deine Empfehlungen.
            {` Nur für dich, bis du sie ${c.first_name} schickst: Dann bekommt ${c.first_name} genau diese Fassung als Nachricht.`}
            {released ? ` Freigegeben: ${c.first_name} sieht außerdem jede gespeicherte Vorbereitung, die du noch nicht geschickt hast.` : ""}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2">
          <span className="text-sm">Für {c.first_name} freigeben</span>
          <FeatureToggle coacheeId={c.id} feature="gespraechsvorbereitung" on={released} label={`Gesprächsvorbereitung für ${c.first_name}`} showState={false} />
        </span>
      </div>
      {!ai && <p className="card text-sm text-muted">Die KI ist noch nicht eingerichtet. Du kannst die Vorbereitung trotzdem selbst schreiben. Der Zugang zur KI muss auf dem Server hinterlegt werden.</p>}
      {apps.length ? (
        <div className="space-y-3">
          {apps.map((a) => (
            <InterviewEditor
              key={a.id}
              coacheeId={c.id}
              firstName={c.first_name}
              app={{ id: a.id, title: a.title, meta: [a.employer, a.location, statusLabel(a.status)].filter(Boolean).join(" · ") }}
              brief={{ jobText: a.job_text, brief: a.interview_brief }}
              sent={a.interview_sent_at ? { at: a.interview_sent_at, changed: a.changed } : null}
              initial={a.interview ? normalizeInterview(a.interview) : null}
              updatedAt={a.interview_updated_at}
              seenAt={released || a.interview_sent_at ? a.interview_seen_at : null}
              ai={ai}
            />
          ))}
        </div>
      ) : (
        <p className="card text-sm text-muted">Noch keine gemerkte Stelle und keine laufende Bewerbung. Sobald es eine gibt, kannst du hier das Gespräch vorbereiten.</p>
      )}
    </section>
  );
}
