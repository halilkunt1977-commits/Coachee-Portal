import Link from "next/link";
import { cancelAppointment, deleteAppointment, duplicateAppointment } from "@/app/actions/termine";
import { Avatar } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { Notice } from "@/components/ui";
import { dayLong, KINDS, msUntil } from "@/lib/calendar/dates";
import { placeOf, SYNC_TEXT, type SyncResult } from "@/lib/calendar/notify";
import type { Appointment } from "@/lib/calendar/store";

/** Ein Termin im Detail: Zeit, Ort, Teams-Knopf, Hinweis, beim Coach die Aktionen */
export function AppointmentDetail({ a, coach, ret, editHref, closeHref, hint }: { a: Appointment; coach: boolean; ret: "kalender" | "akte"; editHref: string; closeHref: string; hint?: string | null }) {
  const k = KINDS[a.kind];
  const past = msUntil(a.ends_at) < 0;
  const cancelled = a.status === "abgesagt";
  const sync = hint && hint in SYNC_TEXT ? SYNC_TEXT[hint as SyncResult] : null;
  return (
    <article className="card rise relative space-y-4">
      <Link href={closeHref} scroll={false} aria-label="Schließen" className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink">
        <Icon name="close" className="size-4" />
      </Link>
      {sync && <div className="mr-8"><Notice tone={sync.tone}>{sync.text}</Notice></div>}
      <div className="space-y-2 pr-8">
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${k.chip}`}><span className={`size-1.5 rounded-full ${k.dot}`} />{k.label}</span>
          {cancelled && <span className="badge !bg-danger-soft !text-danger">Abgesagt</span>}
          {!cancelled && past && <span className="badge !bg-surface-2 !text-muted">Vorbei</span>}
        </div>
        <h2 className={`font-[family-name:var(--font-display)] text-xl font-bold tracking-tight ${cancelled ? "text-muted line-through" : ""}`}>{a.title}</h2>
      </div>

      <dl className="space-y-2.5 text-sm">
        <div className="flex gap-3"><dt className="text-muted"><Icon name="calendar" className="size-[18px]" /></dt><dd><b>{dayLong(a.day)}</b><br />{a.start} bis {a.end} Uhr</dd></div>
        {placeOf(a) && <div className="flex gap-3"><dt className="text-muted"><Icon name="flag" className="size-[18px]" /></dt><dd>{placeOf(a)}</dd></div>}
        {coach && a.coachee_name && (
          <div className="flex items-center gap-3">
            <dt><Avatar name={a.coachee_name} size="size-[18px]" className="!text-[7px]" /></dt>
            <dd><Link href={`/coach/coachees/${a.coachee_id}?tab=termine`} className="link">{a.coachee_name}</Link>{a.invited_at && <span className="text-muted"> · eingeladen</span>}</dd>
          </div>
        )}
        {!coach && <div className="flex items-center gap-3"><dt><Avatar name={a.coach_name} size="size-[18px]" className="!text-[7px]" /></dt><dd>mit {a.coach_name}</dd></div>}
      </dl>

      {a.join_url && !cancelled && !past && (
        <a href={a.join_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#5b5fc7] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_-10px_#5b5fc7] transition hover:brightness-110">
          <TeamsMark /> An Teams-Besprechung teilnehmen
        </a>
      )}

      {a.notes && (
        <div className="rounded-xl border border-gold/25 bg-gold-soft/60 p-3 text-sm">
          <p className="eyebrow mb-1 !text-[#7a5520]">Hinweis</p>
          <p className="whitespace-pre-wrap">{a.notes}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        {coach && <Link href={editHref} scroll={false} className="btn btn-sm">Bearbeiten</Link>}
        <a href={`/api/termine/${a.id}/ics`} className="btn-ghost btn-sm"><Icon name="calendar" className="size-3.5" /> In meinen Kalender</a>
        {coach && (
          <form action={duplicateAppointment.bind(null, a.id)}>
            <button className="btn-ghost btn-sm">Eine Woche später nochmal</button>
          </form>
        )}
      </div>
      {coach && (
        <div className="flex flex-wrap gap-4 text-xs">
          {!cancelled && !past && (
            <form action={cancelAppointment.bind(null, a.id, ret)}>
              <button className="font-semibold text-danger hover:underline">{a.invited_at ? "Absagen und Absage schicken" : "Absagen"}</button>
            </form>
          )}
          <form action={deleteAppointment.bind(null, a.id, ret)}>
            <button className="text-muted hover:text-danger hover:underline">Löschen</button>
          </form>
        </div>
      )}
    </article>
  );
}

export function TeamsMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M13 6.5h7.5a1 1 0 0 1 1 1V14a4 4 0 0 1-4 4h-.2A6 6 0 0 1 13 20.9zM19 5.2a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8M13.3 4.8a2.4 2.4 0 1 1-4.7 0 2.4 2.4 0 0 1 4.7 0" opacity=".55" />
      <rect x="2" y="6.5" width="11" height="11" rx="1.5" />
      <path d="M5 9.2h5v1.3H8.2v4.7H6.8v-4.7H5z" fill="#5b5fc7" />
    </svg>
  );
}
