import Link from "next/link";
import { Avatar } from "@/components/shell/AppShell";
import { KINDS, msUntil, relativeDay, todayBerlin } from "@/lib/calendar/dates";
import { placeOf } from "@/lib/calendar/notify";
import type { Appointment } from "@/lib/calendar/store";
import { TeamsMark } from "./AppointmentDetail";

/** Kommende Termine als kompakte Liste mit Datumskachel; Teams-Termine mit Beitreten-Knopf, sobald sie bald beginnen */
export function UpcomingList({ items, hrefFor, coach }: { items: Appointment[]; hrefFor: (a: Appointment) => string; coach: boolean }) {
  const today = todayBerlin();
  const soon = (a: Appointment) => msUntil(a.starts_at) < 15 * 60_000;
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li key={a.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
          <Link href={hrefFor(a)} className="flex min-w-0 flex-1 items-center gap-3">
            <span className={`grid w-12 shrink-0 place-items-center rounded-xl border py-1 text-center leading-none ${a.day === today ? "border-gold/40 bg-gold-soft" : "border-line-soft bg-surface"}`}>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{relativeDay(a.day, today).split(" ")[0].replace(/[.,]/g, "")}</span>
              <span className="mt-0.5 text-[15px] font-bold tabular-nums">{a.start}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{a.title}</span>
              <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                <span className={`size-1.5 shrink-0 rounded-full ${KINDS[a.kind].dot}`} />
                {[relativeDay(a.day, today), coach ? a.coachee_name : placeOf(a)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {coach && a.coachee_name && <Avatar name={a.coachee_name} size="size-7" className="!text-[10px] hidden sm:grid" />}
          </Link>
          {a.join_url && soon(a) && (
            <a href={a.join_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg bg-[#5b5fc7] px-2.5 py-1.5 text-xs font-bold text-white transition hover:brightness-110">
              <TeamsMark className="size-3.5" /> Beitreten
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
