import Link from "next/link";
import { deleteCv, duplicateCv } from "@/app/actions/lebenslauf";
import { aiEnabled } from "@/lib/ai";
import { listCvs } from "@/lib/cv/store";
import { renderCvHtml } from "@/lib/cv/render";
import { TEMPLATES, germanDate, normalizeCv } from "@/lib/cv/types";
import { todayBerlin } from "@/lib/calendar/dates";
import { CvName } from "./CvName";
import { ConfirmButton } from "../ConfirmButton";
import { CvPreview } from "./CvPreview";
import { Empty, formatDateTime } from "../ui";
import { NewCvForm } from "./NewCvForm";
import { ShareButton } from "../teilen/ShareButton";
import type { ReactNode } from "react";
import { getT } from "@/lib/i18n-server";

/** Alle Lebensläufe eines Coachees, für Coach (Akte) und Coachee (Mein Bereich) gleich. */
export async function CvList({ coacheeId, coach, aside, recipient, importAllowed = true }: { coacheeId: string; coach: boolean; aside?: ReactNode; /** Vorname des Coachees, für „An … senden“ */ recipient?: string; /** Lebenslauf aus Datei (Zusatzfunktion, für Coachees nur mit Freigabe) */ importAllowed?: boolean }) {
  const [cvs, tr] = await Promise.all([listCvs(coacheeId), getT()]);
  const ai = aiEnabled() && (coach || importAllowed);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3">
        {cvs.length === 0 && <Empty>{ai ? tr("Noch kein Lebenslauf. Rechts lässt sich der erste anlegen, am schnellsten aus dem bisherigen Lebenslauf.") : tr("Noch kein Lebenslauf. Rechts lässt sich der erste anlegen.")}</Empty>}
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
                {tr("Design")} {TEMPLATES.find((t) => t.key === cv.template)?.label ?? cv.template} · {cv.updated_by_name ? tr("geändert {wann} von {name}", { wann: formatDateTime(cv.updated_at), name: cv.updated_by_name }) : tr("geändert {wann}", { wann: formatDateTime(cv.updated_at) })}
              </p>
              {cv.source_file_id && (
                <p className="text-xs text-muted">{tr("Aus der Datei")} <a href={`/api/dateien/${cv.source_file_id}`} className="link" target="_blank" rel="noreferrer">{cv.source_name}</a></p>
              )}
              </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/lebenslauf/${cv.id}`} className="btn btn-sm tap">{tr("Bearbeiten")}</Link>
              <a href={`/api/lebenslauf/${cv.id}/pdf`} className="btn-ghost btn-sm tap">PDF</a>
              <ShareButton kind="lebenslauf" refId={cv.id} role={coach ? "coach" : "coachee"} coacheeId={coacheeId} recipient={recipient} title={cv.name} />
              <form action={duplicateCv.bind(null, cv.id)}><button className="btn-ghost btn-sm tap">{tr("Kopie für andere Bewerbung")}</button></form>
              <form action={deleteCv.bind(null, cv.id)}><ConfirmButton /></form>
            </div>
            </div>
          </article>
        ))}
      </section>
      <aside className="h-fit space-y-6">
        <div className="card space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="h2">{tr("Neuer Lebenslauf")}</h2>
          </div>
          <NewCvForm coacheeId={coacheeId} ai={ai} coach={coach} defaultName={`Lebenslauf ${germanDate(todayBerlin())}`} />
        </div>
        {aside}
      </aside>
    </div>
  );
}
