import Link from "next/link";
import { removeTask, toggleTaskDone } from "@/app/actions/aufgaben";
import { Avatar } from "@/components/shell/AppShell";
import { ShareButton } from "@/components/teilen/ShareButton";
import { addDays, dayMedium, relativeDay, todayBerlin, weekStart } from "@/lib/calendar/dates";

export type BoardTask = {
  id: string;
  title: string;
  details: string;
  due_on: string | null;
  done_at: string | null;
  coachee_id: string | null;
  coachee_name: string | null;
  created_by: string | null;
  by_coachee: boolean;
};

type Group = { key: string; label: string; tone: string; items: BoardTask[] };

/** Aufgaben nach Dringlichkeit: überfällig, heute, diese Woche, später, ohne Datum, erledigt */
export function groupTasks(tasks: BoardTask[], today = todayBerlin()): Group[] {
  const endOfWeek = addDays(weekStart(today), 6);
  const open = tasks.filter((t) => !t.done_at);
  const groups: Group[] = [
    { key: "ueberfaellig", label: "Überfällig", tone: "text-danger", items: open.filter((t) => t.due_on && t.due_on < today) },
    { key: "heute", label: "Heute", tone: "text-gold", items: open.filter((t) => t.due_on === today) },
    { key: "woche", label: "Diese Woche", tone: "text-accent", items: open.filter((t) => t.due_on && t.due_on > today && t.due_on <= endOfWeek) },
    { key: "spaeter", label: "Später", tone: "text-ink", items: open.filter((t) => t.due_on && t.due_on > endOfWeek) },
    { key: "offen", label: "Ohne Datum", tone: "text-muted", items: open.filter((t) => !t.due_on) },
    { key: "erledigt", label: "Erledigt", tone: "text-ok", items: tasks.filter((t) => t.done_at).slice(0, 15) },
  ];
  return groups.filter((g) => g.items.length);
}

export function TaskBoard({ tasks, selfId, coach, coacheeHref, coachees }: { tasks: BoardTask[]; selfId: string; coach: boolean; coacheeHref?: (id: string) => string; /** Coach: eigene Aufgaben an einen Coachee schicken */ coachees?: { id: string; name: string }[] }) {
  const today = todayBerlin();
  const groups = groupTasks(tasks, today);
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <section key={g.key} className="rise" style={{ ["--i" as string]: gi }}>
          <h2 className={`mb-2 flex items-center gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.14em] ${g.tone}`}>
            {g.label} <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{g.items.length}</span>
          </h2>
          <ul className="card divide-y divide-line-soft !p-0">
            {g.items.map((t) => (
              <li key={t.id} id={`aufgabe-${t.id}`} className="group flex scroll-mt-24 items-start gap-3 px-4 py-3 sm:px-5">
                <form action={toggleTaskDone.bind(null, t.id)}>
                  <button
                    aria-label={t.done_at ? "Als offen markieren" : "Als erledigt markieren"}
                    className={`mt-0.5 grid size-[22px] place-items-center rounded-full border-2 transition ${t.done_at ? "border-ok bg-ok text-white" : "border-line bg-surface hover:border-ok hover:bg-ok-soft"}`}
                  >
                    {t.done_at && <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>}
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <p className={t.done_at ? "text-muted line-through" : "font-semibold"}>{t.title}</p>
                  {t.details && <p className="text-sm text-muted">{t.details}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {t.due_on && !t.done_at && <span className={t.due_on < today ? "font-semibold text-danger" : t.due_on === today ? "font-semibold text-gold" : ""}>fällig {relativeDay(t.due_on, today) === dayMedium(t.due_on) ? `am ${dayMedium(t.due_on)}` : relativeDay(t.due_on, today).toLowerCase()}</span>}
                    {coach && t.coachee_name && t.coachee_id && (
                      <Link href={coacheeHref?.(t.coachee_id) ?? "#"} className="inline-flex items-center gap-1.5 hover:text-accent">
                        <Avatar name={t.coachee_name} size="size-4" className="!text-[7px]" /> {t.coachee_name}
                      </Link>
                    )}
                    {coach && !t.coachee_id && <span className="rounded-full bg-tint px-2 py-0.5 font-semibold text-accent">Meine Aufgabe</span>}
                    {t.by_coachee && <span>{coach ? "vom Coachee angelegt" : "von dir angelegt"}</span>}
                    {!t.done_at && (t.coachee_id || coachees?.length) && (
                      <ShareButton
                        kind="aufgabe"
                        refId={t.id}
                        role={coach ? "coach" : "coachee"}
                        coacheeId={t.coachee_id ?? undefined}
                        coachees={coach && !t.coachee_id ? coachees : undefined}
                        recipient={t.coachee_name?.split(" ")[0]}
                        title={t.title}
                        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                      />
                    )}
                  </div>
                </div>
                {(coach || t.created_by === selfId) && (
                  <form action={removeTask.bind(null, t.id)} className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                    <button className="text-xs text-muted hover:text-danger">Löschen</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
