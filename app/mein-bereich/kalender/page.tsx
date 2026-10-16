import Link from "next/link";
import { AppointmentDetail } from "@/components/calendar/AppointmentDetail";
import { CalendarView, isView, rangeFor } from "@/components/calendar/CalendarView";
import { SubscribeCard } from "@/components/calendar/SubscribeCard";
import { UpcomingList } from "@/components/calendar/Upcoming";
import { PageHeader } from "@/components/shell/AppShell";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isDay, todayBerlin } from "@/lib/calendar/dates";
import { appointmentFor, calendarItems, upcomingAppointments } from "@/lib/calendar/store";
import { one } from "@/lib/db";

export const metadata = { title: "Kalender" };

export default async function MyCalendar({ searchParams }: PageProps<"/mein-bereich/kalender">) {
  const user = await requireUser("coachee");
  const sp = await searchParams;
  const today = todayBerlin();
  const view = isView(sp.ansicht) ? sp.ansicht : "liste";
  const day = isDay(sp.datum) ? sp.datum : today;
  const path = "/mein-bereich/kalender";
  const here = `${path}?ansicht=${view}&datum=${day}`;
  const { from, to } = rangeFor(view, day);
  const [items, selected, upcoming, me] = await Promise.all([
    calendarItems(user, from, to, `${here}&`, "/mein-bereich/aufgaben"),
    typeof sp.termin === "string" ? appointmentFor(user, sp.termin) : null,
    upcomingAppointments(user, 4),
    one<{ calendar_token: string | null }>("SELECT calendar_token FROM users WHERE id = $1", [user.id]),
  ]);

  return (
    <>
      <PageHeader eyebrow="Mein Coaching" title="Kalender" description="Deine Termine mit deinem Coach und wann deine Aufgaben fällig sind." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className={`min-w-0 ${selected ? "order-2 xl:order-none" : ""}`}>
          <CalendarView items={items} view={view} day={day} today={today} path={path} selected={selected?.id} />
        </div>
        <aside className="space-y-6">
          {selected ? (
            <AppointmentDetail a={selected} coach={false} ret="kalender" editHref={here} closeHref={here} />
          ) : (
            <section className="card rise space-y-3">
              <h2 className="h2">Deine nächsten Termine</h2>
              {upcoming.length ? <UpcomingList items={upcoming} coach={false} hrefFor={(a) => `${path}?ansicht=${view}&datum=${a.day}&termin=${a.id}`} /> : <Empty>Gerade ist kein Termin geplant. Dein Coach trägt ihn hier ein.</Empty>}
              <Link href="/mein-bereich/aufgaben" className="link text-sm">Zu meinen Aufgaben</Link>
            </section>
          )}
          <SubscribeCard token={me?.calendar_token ?? null} />
        </aside>
      </div>
    </>
  );
}
