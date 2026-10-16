import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { Empty } from "@/components/ui";
import type { Coachee } from "@/lib/access";
import type { User } from "@/lib/auth";
import { KINDS, msUntil, relativeDay, todayBerlin } from "@/lib/calendar/dates";
import { graphEnabled } from "@/lib/calendar/graph";
import { appointmentFor, appointmentsOfCoachee, type Appointment } from "@/lib/calendar/store";
import { AppointmentDetail } from "./AppointmentDetail";
import { AppointmentForm } from "./AppointmentForm";

/** Reiter „Termine“ in der Akte: geplante und vergangene Termine dieses Coachees, Anlegen mit festem Coachee */
export async function AkteTermine({ coach, coachee, sp }: { coach: User; coachee: Coachee; sp: Record<string, string | string[] | undefined> }) {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const all = await appointmentsOfCoachee(coach.id, coachee.id);
  const editId = str(sp.bearbeiten);
  const selId = str(sp.termin) ?? editId;
  const selected = selId ? await appointmentFor(coach, selId) : null;
  const editing = editId && selected?.id === editId ? selected : null;
  const creating = sp.neu === "1";
  const upcoming = all.filter((a) => msUntil(a.ends_at) > 0 && a.status === "geplant").reverse();
  const past = all.filter((a) => !upcoming.includes(a));
  const base = "?tab=termine";
  const name = `${coachee.first_name} ${coachee.last_name}`;

  const panel = creating || editing ? (
    <section className="card rise space-y-4">
      <div>
        <p className="eyebrow">{editing ? "Termin ändern" : `Neuer Termin mit ${coachee.first_name}`}</p>
        <h2 className="h2">{editing ? editing.title : "Was steht an?"}</h2>
      </div>
      <AppointmentForm
        id={editing?.id ?? null}
        ret="akte"
        coachees={[{ id: coachee.id, name, email: coachee.email }]}
        fixedCoachee
        graph={graphEnabled()}
        cancelHref={editing ? `${base}&termin=${editing.id}` : base}
        defaults={
          editing
            ? { coachee_id: coachee.id, title: editing.title, kind: editing.kind, day: editing.day, start: editing.start, end: editing.end, location: editing.location, notes: editing.notes, join_url: editing.join_url, invited: Boolean(editing.invited_at) }
            : { coachee_id: coachee.id, day: todayBerlin() }
        }
      />
    </section>
  ) : selected ? (
    <AppointmentDetail a={selected} coach ret="akte" editHref={`${base}&bearbeiten=${selected.id}`} closeHref={base} hint={str(sp.hinweis)} />
  ) : null;

  return (
    <div className={`grid gap-6 ${panel ? "lg:grid-cols-[1fr_380px]" : ""}`}>
      <div className={`min-w-0 space-y-6 ${panel ? "order-2 lg:order-none" : ""}`}>
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Geplant</h2>
            <div className="flex gap-2">
              <Link href={`/coach/kalender?coachee=${coachee.id}&neu=1`} className="btn-ghost btn-sm">Im Kalender</Link>
              <Link href={`${base}&neu=1`} scroll={false} className="btn btn-sm"><Icon name="plus" className="size-3.5" /> Termin planen</Link>
            </div>
          </div>
          {upcoming.length ? <Rows items={upcoming} base={base} selected={selected?.id} /> : <Empty>Kein Termin geplant.</Empty>}
        </section>
        {past.length > 0 && (
          <section className="card space-y-3">
            <h2 className="h2">Vergangen und abgesagt</h2>
            <Rows items={past} base={base} selected={selected?.id} muted />
          </section>
        )}
      </div>
      {panel && <aside className="space-y-6">{panel}</aside>}
    </div>
  );
}

function Rows({ items, base, selected, muted }: { items: Appointment[]; base: string; selected?: string; muted?: boolean }) {
  const today = todayBerlin();
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`${base}&termin=${a.id}`} scroll={false} className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2 ${selected === a.id ? "bg-tint/60" : ""}`}>
            <span className={`size-2.5 shrink-0 rounded-full ${KINDS[a.kind].dot}`} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-semibold ${a.status === "abgesagt" ? "text-muted line-through" : muted ? "text-ink/80" : ""}`}>{a.title}</span>
              <span className="block text-xs text-muted">{relativeDay(a.day, today)} · {a.start}–{a.end} · {KINDS[a.kind].short}{a.invited_at ? " · eingeladen" : ""}</span>
            </span>
            {a.join_url && a.status === "geplant" && !muted && <span className="rounded-full bg-[#5b5fc7] px-2 py-0.5 text-[10px] font-bold text-white">Teams</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
