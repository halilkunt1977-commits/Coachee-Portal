import { cvFromSurveyAction, deleteSurvey, reopenSurvey } from "@/app/actions/erfahrung";
import type { Coachee } from "@/lib/access";
import { query } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { normalizeSurvey, period, progress } from "@/lib/survey/types";
import { ActionForm } from "../akte/ActionForm";
import { ConfirmButton } from "../ConfirmButton";
import { SubmitButton } from "../SubmitButton";
import { formatDateTime } from "../ui";
import { StartSurvey } from "./StartSurvey";
import { SurveyForm } from "./SurveyForm";

type Row = { id: string; status: string; data: unknown; submitted_at: string | null; created_at: string; updated_at: string };

/** Erfahrungsbogen: für den Coachee zum Ausfüllen, für den Coach mit Übersicht und „Lebenslauf daraus erstellen“. */
export async function SurveyPanel({ coachee: c, coach }: { coachee: Coachee; coach: boolean }) {
  const [rows, cvs] = await Promise.all([
    query<Row>("SELECT id, status, data, submitted_at, created_at, updated_at FROM experience_surveys WHERE coachee_id = $1 ORDER BY created_at DESC LIMIT 1", [c.id]),
    query<{ id: string; name: string }>("SELECT id, name FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 5", [c.id]),
  ]);
  const s = rows[0];
  // Hilfen beim Erstellen und Ausfüllen nur mit Freigabe (Zusatzfunktion „Erfahrungsbogen-Hilfen“); der Coach darf immer
  const help = coach || hasFeature(c, "erfahrungsbogen");
  if (!s) {
    return (
      <div className="card max-w-2xl space-y-3">
        <h2 className="h2">{coach ? "Erfahrungsbogen anlegen" : "Los geht's"}</h2>
        <p className="text-sm text-muted">
          {coach
            ? `Aus dem Lebenslauf entsteht pro Station eine Liste typischer Tätigkeiten zum Ankreuzen. ${c.first_name} kann den Bogen auch selbst unter „Erfahrungsbogen“ starten.`
            : help
              ? "Lade deinen Lebenslauf hoch. Danach bekommst du für jede deiner Stellen eine Liste mit Aufgaben, die du nur noch ankreuzen musst. So sehen wir gemeinsam, was du alles kannst, und machen daraus einen starken neuen Lebenslauf."
              : "Trag deine bisherigen Stellen, Ausbildungen und Kurse ein und schreib zu jeder auf, was du dort gemacht hast. So sehen wir gemeinsam, was du alles kannst, und machen daraus einen starken neuen Lebenslauf."}
        </p>
        <StartSurvey coacheeId={c.id} cvs={cvs} coach={coach} upload={help} />
      </div>
    );
  }
  if (coach && s.status === "eingereicht") await query("UPDATE experience_surveys SET status = 'gesehen' WHERE id = $1", [s.id]);
  const data = normalizeSurvey(s.data);
  const p = progress(data);
  const checked = data.stations.reduce((a, st) => a + st.tasks.filter((t) => t.level > 0).length, 0);

  return (
    <div className="space-y-6">
      {coach && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="h2">Erfahrungsbogen</h2>
              <p className="text-sm text-muted">
                {s.submitted_at ? `Abgeschickt am ${formatDateTime(s.submitted_at)}` : "Noch nicht abgeschickt"} · zuletzt geändert {formatDateTime(s.updated_at)} · {p.done} von {p.total} Stationen, {checked} Tätigkeiten angekreuzt
              </p>
            </div>
            <span className={`badge ${s.submitted_at ? "bg-[#e5f2ea] text-ok" : "bg-bg text-muted"}`}>{s.submitted_at ? "✓ Abgeschickt" : "In Arbeit"}</span>
          </div>
          <ActionForm action={cvFromSurveyAction.bind(null, s.id)} className="space-y-2">
            <SubmitButton pendingText="Die KI schreibt die Tätigkeitsbeschreibungen …">Neuen Lebenslauf daraus erstellen</SubmitButton>
            <p className="text-xs text-muted">Die KI formuliert aus den angekreuzten Tätigkeiten, Erfolgen und Programmen Stichpunkte je Station, ein Kurzprofil und die Kenntnisse. Der Lebenslauf öffnet sich danach im Editor, Namen gehen nicht an die KI.</p>
          </ActionForm>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Kurzübersicht</summary>
            <ul className="mt-2 space-y-2">
              {data.stations.map((st) => (
                <li key={st.key}>
                  <b>{st.title}</b> <span className="text-muted">· {[st.company, period(st)].filter(Boolean).join(" · ")}</span>
                  <br />
                  {st.tasks.filter((t) => t.level === 2).map((t) => t.text).join(" · ") || <span className="text-muted">Keine Hauptaufgaben angekreuzt</span>}
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-3">
            {s.submitted_at && <form action={reopenSurvey.bind(null, s.id)}><button className="btn-ghost btn-sm">Wieder auf „in Arbeit“ setzen</button></form>}
            <form action={deleteSurvey.bind(null, s.id)}><ConfirmButton label="Bogen löschen und neu beginnen" /></form>
          </div>
        </div>
      )}
      <SurveyForm id={s.id} initial={data} submittedAt={s.submitted_at} coach={coach} suggest={help} />
    </div>
  );
}
