import Link from "next/link";
import { removeTask, toggleTaskDone } from "@/app/actions/aufgaben";
import { Avatar } from "@/components/shell/AppShell";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/shell/icons";
import { ShareButton } from "@/components/teilen/ShareButton";
import { addDays, dayMedium, relativeDay, todayBerlin, weekStart } from "@/lib/calendar/dates";
import { getT, serverLang } from "@/lib/i18n-server";

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

export async function TaskBoard({ tasks, selfId, coach, coacheeHref, coachees }: { tasks: BoardTask[]; selfId: string; coach: boolean; coacheeHref?: (id: string) => string; /** Coach: eigene Aufgaben an einen Coachee schicken */ coachees?: { id: string; name: string }[] }) {
  const [tr, lang] = await Promise.all([getT(), serverLang()]);
  const today = todayBerlin();
  const groups = groupTasks(tasks, today);
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <section key={g.key} className="rise" style={{ ["--i" as string]: gi }}>
          <h2 className={`mb-2 flex items-center gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.14em] ${g.tone}`}>
            {tr(g.label)} <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{g.items.length}</span>
          </h2>
          <ul className="card divide-y divide-line-soft !p-0">
            {g.items.map((t) => (
              <li key={t.id} id={`aufgabe-${t.id}`} className="group flex scroll-mt-24 items-start gap-3 px-4 py-3 sm:px-5">
                <form action={toggleTaskDone.bind(null, t.id)} className="-my-2.5 -ml-2.5 shrink-0">
                  {/* Trefferfläche 44 px, sichtbar ein Kreis */}
                  <button aria-label={t.done_at ? tr("Als offen markieren") : tr("Als erledigt markieren")} className="group/check grid size-11 place-items-center rounded-full">
                    <span className={`grid size-7 place-items-center rounded-full border-2 transition sm:size-[22px] ${t.done_at ? "border-ok bg-ok text-white" : "border-line bg-surface group-hover/check:border-ok group-hover/check:bg-ok-soft"}`}>
                      {t.done_at && <svg viewBox="0 0 16 16" className="size-3.5 sm:size-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>}
                    </span>
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <p className={t.done_at ? "text-muted line-through" : "font-semibold"}>{t.title}</p>
                  {t.details && <p className="text-sm text-muted">{t.details}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {t.due_on && !t.done_at && <span className={t.due_on < today ? "font-semibold text-danger" : t.due_on === today ? "font-semibold text-gold" : ""}>{relativeDay(t.due_on, today) === dayMedium(t.due_on) ? tr("fällig am {datum}", { datum: dayMedium(t.due_on, lang) }) : tr("fällig {wann}", { wann: relativeDay(t.due_on, today, lang).toLocaleLowerCase(lang) })}</span>}
                    {coach && t.coachee_name && t.coachee_id && (
                      <Link href={coacheeHref?.(t.coachee_id) ?? "#"} className="inline-flex items-center gap-1.5 hover:text-accent">
                        <Avatar name={t.coachee_name} size="size-4" className="!text-[7px]" /> {t.coachee_name}
                      </Link>
                    )}
                    {coach && !t.coachee_id && <span className="rounded-full bg-tint px-2 py-0.5 font-semibold text-accent">Meine Aufgabe</span>}
                    {t.by_coachee && <span>{coach ? "vom Coachee angelegt" : tr("von dir angelegt")}</span>}
                    {/* Zeigen ergibt nur Sinn für eigene Aufgaben: Was die andere Seite angelegt hat, kennt sie schon */}
                    {!t.done_at && (coach ? !t.by_coachee : t.by_coachee) && (t.coachee_id || coachees?.length) && (
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
                  // Löschen liegt im „…“-Menü, weg vom Haken, und fragt noch einmal nach
                  <details className="relative -my-2.5 -mr-2.5 shrink-0">
                    <summary aria-label={tr("Weitere Aktionen")} title={tr("Weitere Aktionen")} className="grid size-11 cursor-pointer list-none place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                      <Icon name="dots" className="size-5" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 rounded-xl border border-line-soft bg-surface p-2 shadow-lg">
                      <form action={removeTask.bind(null, t.id)} className="whitespace-nowrap">
                        <ConfirmButton label="Aufgabe löschen" />
                      </form>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
