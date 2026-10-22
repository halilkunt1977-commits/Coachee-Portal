import Link from "next/link";
import { PageHeader } from "@/components/shell/AppShell";
import { NewTaskForm } from "@/components/tasks/NewTaskForm";
import { TaskBoard, type BoardTask } from "@/components/tasks/TaskBoard";
import { Empty } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata = { title: "Aufgaben" };

export default async function MyTasks() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  const tasks = c
    ? await query<BoardTask>(
        `SELECT t.id, t.title, t.details, t.due_on, t.done_at, t.coachee_id, t.created_by, NULL AS coachee_name, t.created_by = $2 AS by_coachee
           FROM tasks t WHERE t.coachee_id = $1 AND (t.done_at IS NULL OR t.done_at > now() - interval '60 days')
          ORDER BY t.done_at DESC NULLS FIRST, (t.created_by = $2) NULLS FIRST, t.due_on NULLS LAST, t.created_at`,
        [c.id, user.id],
      )
    : [];
  const open = tasks.filter((t) => !t.done_at).length;
  const done = tasks.length - open;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <>
      <PageHeader eyebrow="Mein Coaching" title="Aufgaben" description="Was als Nächstes zu tun ist. Haken setzen, wenn es erledigt ist, dein Coach sieht es sofort." />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {/* Erst, was der Coach aufgegeben hat; eigene Aufgaben anlegen steht darunter, zugeklappt */}
          {tasks.length ? <TaskBoard tasks={tasks} selfId={user.id} coach={false} /> : <Empty>Gerade gibt es nichts zu tun. Neue Aufgaben von deinem Coach erscheinen hier.</Empty>}
          {c && (
            <details className="card group rise">
              <summary className="-m-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl p-2 font-semibold text-accent [&::-webkit-details-marker]:hidden">
                <span className="grid size-6 place-items-center rounded-full bg-tint text-base leading-none transition group-open:rotate-45">+</span> Neue Aufgabe anlegen
              </summary>
              <div className="pt-4">
                <NewTaskForm />
              </div>
            </details>
          )}
        </div>
        <aside className="space-y-4">
          <section className="night relative overflow-hidden rounded-[20px] p-5">
            <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Dein Stand</p>
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold"><span className="text-gradient-gold">{done}</span><span className="text-white/40"> / {tasks.length}</span></p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="bar-grow-x h-full rounded-full bg-gradient-to-r from-[#e2bd7d] to-gold" style={{ width: `${pct}%` }} /></div>
              <p className="text-sm text-white/70">{open ? `Noch ${open} offen. Du schaffst das.` : tasks.length ? "Alles erledigt. Stark!" : "Noch keine Aufgaben."}</p>
            </div>
          </section>
          <p className="px-1 text-xs text-muted">Aufgaben mit Datum siehst du auch im <Link href="/mein-bereich/kalender" className="link">Kalender</Link>.</p>
        </aside>
      </div>
    </>
  );
}
