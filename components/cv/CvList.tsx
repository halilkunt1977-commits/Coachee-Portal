import Link from "next/link";
import { deleteCv, duplicateCv } from "@/app/actions/lebenslauf";
import { aiEnabled } from "@/lib/ai";
import { listCvs } from "@/lib/cv/store";
import { renderCvHtml } from "@/lib/cv/render";
import { MAX_COACHEE_CVS, TEMPLATES, germanDate, normalizeCv } from "@/lib/cv/types";
import { todayBerlin } from "@/lib/calendar/dates";
import { CvName } from "./CvName";
import { ConfirmButton } from "../ConfirmButton";
import { CvPreview } from "./CvPreview";
import { Empty, formatDateTime } from "../ui";
import { NewCvForm } from "./NewCvForm";
import { ShareButton } from "../teilen/ShareButton";
import { Notice } from "../ui";
import type { ReactNode } from "react";

/** Hinweis an der Grenze; auch richtig, wenn der Coach mehr angelegt hat, als Coachees selbst dürfen */
const limitText = (n: number) =>
  n > MAX_COACHEE_CVS
    ? `Du hast ${n} Lebensläufe. Neue kannst du anlegen, wenn du einen löschst (höchstens ${MAX_COACHEE_CVS}). Bis dahin passt du am besten einen bestehenden an.`
    : `Du hast ${n} von ${MAX_COACHEE_CVS} Lebensläufen. Für einen neuen lösch einen, den du nicht mehr brauchst, oder pass einen bestehenden an.`;

/** Alle Lebensläufe eines Coachees, für Coach (Akte) und Coachee (Mein Bereich) gleich. */
export async function CvList({ coacheeId, coach, limitHit, aside, recipient, importAllowed = true }: { coacheeId: string; coach: boolean; limitHit?: boolean; aside?: ReactNode; /** Vorname des Coachees, für „An … senden“ */ recipient?: string; /** Lebenslauf aus Datei (Zusatzfunktion, für Coachees nur mit Freigabe) */ importAllowed?: boolean }) {
  const cvs = await listCvs(coacheeId);
  // Coachees: höchstens MAX_COACHEE_CVS Fassungen, damit das Portal für die eigene Bewerbung genutzt wird
  const full = !coach && cvs.length >= MAX_COACHEE_CVS;
  const ai = aiEnabled() && (coach || importAllowed);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3">
        {limitHit && full && <Notice tone="error">{limitText(cvs.length)}</Notice>}
        {cvs.length === 0 && <Empty>Noch kein Lebenslauf. Rechts lässt sich der erste anlegen{ai ? ", am schnellsten aus dem bisherigen Lebenslauf" : ""}.</Empty>}
        {cvs.map((cv, i) => (
          <article key={cv.id} className="card flex items-start gap-4">
            <Link href={`/lebenslauf/${cv.id}`} aria-hidden tabIndex={-1} className="block h-[6.6rem] w-[4.6rem] shrink-0 overflow-hidden">
              <CvPreview width={74} showBreaks={false} html={renderCvHtml(normalizeCv(cv.data), { template: cv.template, color: cv.color, photo: cv.photo_file_id ? `/api/dateien/${cv.photo_file_id}` : null, fontCss: '@import url("/api/lebenslauf/schriften.css");' })} />
            </Link>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
              {/* Liste ist nach letzter Änderung sortiert: der oberste ist der aktuelle */}
              <CvName id={cv.id} name={cv.name} current={i === 0 && cvs.length > 1} />
              <p className="text-sm text-muted">
                Design {TEMPLATES.find((t) => t.key === cv.template)?.label ?? cv.template} · geändert {formatDateTime(cv.updated_at)}{cv.updated_by_name ? ` von ${cv.updated_by_name}` : ""}
              </p>
              {cv.source_file_id && (
                <p className="text-xs text-muted">Aus der Datei <a href={`/api/dateien/${cv.source_file_id}`} className="link" target="_blank" rel="noreferrer">{cv.source_name}</a></p>
              )}
              </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/lebenslauf/${cv.id}`} className="btn btn-sm tap">Bearbeiten</Link>
              <a href={`/api/lebenslauf/${cv.id}/pdf`} className="btn-ghost btn-sm tap">PDF</a>
              <ShareButton kind="lebenslauf" refId={cv.id} role={coach ? "coach" : "coachee"} coacheeId={coacheeId} recipient={recipient} title={cv.name} />
              {!full && <form action={duplicateCv.bind(null, cv.id)}><button className="btn-ghost btn-sm tap">Kopie für andere Bewerbung</button></form>}
              <form action={deleteCv.bind(null, cv.id)}><ConfirmButton /></form>
            </div>
            </div>
          </article>
        ))}
      </section>
      <aside className="h-fit space-y-6">
        <div className="card space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="h2">Neuer Lebenslauf</h2>
            {!coach && cvs.length <= MAX_COACHEE_CVS && <span className="text-xs text-muted tabular-nums">{cvs.length} von {MAX_COACHEE_CVS}</span>}
          </div>
          {full ? (
            <p className="text-sm text-muted">{limitText(cvs.length)}</p>
          ) : (
            <NewCvForm coacheeId={coacheeId} ai={ai} coach={coach} defaultName={`Lebenslauf ${germanDate(todayBerlin())}`} />
          )}
        </div>
        {aside}
      </aside>
    </div>
  );
}
