import { MessageForm } from "@/components/akte/MessageForm";
import { MessageList, TaskList, type Message, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { Empty, formatDate } from "@/components/ui";
import { ownCoachee, typeLabel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { categoriesFor, type ProfileItem } from "@/lib/profile";
import Link from "next/link";
import { Suspense } from "react";
import { one, query } from "@/lib/db";
import { categoryLabel } from "@/lib/documents";
import { progressFor, type Links } from "@/lib/dashboard/progress";
import { setCoacheeCity } from "@/app/actions/dashboard";
import { ChaptersCard, JobsFunnel, MilestonesCard, PartsGrid, UnitsCard } from "@/components/dashboard/ProgressBoard";
import { CityForm, NewsBox, NewsSkeleton, WeatherBox, WeatherSkeleton } from "@/components/dashboard/Widgets";
import { greeting, todayLong } from "@/components/dashboard/Hero";

export const metadata = { title: "Mein Bereich" };

type SharedMeeting = { id: string; held_on: string; units: number; title: string; notes: string; results: string; next_steps: string };

export default async function MyArea() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;

  const [meetings, tasks, messages, coach, profile, docs, progress] = await Promise.all([
    // Nur freigegebene Gespräche, interne Notizen werden gar nicht erst geladen
    query<SharedMeeting>("SELECT id, held_on, units, title, notes, results, next_steps FROM meetings WHERE coachee_id = $1 AND shared ORDER BY held_on DESC, created_at DESC", [c.id]),
    query<Task>("SELECT id, title, details, due_on, done_at FROM tasks WHERE coachee_id = $1 ORDER BY done_at IS NOT NULL, due_on NULLS LAST, created_at", [c.id]),
    query<Message>("SELECT m.id, m.body, m.created_at, m.author_id, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.coachee_id = $1 ORDER BY m.created_at", [c.id]),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    // Interne Einträge (z. B. Gesundheit) werden gar nicht erst geladen
    query<ProfileItem>("SELECT id, category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND NOT internal ORDER BY created_at", [c.id]),
    // Nur Dokumente, die der Coach freigegeben hat
    query<{ id: string; file_id: string; title: string; category: string; created_at: string }>("SELECT id, file_id, title, category, created_at FROM documents WHERE coachee_id = $1 AND shared ORDER BY created_at DESC", [c.id]),
    progressFor(c),
  ]);
  const links: Links = {
    cv: "/mein-bereich/lebenslauf",
    plan: "/mein-bereich/businessplan",
    finance: "/mein-bereich/finanzplan",
    profile: "#profil",
    survey: "/mein-bereich/erfahrung",
    jobs: "/mein-bereich/bewerbungen",
    attendance: "#gespraeche",
  };
  const openTasks = tasks.filter((t) => !t.done_at).length;
  const groups = categoriesFor(c.coaching_type).map((cat) => ({ cat, list: profile.filter((p) => p.category === cat.key) })).filter((g) => g.list.length);
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [c.id, user.id]);

  return (
    <div className="space-y-6">
      <section className="-mx-4 overflow-hidden bg-gradient-to-br from-accent via-[#24456f] to-[#2f5683] px-4 py-6 text-white sm:mx-0 sm:rounded-3xl sm:px-8 sm:py-8">
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(260px,340px)] md:items-center">
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-white/70">{todayLong()}</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl">{greeting()}, {c.first_name}!</h1>
            <p className="text-white/80">
              {typeLabel[c.coaching_type]} mit {coach?.name ?? "deinem Coach"}
              {c.end_date ? ` · bis ${formatDate(c.end_date)}` : ""}
            </p>
            {c.goal && (
              <div className="max-w-xl rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Unser Ziel</p>
                <p className="mt-0.5 whitespace-pre-wrap">{c.goal}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1 text-sm">
              {openTasks > 0 && <a href="#aufgaben" className="rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25">{openTasks} offene Aufgabe{openTasks > 1 ? "n" : ""}</a>}
              {(progress.jobs?.proposals ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="rounded-full bg-gold px-3 py-1 font-medium hover:opacity-90">{progress.jobs?.proposals} neue Stelle{progress.jobs?.proposals === 1 ? "" : "n"} für dich</Link>}
              {(progress.jobs?.due ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="rounded-full bg-white px-3 py-1 font-medium text-danger">Heute nachfassen: {progress.jobs?.due}</Link>}
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <Suspense fallback={<WeatherSkeleton />}>
              <WeatherBox city={progress.city} edit={<CityForm action={setCoacheeCity.bind(null, c.id)} city={c.city} placeholder="Dein Wohnort" />} />
            </Suspense>
          </div>
        </div>
      </section>

      <PartsGrid p={progress} links={links} />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-6">
          <UnitsCard p={progress} href={links.attendance} you />
          {c.coaching_type === "gruendung" ? <ChaptersCard p={progress} href={links.plan} /> : <JobsFunnel p={progress} href={links.jobs} />}
        </div>
        <MilestonesCard coacheeId={c.id} p={progress} you />
      </div>

      {docs.length > 0 && (
        <section className="card space-y-3">
          <h2 className="h2">Meine Dokumente</h2>
          <ul className="divide-y divide-line-soft text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <a href={`/api/dateien/${d.file_id}`} target="_blank" rel="noreferrer" className="link font-medium">{d.title}</a>
                <span className="text-xs text-muted">{categoryLabel(d.category)} · {formatDate(d.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="aufgaben" className="card scroll-mt-24 space-y-4">
          <h2 className="h2">Meine Aufgaben</h2>
          <TaskList coacheeId={c.id} tasks={tasks} coach={false} />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Eigene Aufgabe hinzufügen</summary>
            <div className="pt-3"><TaskForm coacheeId={c.id} coach={false} /></div>
          </details>
        </section>
        <section className="card space-y-4">
          <h2 className="h2">Nachrichten</h2>
          <div className="max-h-96 overflow-y-auto"><MessageList messages={messages} selfId={user.id} /></div>
          <MessageForm coacheeId={c.id} />
        </section>
      </div>

      {groups.length > 0 && (
        <section id="profil" className="scroll-mt-24 space-y-3">
          <h2 className="h2">{c.coaching_type === "job" ? "Meine Stärken und Kompetenzen" : "Bausteine für meinen Businessplan"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map(({ cat, list }) => (
              <div key={cat.key} className="card space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">{cat.label}</p>
                <ul className="space-y-1.5">
                  {list.map((i) => (
                    <li key={i.id}>
                      <p className="font-medium">{i.title}{i.level && <span className="ml-2 tracking-wider text-accent">{"●".repeat(i.level)}<span className="text-line">{"●".repeat(5 - i.level)}</span></span>}</p>
                      {i.detail && <p className="text-sm text-muted">{i.detail}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="h2">Schlagzeilen</h2>
        <Suspense fallback={<NewsSkeleton />}>
          <NewsBox />
        </Suspense>
      </section>

      <section id="gespraeche" className="scroll-mt-24 space-y-3">
        <h2 className="h2">Unsere Gespräche</h2>
        {meetings.length === 0 && <Empty>Hier erscheinen die Zusammenfassungen unserer Gespräche.</Empty>}
        {meetings.map((m) => (
          <article key={m.id} className="card space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{m.title}</h3><p className="text-sm text-muted">{formatDate(m.held_on)}</p></div>
            {m.notes && <p className="whitespace-pre-wrap text-sm">{m.notes}</p>}
            {m.results && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Ergebnisse: </span>{m.results}</p>}
            {m.next_steps && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Nächste Schritte: </span>{m.next_steps}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
