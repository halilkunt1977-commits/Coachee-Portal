import Link from "next/link";
import { AppointmentDetail } from "@/components/calendar/AppointmentDetail";
import { AppointmentForm } from "@/components/calendar/AppointmentForm";
import { CalendarView, isView, rangeFor } from "@/components/calendar/CalendarView";
import { SubscribeCard } from "@/components/calendar/SubscribeCard";
import { UpcomingList } from "@/components/calendar/Upcoming";
import { PageHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { Empty } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { isDay, todayBerlin } from "@/lib/calendar/dates";
import { graphCheck, graphEnabled } from "@/lib/calendar/graph";
import { appointmentFor, calendarItems, upcomingAppointments } from "@/lib/calendar/store";
import { one, query } from "@/lib/db";

export const metadata = { title: "Kalender" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function CoachCalendar({ searchParams }: PageProps<"/coach/kalender">) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const today = todayBerlin();
  const view = isView(sp.ansicht) ? sp.ansicht : "monat";
  const day = isDay(sp.datum) ? sp.datum : today;
  const path = "/coach/kalender";
  const here = `${path}?ansicht=${view}&datum=${day}`;
  const { from, to } = rangeFor(view, day);
  const editId = str(sp.bearbeiten);
  const selectedId = str(sp.termin) ?? editId;
  const creating = sp.neu === "1";

  const [items, selected, upcoming, coachees, me] = await Promise.all([
    calendarItems(coach, from, to, `${here}&`, "/coach/aufgaben"),
    selectedId ? appointmentFor(coach, selectedId) : null,
    upcomingAppointments(coach, 6),
    creating || editId
      ? query<{ id: string; name: string; email: string }>(
          `SELECT id, first_name || ' ' || last_name AS name, email FROM coachees
            WHERE coach_id = $1 AND archived_at IS NULL AND status <> 'abgeschlossen' ORDER BY first_name, last_name`,
          [coach.id],
        )
      : [],
    one<{ calendar_token: string | null }>("SELECT calendar_token FROM users WHERE id = $1", [coach.id]),
  ]);
  const editing = editId && selected?.id === editId ? selected : null;
  const graph = graphEnabled();
  const preCoachee = str(sp.coachee);

  const panel = creating || editing ? (
    <section className="card rise space-y-4">
      <div>
        <p className="eyebrow">{editing ? "Termin ändern" : "Neuer Termin"}</p>
        <h2 className="h2">{editing ? editing.title : "Was steht an?"}</h2>
      </div>
      <AppointmentForm
        id={editing?.id ?? null}
        ret="kalender"
        coachees={coachees}
        graph={graph}
        cancelHref={editing ? `${here}&termin=${editing.id}` : here}
        defaults={
          editing
            ? { coachee_id: editing.coachee_id, title: editing.title, kind: editing.kind, day: editing.day, start: editing.start, end: editing.end, location: editing.location, notes: editing.notes, join_url: editing.join_url, invited: Boolean(editing.invited_at) }
            : { day, coachee_id: preCoachee && coachees.some((c) => c.id === preCoachee) ? preCoachee : null }
        }
      />
    </section>
  ) : selected ? (
    <AppointmentDetail a={selected} coach ret="kalender" editHref={`${here}&bearbeiten=${selected.id}`} closeHref={here} hint={str(sp.hinweis)} />
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Planung"
        title="Kalender"
        description="Alle Coaching-Termine, Teams-Besprechungen und fälligen Aufgaben an einem Ort."
        actions={
          <Link href={`${here}&neu=1`} scroll={false} className="btn-gold">
            <Icon name="plus" className="size-4" /> Neuer Termin
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className={`min-w-0 ${panel ? "order-2 xl:order-none" : ""}`}>
          <CalendarView items={items} view={view} day={day} today={today} path={path} selected={selected?.id} />
          <Legend outlook={graph} />
        </div>
        <aside className="space-y-6">
          {panel}
          {!panel && (
            <section className="card rise space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="h2">Als Nächstes</h2>
                <Link href={`${path}?ansicht=liste&datum=${today}`} className="link text-sm">Alle</Link>
              </div>
              {upcoming.length ? <UpcomingList items={upcoming} coach hrefFor={(a) => `${path}?ansicht=${view}&datum=${a.day}&termin=${a.id}`} /> : <Empty>Keine Termine geplant.</Empty>}
            </section>
          )}
          <MicrosoftCard on={graph} check={graph ? await graphCheck() : null} />
          <SubscribeCard token={me?.calendar_token ?? null} />
        </aside>
      </div>
    </>
  );
}

function Legend({ outlook }: { outlook: boolean }) {
  const items = [
    ["bg-[#5b5fc7]", "Teams"],
    ["bg-gold", "Büro"],
    ["bg-ok", "Telefon"],
    ["bg-accent-2", "Vor Ort"],
    ...(outlook ? [["bg-[#0f6cbd]", "Outlook"]] : []),
    ["bg-danger", "Aufgabe fällig"],
  ];
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${c}`} />{l}</span>)}
    </p>
  );
}

function MicrosoftCard({ on, check }: { on: boolean; check: { ok: boolean; message: string } | null }) {
  return (
    <section className={`card space-y-2 ${on ? "" : "border-dashed"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eef0ff] text-[#5b5fc7]">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden><rect x="2" y="6.5" width="11" height="11" rx="1.5" /><path d="M14 8h6.5a1 1 0 0 1 1 1v5a4 4 0 0 1-4 4H14z" opacity=".5" /></svg>
        </span>
        <div>
          <h2 className="h2 !text-base">Microsoft Teams und Outlook</h2>
          <p className={`text-xs font-semibold ${on && check?.ok ? "text-ok" : on ? "text-danger" : "text-muted"}`}>{!on ? "Noch nicht verbunden" : check?.ok ? "Verbunden" : "Verbindung gestört"}</p>
        </div>
      </div>
      <p className="text-sm text-muted">
        {on
          ? "Neue Termine landen in deinem Outlook-Kalender, Teams-Links entstehen automatisch, und deine Outlook-Termine erscheinen hier im Kalender."
          : "Teams-Termine funktionieren schon: Link aus Teams einfügen, das Portal schickt die Einladung. Nach der Anbindung erstellt es Teams-Links selbst und zeigt deine Outlook-Termine hier."}
      </p>
      {check && <p className={`text-xs ${check.ok ? "text-muted" : "text-danger"}`}>{check.message}</p>}
    </section>
  );
}
