import Link from "next/link";
import { PageHeader } from "@/components/shell/AppShell";
import { NewTaskForm } from "@/components/tasks/NewTaskForm";
import { groupTasks, TaskBoard, type BoardTask } from "@/components/tasks/TaskBoard";
import { Empty } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata = { title: "Aufgaben" };

export default async function CoachTasks({ searchParams }: PageProps<"/coach/aufgaben">) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const filter = typeof sp.fuer === "string" ? sp.fuer : "";
  const [tasks, coachees] = await Promise.all([
    query<BoardTask>(
      `SELECT t.id, t.title, t.details, t.due_on, t.done_at, t.coachee_id, t.created_by,
              c.first_name || ' ' || c.last_name AS coachee_name, (c.user_id IS NOT NULL AND t.created_by = c.user_id) AS by_coachee
         FROM tasks t LEFT JOIN coachees c ON c.id = t.coachee_id
        WHERE (t.owner_id = $1 OR (c.coach_id = $1 AND c.archived_at IS NULL))
          AND (t.done_at IS NULL OR t.done_at > now() - interval '30 days')
        ORDER BY t.done_at DESC NULLS FIRST, t.due_on NULLS LAST, t.created_at`,
      [coach.id],
    ),
    query<{ id: string; name: string; hasLogin: boolean }>(
      `SELECT id, first_name || ' ' || last_name AS name, user_id IS NOT NULL AS "hasLogin" FROM coachees
        WHERE coach_id = $1 AND archived_at IS NULL AND status <> 'abgeschlossen' ORDER BY first_name, last_name`,
      [coach.id],
    ),
  ]);
  const shown = tasks.filter((t) => (filter === "ich" ? !t.coachee_id : filter ? t.coachee_id === filter : true));
  const groups = groupTasks(tasks);
  const count = (k: string) => groups.find((g) => g.key === k)?.items.length ?? 0;
  const withTasks = coachees.filter((c) => tasks.some((t) => t.coachee_id === c.id && !t.done_at));
  const chip = (key: string, label: string, n?: number) => (
    <Link key={key} href={key ? `/coach/aufgaben?fuer=${key}` : "/coach/aufgaben"} className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition sm:min-h-0 ${filter === key ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-accent/40 hover:text-accent"}`}>
      {label}{n ? <span className={`text-xs ${filter === key ? "text-white/70" : "text-muted"}`}>{n}</span> : null}
    </Link>
  );

  return (
    <>
      <PageHeader eyebrow="Planung" title="Aufgaben" description="Was du und deine Coachees zu erledigen haben, sortiert nach Dringlichkeit." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <section className="card rise">
            <NewTaskForm coachees={coachees} defaultFor={filter && filter !== "ich" ? filter : ""} />
          </section>
          <nav className="flex flex-wrap gap-2 pb-1" aria-label="Filter">
            {chip("", "Alle", tasks.filter((t) => !t.done_at).length)}
            {chip("ich", "Meine", tasks.filter((t) => !t.coachee_id && !t.done_at).length)}
            {withTasks.map((c) => chip(c.id, c.name, tasks.filter((t) => t.coachee_id === c.id && !t.done_at).length))}
          </nav>
          {shown.length ? <TaskBoard tasks={shown} selfId={coach.id} coach coacheeHref={(id) => `/coach/coachees/${id}?tab=aufgaben`} coachees={coachees.map(({ id, name }) => ({ id, name }))} /> : <Empty>Keine Aufgaben. Oben kannst du eine anlegen.</Empty>}
        </div>
        <aside className="space-y-4">
          <section className="night relative overflow-hidden rounded-[20px] p-5">
            <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative grid grid-cols-2 gap-3">
              {[
                ["Überfällig", count("ueberfaellig"), "text-[#ffb4a8]"],
                ["Heute", count("heute"), "text-gradient-gold"],
                ["Diese Woche", count("woche"), "text-white"],
                ["Erledigt (30 T.)", count("erledigt"), "text-[#9be0b5]"],
              ].map(([l, n, c]) => (
                <div key={l as string} className="glass p-3">
                  <p className={`font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums ${c}`}>{n}</p>
                  <p className="text-xs text-white/60">{l}</p>
                </div>
              ))}
            </div>
          </section>
          <p className="px-1 text-xs text-muted">Aufgaben mit Datum stehen auch im <Link href="/coach/kalender" className="link">Kalender</Link>. Coachees sehen nur ihre eigenen Aufgaben und können sie abhaken.</p>
        </aside>
      </div>
    </>
  );
}
