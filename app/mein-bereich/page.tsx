import { TaskList, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { Empty, formatDate } from "@/components/ui";
import { ownCoachee, typeLabel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { categoriesFor, type ProfileItem } from "@/lib/profile";
import Link from "next/link";
import { AppSetup } from "@/components/app/AppSetup";
import { pushPublicKey } from "@/lib/push";
import { Suspense } from "react";
import { one, query } from "@/lib/db";
import { categoryLabel } from "@/lib/documents";
import { progressFor, type Links } from "@/lib/dashboard/progress";
import { setCoacheeCity } from "@/app/actions/dashboard";
import { ChaptersCard, JobsFunnel, MilestonesCard, PartsGrid, UnitsCard } from "@/components/dashboard/ProgressBoard";
import { CityForm, NewsBox, NewsSkeleton, WeatherBox, WeatherSkeleton } from "@/components/dashboard/Widgets";
import { greeting, todayLong } from "@/components/dashboard/Hero";
import { Ring } from "@/components/dashboard/Charts";
import { Icon } from "@/components/shell/icons";
import { TeamsMark } from "@/components/calendar/AppointmentDetail";
import { dayMedium, KINDS, msUntil, relativeDay, todayBerlin } from "@/lib/calendar/dates";
import { upcomingAppointments, type Appointment } from "@/lib/calendar/store";
import { BruttoNetto } from "@/components/dashboard/BruttoNetto";
import { JobTips, JobTipsSkeleton } from "@/components/dashboard/JobTips";
import { GruenderWissen, HebesatzCard } from "@/components/dashboard/Gruender";
import { FoerderCard, FoerderWahl } from "@/components/handbuch/FoerderCard";
import { FOERDERUNGEN } from "@/lib/handbuch/foerderung";
import { findeHebesatz } from "@/lib/tax/hebesaetze";
import { BUNDESLAENDER, type Bundesland } from "@/lib/tax/lohnsteuer";
import { inboxEntries, inboxThread, inboxUnread, type InboxEntry } from "@/lib/coachee-inbox";

const INBOX_LABEL: Record<InboxEntry["kind"], string> = { aufgabe: "Aufgabe", stelle: "Stellenvorschlag", anschreiben: "Anschreiben", dokument: "Dokument", termin: "Termin" };
const entryTitle = (e: InboxEntry) => (e.kind === "aufgabe" ? e.task.title : e.kind === "stelle" || e.kind === "anschreiben" ? e.job.title : e.kind === "dokument" ? e.doc.title : e.appt.title);

/** Kurzer Blick in den Posteingang: das Neueste, Tippen öffnet den Eintrag dort */
function InboxTeaser({ unread, items }: { unread: number; items: { id: string; label: string; title: string; unread: boolean; at: string }[] }) {
  return (
    <section id="nachrichten" className="card min-w-0 scroll-mt-24 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2">Posteingang</h2>
        {unread > 0 && <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold text-white">{unread} neu</span>}
      </div>
      {items.length === 0 ? (
        <Empty>Nachrichten, Aufgaben, Stellen und Dokumente von deinem Coach landen hier.</Empty>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/mein-bereich/posteingang?offen=${i.id}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent">
                <span className={`size-2 shrink-0 rounded-full ${i.unread ? "bg-danger" : "bg-line"}`} aria-label={i.unread ? "ungelesen" : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{i.label}</span>
                  <span className={`block truncate ${i.unread ? "font-bold" : "font-medium"}`}>{i.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{formatDate(i.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/mein-bereich/posteingang" className="btn-ghost btn-sm w-full justify-center sm:w-auto">Zum Posteingang · antworten</Link>
    </section>
  );
}

function NextStep({ label, hint, href }: { label: string; hint: string; href: string }) {
  return (
    <Link href={href} className="group flex max-w-xl items-center gap-4 rounded-2xl bg-gradient-to-r from-[#f3d9a6] to-[#d6a35b] p-4 text-night shadow-[0_18px_40px_-20px_rgba(214,163,91,.9)] transition hover:brightness-105">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-night/90 text-[#f3d9a6]"><Icon name="flag" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-night/60">Dein nächster Schritt</span>
        <span className="block font-[family-name:var(--font-display)] text-lg leading-tight font-bold">{label}</span>
        <span className="block truncate text-xs text-night/70">{hint}</span>
      </span>
      <span className="transition group-hover:translate-x-1"><Icon name="arrow" /></span>
    </Link>
  );
}

/** Einstieg ins Handbuch: wie ein Buchrücken, mit dem Hinweis, dass es auch nach dem Coaching bleibt */
function HandbookTeaser({ closed, gruendung }: { closed: boolean; gruendung: boolean }) {
  return (
    <Link href="/mein-bereich/handbuch" className="card card-hover group flex items-center gap-4 !p-4 sm:!p-5">
      <span aria-hidden className="relative grid h-16 w-12 shrink-0 place-items-center rounded-r-lg rounded-l-sm bg-gradient-to-br from-[#16325a] to-[#0a1628] shadow-[0_10px_20px_-10px_rgba(10,22,40,.8)]">
        <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-sm bg-black/30" />
        <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[#e2bd7d]">G</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block !text-gold">Mein Handbuch</span>
        <span className="block font-[family-name:var(--font-display)] text-lg leading-tight font-bold">{closed ? "Dein Leitfaden für die Zeit nach dem Coaching" : "Dein Leitfaden für nach dem Coaching"}</span>
        <span className="block text-sm text-muted">{gruendung ? "Förderung, Anmeldungen, Versicherungen, Steuertermine und Kontakte" : "Bewerbungsroutine, Vorstellungsgespräch, Probezeit, Meldepflichten und Kontakte"}. Zum Abhaken und als PDF.</span>
      </span>
      <span className="text-accent transition group-hover:translate-x-1"><Icon name="arrow" /></span>
    </Link>
  );
}

function NextAppointment({ a }: { a: Appointment }) {
  const today = todayBerlin();
  const soon = msUntil(a.starts_at) < 30 * 60_000;
  return (
    <div className="glass space-y-3 p-4">
      <Link href={`/mein-bereich/kalender?datum=${a.day}&termin=${a.id}`} className="flex items-center gap-3">
        <span className={`grid w-14 shrink-0 place-items-center rounded-xl py-1.5 text-center leading-none ${a.day === today ? "bg-gradient-to-br from-[#e2bd7d] to-gold text-night" : "bg-white/10"}`}>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{relativeDay(a.day, today).split(" ")[0].replace(",", "")}</span>
          <span className="mt-1 text-lg font-bold tabular-nums">{a.start}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Nächster Termin</span>
          <span className="block truncate font-semibold">{a.title}</span>
          <span className="block truncate text-xs text-white/60">{KINDS[a.kind].label}{a.day !== today ? ` · ${dayMedium(a.day)}` : ""}</span>
        </span>
      </Link>
      {a.join_url && (
        <a href={a.join_url} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 ${soon ? "bg-[#5b5fc7] shadow-[0_8px_20px_-8px_#5b5fc7]" : "bg-white/10"}`}>
          <TeamsMark /> {soon ? "Jetzt teilnehmen" : "Teams-Link"}
        </a>
      )}
    </div>
  );
}

export const metadata = { title: "Mein Bereich" };

type SharedMeeting = { id: string; held_on: string; units: number; title: string; notes: string; results: string; next_steps: string };

export default async function MyArea() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;

  const [meetings, tasks, coach, profile, docs, progress, [nextAppt], inbox, thread, unread] = await Promise.all([
    // Nur freigegebene Gespräche, interne Notizen werden gar nicht erst geladen
    query<SharedMeeting>("SELECT id, held_on, units, title, notes, results, next_steps FROM meetings WHERE coachee_id = $1 AND shared ORDER BY held_on DESC, created_at DESC", [c.id]),
    query<Task>("SELECT id, title, details, due_on, done_at FROM tasks WHERE coachee_id = $1 ORDER BY done_at IS NOT NULL, due_on NULLS LAST, created_at", [c.id]),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    // Interne Einträge (z. B. Gesundheit) werden gar nicht erst geladen
    query<ProfileItem>("SELECT id, category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND NOT internal ORDER BY created_at", [c.id]),
    // Nur Dokumente, die der Coach freigegeben hat
    query<{ id: string; file_id: string; title: string; category: string; created_at: string }>("SELECT id, file_id, title, category, created_at FROM documents WHERE coachee_id = $1 AND shared ORDER BY created_at DESC", [c.id]),
    progressFor(c),
    upcomingAppointments(user, 1),
    inboxEntries(c.id, 4),
    inboxThread(c.id, user.id),
    inboxUnread(c.id, user.id),
  ]);
  // Nachrichten werden erst im Posteingang als gelesen markiert
  const teaser = [
    ...(thread ? [{ id: "nachrichten", label: "Nachrichten", title: thread.unread ? `${thread.unread} neue Nachricht${thread.unread === 1 ? "" : "en"}` : `${thread.mine ? "Du: " : ""}${thread.preview}`, unread: thread.unread > 0, at: thread.at }] : []),
    ...inbox.map((e) => ({ id: e.id, label: INBOX_LABEL[e.kind], title: entryTitle(e), unread: e.unread, at: e.at })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const newMessages = thread?.unread ?? 0;
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
  const closed = c.status === "abgeschlossen";
  const next = progress.milestones.find((m) => !m.done);
  const STEP_LINK: Record<string, string> = {
    idee: links.plan, businessplan: links.plan, finanzplan: links.finance, lebenslauf: links.cv, erfahrung: links.survey,
    profil: "#profil", bewerbung: links.jobs, gespraech: links.jobs, zusage: links.jobs, anschreiben: "/mein-bereich/lebenslauf",
  };
  const nextHref = next ? STEP_LINK[next.key] ?? "#etappen" : "#etappen";
  // Bundesland für den Brutto-Netto-Rechner aus dem Wohnort vorbelegen (Kirchensteuer, Pflegeversicherung in Sachsen)
  const land = findeHebesatz(progress.city)?.treffer.land;
  const defaultLand = BUNDESLAENDER.find((b) => b.key === land)?.key as Bundesland | undefined;
  const groups = categoriesFor(c.coaching_type).map((cat) => ({ cat, list: profile.filter((p) => p.category === cat.key) })).filter((g) => g.list.length);

  return (
    <div className="space-y-6">
      <section className="rise night relative -mx-4 -mt-6 overflow-hidden px-5 pt-8 pb-7 sm:mx-0 sm:mt-0 sm:rounded-[28px] sm:px-9 sm:py-9">
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
          <div className="min-w-0 space-y-5">
            <div className="space-y-2">
              <p className="text-sm text-white/60">{todayLong()}</p>
              <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
                {greeting()}, <span className="text-gradient-gold">{c.first_name}</span>!
              </h1>
              <p className="text-white/70">
                {typeLabel[c.coaching_type]} mit {coach?.name ?? "deinem Coach"}
                {closed ? " · abgeschlossen" : c.end_date ? ` · bis ${formatDate(c.end_date)}` : ""}
              </p>
              {closed && <p className="max-w-xl text-sm text-white/70">Dein Portal bleibt für dich da: Lebenslauf, {c.coaching_type === "gruendung" ? "Businessplan, Finanzplan" : "Stellen, Bewerbungen"}, Rechner und dein Handbuch kannst du weiter kostenlos nutzen.</p>}
            </div>
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="glass flex items-center gap-4 py-3 pr-5 pl-3">
                <Ring pct={progress.overall} size={76} stroke={8} tone="white" track="rgba(255,255,255,.15)">
                  <span className="font-[family-name:var(--font-display)] text-lg font-bold">{progress.overall}%</span>
                </Ring>
                <div>
                  <p className="text-xs text-white/55">Dein Fortschritt</p>
                  <p className="font-semibold">{progress.milestones.filter((m) => m.done).length} von {progress.milestones.length} Etappen</p>
                </div>
              </div>
              {progress.units.rest != null && !closed && (
                <div className="glass flex flex-col justify-center px-5 py-3">
                  <p className="text-xs text-white/55">Noch für dich</p>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">{progress.units.rest.toLocaleString("de-DE", { maximumFractionDigits: 1 })} <span className="text-sm font-medium text-white/60">Einheiten</span></p>
                </div>
              )}
            </div>
            {next && !closed && (
              <NextStep label={next.action} hint={next.hint} href={nextHref} />
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              {unread > 0 && (
                <Link href={newMessages ? "/mein-bereich/posteingang?offen=nachrichten" : "/mein-bereich/posteingang"} className="inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 font-semibold text-white transition hover:brightness-110">
                  <Icon name="mail" className="size-4" />
                  {newMessages === unread ? `${unread} neue Nachricht${unread === 1 ? "" : "en"}` : `${unread} Neues`} im Posteingang
                </Link>
              )}
              {openTasks > 0 && <Link href="/mein-bereich/aufgaben" className="rounded-full bg-white/10 px-3 py-1 font-medium transition hover:bg-white/20">{openTasks} offene Aufgabe{openTasks > 1 ? "n" : ""}</Link>}
              {(progress.jobs?.proposals ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="rounded-full bg-gold px-3 py-1 font-semibold text-night transition hover:brightness-110">{progress.jobs?.proposals} neue Stelle{progress.jobs?.proposals === 1 ? "" : "n"} für dich</Link>}
              {(progress.jobs?.due ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="rounded-full bg-white px-3 py-1 font-semibold text-danger">Heute nachfassen: {progress.jobs?.due}</Link>}
            </div>
          </div>
          <div className="space-y-3">
            {nextAppt && <NextAppointment a={nextAppt} />}
            <div className="glass p-4">
              <Suspense fallback={<WeatherSkeleton />}>
                <WeatherBox city={progress.city} edit={<CityForm action={setCoacheeCity.bind(null, c.id)} city={c.city} placeholder="Dein Wohnort" />} />
              </Suspense>
            </div>
            {c.goal && (
              <div className="glass px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Unser Ziel</p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug">{c.goal}</p>
              </div>
            )}
          </div>
        </div>
      </section>
      <AppSetup publicKey={await pushPublicKey()} what="bei Nachrichten, Aufgaben und Terminen von deinem Coach" compact />

      {closed && <HandbookTeaser closed gruendung={c.coaching_type === "gruendung"} />}

      <PartsGrid p={progress} links={links} overall={false} />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-6">
          <UnitsCard p={progress} href={links.attendance} you />
          {c.coaching_type === "gruendung" ? <ChaptersCard p={progress} href={links.plan} /> : <JobsFunnel p={progress} href={links.jobs} />}
        </div>
        <MilestonesCard coacheeId={c.id} p={progress} you />
      </div>

      {c.coaching_type === "job" ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <section id="stellen-tipps" className="card min-w-0 scroll-mt-24 space-y-3">
            <h2 className="h2">Stellen, die zu dir passen</h2>
            <Suspense fallback={<JobTipsSkeleton />}>
              <JobTips c={c} />
            </Suspense>
          </section>
          <BruttoNetto defaultLand={defaultLand} />
        </div>
      ) : (
        <>
          {c.foerderart === "gruendungszuschuss" || c.foerderart === "einstiegsgeld" ? (
            <FoerderCard info={FOERDERUNGEN[c.foerderart]} handbookHref="/mein-bereich/handbuch#foerderung" />
          ) : c.foerderart !== "sonstiges" ? (
            <FoerderWahl handbookHref="/mein-bereich/handbuch#foerderung" />
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <HebesatzCard city={progress.city} action={setCoacheeCity.bind(null, c.id)} />
            <GruenderWissen />
          </div>
        </>
      )}

      {!closed && <HandbookTeaser closed={false} gruendung={c.coaching_type === "gruendung"} />}

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
        <InboxTeaser unread={unread} items={teaser} />
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
