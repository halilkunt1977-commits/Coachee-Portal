import { MessageForm } from "@/components/akte/MessageForm";
import { MessageList, TaskList, type Message, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { Empty, formatDate, formatUnits } from "@/components/ui";
import { ownCoachee, typeLabel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { categoriesFor, type ProfileItem } from "@/lib/profile";
import Link from "next/link";
import { SECTIONS, normalizeSections, sectionDone } from "@/lib/bp/sections";
import { one, query } from "@/lib/db";
import { unitsUsedSql } from "@/lib/attendance/units";

export const metadata = { title: "Mein Bereich" };

type SharedMeeting = { id: string; held_on: string; units: number; title: string; notes: string; results: string; next_steps: string };

export default async function MyArea() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;

  const [meetings, tasks, messages, coach, used, profile, plan, jobs] = await Promise.all([
    // Nur freigegebene Gespräche, interne Notizen werden gar nicht erst geladen
    query<SharedMeeting>("SELECT id, held_on, units, title, notes, results, next_steps FROM meetings WHERE coachee_id = $1 AND shared ORDER BY held_on DESC, created_at DESC", [c.id]),
    query<Task>("SELECT id, title, details, due_on, done_at FROM tasks WHERE coachee_id = $1 ORDER BY done_at IS NOT NULL, due_on NULLS LAST, created_at", [c.id]),
    query<Message>("SELECT m.id, m.body, m.created_at, m.author_id, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.coachee_id = $1 ORDER BY m.created_at", [c.id]),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    one<{ units: number }>(`SELECT ${unitsUsedSql("$1")} AS units`, [c.id]),
    // Interne Einträge (z. B. Gesundheit) werden gar nicht erst geladen
    query<ProfileItem>("SELECT id, category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND NOT internal ORDER BY created_at", [c.id]),
    c.coaching_type === "gruendung" ? one<{ sections: unknown }>("SELECT sections FROM business_plans WHERE coachee_id = $1", [c.id]) : null,
    c.coaching_type === "job"
      ? one<{ proposals: number; applied: number; talks: number; due: number }>(
          `SELECT count(*) FILTER (WHERE status = 'vorschlag')::int AS proposals,
                  count(*) FILTER (WHERE status IN ('beworben', 'gespraech', 'zusage', 'absage'))::int AS applied,
                  count(*) FILTER (WHERE status IN ('gespraech', 'zusage'))::int AS talks,
                  count(*) FILTER (WHERE next_on <= CURRENT_DATE AND status IN ('gemerkt', 'beworben', 'gespraech'))::int AS due
             FROM applications WHERE coachee_id = $1`,
          [c.id],
        )
      : null,
  ]);
  const sections = normalizeSections(plan?.sections);
  const written = SECTIONS.filter((s) => sectionDone(sections[s.key])).length;
  const groups = categoriesFor(c.coaching_type).map((cat) => ({ cat, list: profile.filter((p) => p.category === cat.key) })).filter((g) => g.list.length);
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [c.id, user.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Hallo {c.first_name}!</h1>
        <p className="text-muted">{typeLabel[c.coaching_type]} mit {coach?.name ?? "deinem Coach"}{c.units_total ? ` · ${formatUnits(used?.units)} von ${c.units_total} Einheiten` : ""}</p>
      </div>

      {c.goal && (
        <div className="card bg-tint/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Unser Ziel</p>
          <p className="mt-1 whitespace-pre-wrap text-lg">{c.goal}</p>
        </div>
      )}

      {c.coaching_type === "gruendung" && (
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="h2">Mein Businessplan</h2>
            <p className="text-sm text-muted">{written} von {SECTIONS.length} Abschnitten geschrieben</p>
            <div className="mt-2 h-1.5 max-w-sm rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-ok" style={{ width: `${(written / SECTIONS.length) * 100}%` }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/mein-bereich/finanzplan" className="btn-ghost">Finanzplan</Link>
            <Link href="/mein-bereich/businessplan" className="btn">Weiterschreiben</Link>
          </div>
        </div>
      )}

      {jobs && (
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="h2">Meine Bewerbungen</h2>
            <p className="text-sm text-muted">
              {jobs.applied ? `${jobs.applied} ${jobs.applied === 1 ? "Bewerbung" : "Bewerbungen"}${jobs.talks ? `, ${jobs.talks} ${jobs.talks === 1 ? "Gespräch" : "Gespräche"}` : ""}` : "Noch keine Bewerbung eingetragen"}
            </p>
            {jobs.proposals > 0 && <p className="mt-1 text-sm font-semibold text-gold">{jobs.proposals} {jobs.proposals === 1 ? "neue Stelle" : "neue Stellen"} von {coach?.name ?? "deinem Coach"} für dich</p>}
            {jobs.due > 0 && <p className="mt-1 text-sm font-semibold text-danger">Heute nachfassen: {jobs.due}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/mein-bereich/stellen" className="btn-ghost">Stellen finden</Link>
            <Link href="/mein-bereich/bewerbungen" className="btn">{jobs.proposals ? "Vorschläge ansehen" : "Zu den Bewerbungen"}</Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
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
        <section className="space-y-3">
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

      <section className="space-y-3">
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
