import Link from "next/link";
import { AppShell, Avatar } from "@/components/shell/AppShell";
import { requireCoach } from "@/lib/auth";
import { query } from "@/lib/db";
import { coachNav } from "@/lib/nav";

export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const user = await requireCoach();
  const [counts, active] = await Promise.all([
    query<{ mails: number; unread: number; tasks: number; today: number; inbox: number; leads: number }>(
      `SELECT (SELECT count(*) FROM attendance_mails WHERE coach_id = $1 AND status = 'offen')::int AS mails,
              (SELECT count(*) FROM tasks t LEFT JOIN coachees c ON c.id = t.coachee_id
                WHERE (t.owner_id = $1 OR (c.coach_id = $1 AND c.archived_at IS NULL)) AND t.done_at IS NULL AND t.due_on <= (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS tasks,
              (SELECT count(*) FROM appointments a WHERE a.coach_id = $1 AND a.status = 'geplant' AND a.ends_at > now()
                AND (a.starts_at AT TIME ZONE 'Europe/Berlin')::date = (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS today,
              (SELECT count(*) FROM inbox_mails WHERE coach_id = $1 AND read_at IS NULL)::int AS inbox,
              (SELECT count(*) FROM leads WHERE coach_id = $1 AND status IN ('neu','kontaktiert') AND follow_up_on <= (now() AT TIME ZONE 'Europe/Berlin')::date)::int AS leads,
              (SELECT count(*) FROM messages m JOIN coachees c ON c.id = m.coachee_id WHERE c.coach_id = $1 AND m.read_at IS NULL AND m.author_id IS DISTINCT FROM $1)::int AS unread`,
      [user.id],
    ),
    query<{ id: string; name: string; type: string; unread: number }>(
      `SELECT c.id, c.first_name || ' ' || c.last_name AS name, c.coaching_type AS type,
              (SELECT count(*) FROM messages m WHERE m.coachee_id = c.id AND m.read_at IS NULL AND m.author_id IS DISTINCT FROM $1)::int AS unread
         FROM coachees c WHERE c.coach_id = $1 AND c.status = 'aktiv' AND c.archived_at IS NULL
        ORDER BY c.updated_at DESC LIMIT 8`,
      [user.id],
    ),
  ]);
  const extra = active.length > 0 && (
    <div className="mt-8 space-y-1">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Aktive Coachings</p>
      {active.map((c) => (
        <Link key={c.id} href={`/coach/coachees/${c.id}`} className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.06] hover:text-white">
          <Avatar name={c.name} size="size-6" className="!text-[9px]" />
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          {c.unread > 0 ? <span className="size-2 rounded-full bg-gold" title="Neue Nachricht" /> : <span className="text-[10px] text-white/30">{c.type === "job" ? "Job" : "Gründung"}</span>}
        </Link>
      ))}
    </div>
  );
  return (
    <AppShell user={user} groups={coachNav(counts[0])} extra={extra}>
      {children}
    </AppShell>
  );
}
