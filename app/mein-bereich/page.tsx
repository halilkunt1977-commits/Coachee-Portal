import { TaskList, type Task } from "@/components/akte/Lists";
import { Empty, formatDate, formatHours } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
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
import { Icon } from "@/components/shell/icons";
import { TeamsMark } from "@/components/calendar/AppointmentDetail";
import { dayMedium, KINDS, msUntil, relativeDay, todayBerlin } from "@/lib/calendar/dates";
import { upcomingAppointments } from "@/lib/calendar/store";
import { MoreSection } from "@/components/dashboard/MoreSection";
import { JobTips, JobTipsSkeleton } from "@/components/dashboard/JobTips";
import { FoerderCard, FoerderWahl } from "@/components/handbuch/FoerderCard";
import { FOERDERUNGEN } from "@/lib/handbuch/foerderung";
import { inboxEntries, inboxThread, inboxUnread, type InboxEntry } from "@/lib/coachee-inbox";
import { VideoTeaser } from "@/components/erklaervideo/VideoTeaser";
import { hasFeature } from "@/lib/features";
import type { T } from "@/lib/i18n";
import { getT, serverLang } from "@/lib/i18n-server";
import { ActivityCard, DoneItem, Feature, Panel, StatTile, StepCard, SummitArt } from "@/components/dashboard/Home";

const INBOX_LABEL: Record<InboxEntry["kind"], string> = { aufgabe: "Aufgabe", stelle: "Stelle", anschreiben: "Anschreiben", dokument: "Dokument", termin: "Termin", lebenslauf: "Lebenslauf", businessplan: "Businessplan", finanzplan: "Finanzplan", vorbereitung: "Gesprächsvorbereitung" };
const entryTitle = (e: InboxEntry) =>
  e.kind === "aufgabe" ? e.task.title
  : e.kind === "stelle" || e.kind === "anschreiben" || e.kind === "vorbereitung" ? e.job.title
  : e.kind === "dokument" ? e.doc.title
  : e.kind === "lebenslauf" ? e.cv.name
  : e.kind === "businessplan" || e.kind === "finanzplan" ? e.plan.title
  : e.appt.title;

/** Kurzer Blick in den Posteingang: das Neueste, Tippen öffnet den Eintrag dort */
function InboxTeaser({ t, unread, items }: { t: T; unread: number; items: { id: string; label: string; title: string; unread: boolean; at: string }[] }) {
  return (
    <section id="nachrichten" className="card min-w-0 scroll-mt-24 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2">{t("Posteingang")}</h2>
        {unread > 0 && <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold text-white">{t("{n} neu", { n: unread })}</span>}
      </div>
      {items.length === 0 ? (
        <Empty>{t("Nachrichten, Aufgaben, Stellen und Dokumente von deinem Coach landen hier.")}</Empty>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/mein-bereich/posteingang?offen=${i.id}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent">
                <span className={`size-2 shrink-0 rounded-full ${i.unread ? "bg-danger" : "bg-line"}`} aria-label={i.unread ? t("ungelesen") : undefined} />
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
      <Link href="/mein-bereich/posteingang" className="btn-ghost btn-sm tap w-full justify-center sm:w-auto">{t("Zum Posteingang · antworten")}</Link>
    </section>
  );
}


/** Einstieg ins Handbuch: wie ein Buchrücken, mit dem Hinweis, dass es auch nach dem Coaching bleibt */
function HandbookTeaser({ t, closed, gruendung }: { t: T; closed: boolean; gruendung: boolean }) {
  return (
    <Link href="/mein-bereich/handbuch" className="card card-hover group flex items-center gap-4 !p-4 sm:!p-5">
      <span aria-hidden className="relative grid h-16 w-12 shrink-0 place-items-center rounded-r-lg rounded-l-sm bg-gradient-to-br from-[#16325a] to-[#0a1628] shadow-[0_10px_20px_-10px_rgba(10,22,40,.8)]">
        <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-sm bg-black/30" />
        <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[#e2bd7d]">G</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block !text-gold">{t("Mein Handbuch")}</span>
        <span className="block font-[family-name:var(--font-display)] text-lg leading-tight font-bold">{closed ? t("Dein Leitfaden für die Zeit nach dem Coaching") : t("Dein Leitfaden für die Zeit während und nach dem Coaching")}</span>
        <span className="block text-sm text-muted">{gruendung ? t("Förderung, Anmeldungen, Versicherungen, Steuertermine und Kontakte. Zum Abhaken und als PDF.") : t("Bewerbungsroutine, Vorstellungsgespräch, Probezeit, Meldepflichten und Kontakte. Zum Abhaken und als PDF.")}</span>
      </span>
      <span className="text-accent transition group-hover:translate-x-1"><Icon name="arrow" /></span>
    </Link>
  );
}


export const generateMetadata = async () => ({ title: (await getT())("Mein Bereich") });

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
const DAY_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** Aktive Tage: laufende Woche (Mo–So), Tage in Folge bis heute (gestern zählt mit, wenn heute noch nichts war) und längste Serie */
function streakOf(days: Set<string>, lang: "de" | "tr") {
  const now = new Date();
  const todayStr = ymd(now);
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = ymd(new Date(now.getTime() + (i - dow) * 86400_000));
    return { label: (lang === "tr" ? DAY_TR : DAY_DE)[i], active: days.has(d), today: d === todayStr, future: d > todayStr };
  });
  let streak = 0;
  for (let k = days.has(todayStr) ? 0 : 1; days.has(ymd(new Date(now.getTime() - k * 86400_000))); k++) streak++;
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of sorted) {
    run = prev && ymd(new Date(new Date(`${prev}T12:00:00Z`).getTime() + 86400_000)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { week, streak, best: Math.max(best, streak) };
}

const ago = (iso: string, lang: "de" | "tr", t: T) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return t("gerade eben");
  if (h < 24) return t("vor {n} Std.", { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t("gestern") : d < 14 ? t("vor {n} Tagen", { n: d }) : new Date(iso).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", { day: "2-digit", month: "2-digit" });
};

type SharedMeeting = { id: string; held_on: string; units: number; title: string; notes: string; results: string; next_steps: string };

/*
 * Startseite für Coachees. Oben nur, was jetzt zählt: nächster Schritt, nächster Termin, offene Aufgaben, Posteingang
 * und ein kurzer Stand. Alles Weitere (Etappen, Stunden, Stärken, Gespräche, Schlagzeilen …) liegt unter „Mehr anzeigen“,
 * die Rechner auf einer eigenen Seite.
 */
export default async function MyArea() {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  const [t, lang] = await Promise.all([getT(), serverLang()]);
  if (!c) return <Empty>{t("Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.")}</Empty>;

  // Besuch heute einmal merken (für „Tage in Folge aktiv“)
  await query("INSERT INTO audit_log (user_id, coachee_id, action) SELECT $1, $2, 'besuch' WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'besuch' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')", [user.id, c.id]).catch(() => undefined);
  const [meetings, tasks, coach, profile, docs, progress, [nextAppt], inbox, thread, unread, activeDays, doneTasks] = await Promise.all([
    // Nur freigegebene Gespräche, interne Notizen werden gar nicht erst geladen
    query<SharedMeeting>("SELECT id, held_on, units, title, notes, results, next_steps FROM meetings WHERE coachee_id = $1 AND shared ORDER BY held_on DESC, created_at DESC", [c.id]),
    query<Task>("SELECT id, title, details, due_on, done_at FROM tasks WHERE coachee_id = $1 AND done_at IS NULL ORDER BY due_on NULLS LAST, created_at", [c.id]),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    // Interne Einträge (z. B. Gesundheit) werden gar nicht erst geladen
    query<ProfileItem>("SELECT id, category, title, detail, level FROM profile_items WHERE coachee_id = $1 AND NOT internal ORDER BY created_at", [c.id]),
    // Nur Dokumente, die der Coach freigegeben hat
    query<{ id: string; file_id: string; title: string; category: string; created_at: string }>("SELECT id, file_id, title, category, created_at FROM documents WHERE coachee_id = $1 AND shared ORDER BY created_at DESC", [c.id]),
    progressFor(c, t),
    upcomingAppointments(user, 1),
    inboxEntries(c.id, 3),
    inboxThread(c.id, user.id, t),
    inboxUnread(c.id, user.id),
    query<{ day: string }>("SELECT DISTINCT to_char(created_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day FROM audit_log WHERE user_id = $1 AND created_at > now() - interval '400 days'", [user.id]),
    query<{ title: string; done_at: string }>("SELECT title, done_at FROM tasks WHERE coachee_id = $1 AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT 5", [c.id]),
  ]);
  const activity = streakOf(new Set(activeDays.map((d) => d.day)), lang);
  // Nachrichten werden erst im Posteingang als gelesen markiert
  const teaser = [
    ...(thread ? [{ id: "nachrichten", label: t("Nachrichten"), title: thread.unread ? t(thread.unread === 1 ? "{n} neue Nachricht" : "{n} neue Nachrichten", { n: thread.unread }) : `${thread.mine ? `${t("Du:")} ` : ""}${thread.preview}`, unread: thread.unread > 0, at: thread.at }] : []),
    ...inbox.map((e) => ({ id: e.id, label: t(INBOX_LABEL[e.kind]), title: entryTitle(e), unread: e.unread, at: e.at })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
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
  const gruendung = c.coaching_type === "gruendung";
  const openTasks = tasks.length;
  const closed = c.status === "abgeschlossen";
  const next = progress.milestones.find((m) => !m.done);
  const doneSteps = progress.milestones.filter((m) => m.done).length;
  const STEP_LINK: Record<string, string> = {
    idee: links.plan, businessplan: links.plan, finanzplan: links.finance, lebenslauf: links.cv, erfahrung: links.survey,
    profil: "#profil", bewerbung: links.jobs, gespraech: links.jobs, zusage: links.jobs, anschreiben: "/mein-bereich/lebenslauf",
  };
  const nextHref = next ? STEP_LINK[next.key] ?? "#etappen" : "#etappen";
  const groups = categoriesFor(c.coaching_type).map((cat) => ({ cat, list: profile.filter((p) => p.category === cat.key) })).filter((g) => g.list.length);

  const recent = [
    ...progress.milestones.filter((m) => m.done && m.done_on).map((m) => ({ title: t(m.label), sub: t("Etappe erreicht"), at: m.done_on! })),
    ...doneTasks.map((d) => ({ title: d.title, sub: t("Aufgabe erledigt"), at: d.done_at })),
  ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 4);
  const headline = closed
    ? [t("Gut gemacht."), t("Dein Portal bleibt.")]
    : gruendung
      ? [t("Heute planen."), t("Morgen gründen.")]
      : [t("Heute dranbleiben."), t("Morgen im neuen Job.")];
  const third = gruendung
    ? { icon: "chart" as const, value: `${progress.sections.filter((x) => x.done).length}/${progress.sections.length}`, label: t("Kapitel"), href: links.plan }
    : { icon: "briefcase" as const, value: String(progress.jobs?.applied ?? 0), label: t("Bewerbungen"), href: links.jobs };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-6">
          {/* Begrüßung */}
          <section className="rise card relative overflow-hidden !p-0">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surface via-surface to-tint/70" aria-hidden />
            <div className="relative grid items-center gap-4 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-4">
                <p className="text-sm text-muted">{t("Schön, dass du da bist, {name}!", { name: c.first_name })} <span aria-hidden>👋</span></p>
                <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-5xl">
                  <span className="block text-night">{headline[0]}</span>
                  <span className="block text-accent">{headline[1]}</span>
                </h1>
                <p className="max-w-xl text-muted">
                  {t(c.coaching_type === "job" ? "Jobcoaching mit {coach}" : "Gründungscoaching mit {coach}", { coach: coach?.name ?? t("deinem Coach") })}
                  {closed ? ` · ${t("abgeschlossen")}` : c.end_date ? ` · ${t("bis {datum}", { datum: formatDate(c.end_date) })}` : ""}
                  {closed && <span className="block text-sm">{gruendung ? t("Dein Portal bleibt für dich da: Lebenslauf, Businessplan, Finanzplan, Rechner und dein Handbuch kannst du weiter kostenlos nutzen.") : t("Dein Portal bleibt für dich da: Lebenslauf, Stellen, Bewerbungen, Rechner und dein Handbuch kannst du weiter kostenlos nutzen.")}</span>}
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {unread > 0 && (
                    <Link href={newMessages ? "/mein-bereich/posteingang?offen=nachrichten" : "/mein-bereich/posteingang"} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-danger px-3.5 py-1.5 font-semibold text-white transition hover:brightness-110">
                      <Icon name="mail" className="size-4" />
                      {newMessages === unread ? t(unread === 1 ? "{n} neue Nachricht im Posteingang" : "{n} neue Nachrichten im Posteingang", { n: unread }) : t("{n} Neues im Posteingang", { n: unread })}
                    </Link>
                  )}
                  {(progress.jobs?.proposals ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="inline-flex min-h-10 items-center rounded-full bg-gold px-3.5 py-1.5 font-semibold text-night transition hover:brightness-110">{t(progress.jobs?.proposals === 1 ? "{n} neue Stelle für dich" : "{n} neue Stellen für dich", { n: progress.jobs?.proposals ?? 0 })}</Link>}
                  {(progress.jobs?.due ?? 0) > 0 && <Link href="/mein-bereich/bewerbungen" className="inline-flex min-h-10 items-center rounded-full border border-danger/30 bg-danger-soft px-3.5 py-1.5 font-semibold text-danger">{t("Heute nachfassen: {n}", { n: progress.jobs?.due ?? 0 })}</Link>}
                </div>
                <div className="hidden gap-3 border-t border-line-soft pt-4 sm:grid sm:grid-cols-3">
                  <Feature icon="users" title={t("Persönlich")} hint={coach?.name ?? t("Dein Coach")} />
                  <Feature icon="flag" title={t("Strukturiert")} hint={t("Schritt für Schritt")} />
                  <Feature icon="shield" title={t("Begleitet")} hint={t("Bis zu deinem Ziel")} />
                </div>
              </div>
              <SummitArt className="mx-auto hidden w-full max-w-[260px] md:block" />
            </div>
          </section>

          {hasFeature(c, "erklaervideo") && !c.video_seen_at && !c.video_card_hidden_at && (
            <div className="night rounded-2xl p-3"><VideoTeaser coacheeId={c.id} firstName={c.first_name} type={c.coaching_type} lang={c.language} /></div>
          )}
          {closed && <HandbookTeaser t={t} closed gruendung={gruendung} />}

          {/* Nächste Schritte */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2">{t("Deine nächsten Schritte")}</h2>
              <Link href="#etappen" className="text-sm font-semibold text-accent hover:underline">{t("Alle anzeigen")}</Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {next && !closed ? (
                <StepCard t={t} eyebrow={t("Nächste Etappe")} title={next.action} hint={next.hint} href={nextHref} pct={progress.overall} cta={t("Fortsetzen")} />
              ) : (
                <StepCard t={t} eyebrow={t("Dein Stand")} title={t("{n} von {m} Etappen", { n: doneSteps, m: progress.milestones.length })} hint={t("Etappen, Stunden und Bausteine ansehen")} href="#etappen" pct={progress.overall} cta={t("Ansehen")} />
              )}
              <div className="flex min-w-0 flex-col gap-4">
                <Panel title={t("Nächster Termin")} icon="calendar" action={<Link href="/mein-bereich/kalender" className="text-sm font-semibold text-accent hover:underline">{t("Kalender")}</Link>}>
                  {nextAppt ? (
                    <Link href={`/mein-bereich/kalender?datum=${nextAppt.day}&termin=${nextAppt.id}`} className="flex items-center gap-3">
                      <span className={`grid w-16 shrink-0 place-items-center rounded-xl py-2 text-center leading-none ${nextAppt.day === todayBerlin() ? "bg-gradient-to-br from-[#e2bd7d] to-gold text-night" : "bg-tint text-accent"}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{relativeDay(nextAppt.day, todayBerlin(), lang).split(" ")[0].replace(",", "")}</span>
                        <span className="mt-1 text-lg font-bold tabular-nums">{nextAppt.start}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{nextAppt.title}</span>
                        <span className="block truncate text-sm text-muted">{t(KINDS[nextAppt.kind].label)}{nextAppt.day !== todayBerlin() ? ` · ${dayMedium(nextAppt.day, lang)}` : ""}</span>
                      </span>
                    </Link>
                  ) : (
                    <p className="text-sm text-muted">{t("Kein Termin geplant.")}</p>
                  )}
                  {nextAppt?.join_url && (
                    <a href={nextAppt.join_url} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 ${msUntil(nextAppt.starts_at) < 30 * 60_000 ? "bg-[#5b5fc7]" : "bg-accent"}`}>
                      <TeamsMark /> {msUntil(nextAppt.starts_at) < 30 * 60_000 ? t("Jetzt teilnehmen") : t("Teams-Link")}
                    </a>
                  )}
                </Panel>
                <Panel title={t("Meine Aufgaben")} icon="check" action={openTasks > 0 ? <span className="rounded-full bg-tint px-2.5 py-0.5 text-xs font-bold text-accent">{t("{n} offen", { n: openTasks })}</span> : undefined} className="flex-1">
                  {openTasks ? <TaskList coacheeId={c.id} tasks={tasks.slice(0, 3)} coach={false} /> : <p className="text-sm text-muted">{t("Gerade ist nichts offen.")}</p>}
                  <Link href="/mein-bereich/aufgaben" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">{openTasks > 3 ? t("Alle {n} Aufgaben", { n: openTasks }) : t("Zu den Aufgaben")} <Icon name="arrow" className="size-4" /></Link>
                </Panel>
              </div>
            </div>
            <InboxTeaser t={t} unread={unread} items={teaser} />
          </section>
        </div>

        {/* Rechte Spalte */}
        <aside className="min-w-0 space-y-6">
          <ActivityCard t={t} lang={lang} days={activity.week} streak={activity.streak} best={activity.best} />
          <Panel title={t("Mein Fortschritt")} icon="chart">
            <div className="grid grid-cols-3 gap-2">
              <StatTile icon="clock" value={formatHours(progress.units.used, lang)} label={t("Coaching")} tone="accent" href={links.attendance} />
              <StatTile icon="flag" value={`${doneSteps}/${progress.milestones.length}`} label={t("Etappen")} tone="gold" href="#etappen" />
              <StatTile icon={third.icon} value={third.value} label={third.label} tone="ok" href={third.href} />
            </div>
            {progress.units.rest != null && !closed && <p className="text-sm text-muted">{t("Noch {h} Coaching für dich", { h: formatHours(progress.units.rest, lang) })}</p>}
          </Panel>
          {recent.length > 0 && (
            <Panel title={t("Kürzlich erledigt")} action={<span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok"><Icon name="check" className="size-3" />{recent.length}</span>}>
              <ul className="-my-2.5 divide-y divide-line-soft">
                {recent.map((r, i) => <DoneItem key={i} title={r.title} sub={r.sub} when={ago(r.at, lang, t)} />)}
              </ul>
            </Panel>
          )}
          <div className="night rounded-[22px] p-4">
            <Suspense fallback={<WeatherSkeleton />}>
              <WeatherBox city={progress.city} edit={<CityForm action={setCoacheeCity.bind(null, c.id)} city={c.city} placeholder={t("Dein Wohnort")} />} />
            </Suspense>
          </div>
        </aside>
      </div>

      <AppSetup publicKey={await pushPublicKey()} what={t("bei Nachrichten, Aufgaben und Terminen von deinem Coach")} compact />

      <MoreSection label={gruendung ? t("Mehr anzeigen: Etappen, Stunden, Förderung, Wissen") : t("Mehr anzeigen: Etappen, Stunden, Stellen-Tipps, Rechner")}>
        <PartsGrid p={progress} links={links} overall={false} />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0 space-y-6">
            <UnitsCard p={progress} href={links.attendance} you />
            {gruendung ? <ChaptersCard p={progress} href={links.plan} /> : <JobsFunnel p={progress} href={links.jobs} />}
          </div>
          <MilestonesCard coacheeId={c.id} p={progress} you />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {c.goal && (
            <section className="card space-y-1">
              <p className="eyebrow">{t("Unser Ziel")}</p>
              <p className="whitespace-pre-wrap text-[15px] leading-snug">{c.goal}</p>
            </section>
          )}
        </div>

        {gruendung ? (
          c.foerderart === "gruendungszuschuss" || c.foerderart === "einstiegsgeld" ? (
            <FoerderCard info={FOERDERUNGEN[c.foerderart]} handbookHref="/mein-bereich/handbuch#foerderung" />
          ) : c.foerderart !== "sonstiges" ? (
            <FoerderWahl handbookHref="/mein-bereich/handbuch#foerderung" />
          ) : null
        ) : (
          <section id="stellen-tipps" className="card min-w-0 scroll-mt-24 space-y-3">
            <h2 className="h2">{t("Stellen, die zu dir passen")}</h2>
            <Suspense fallback={<JobTipsSkeleton />}>
              <JobTips c={c} />
            </Suspense>
          </section>
        )}

        <Link href="/mein-bereich/rechner" className="card card-hover group flex items-center gap-4 !p-4 sm:!p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tint text-accent"><Icon name="euro" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{gruendung ? t("Gewerbesteuer-Rechner und Gründerwissen") : t("Brutto-Netto-Rechner")}</span>
            <span className="block text-sm text-muted">{gruendung ? t("Hebesatz an deinem Ort, Rechtsformen, Kleinunternehmerregelung") : t("Was vom Gehalt einer Stelle bei dir ankommt")}</span>
          </span>
          <span className="text-accent transition group-hover:translate-x-1"><Icon name="arrow" /></span>
        </Link>

        {!closed && <HandbookTeaser t={t} closed={false} gruendung={gruendung} />}

        {docs.length > 0 && (
          <section className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h2">{t("Meine Dokumente")}</h2>
              <Link href="/mein-bereich/dokumente" className="link text-sm">{t("Zu einer PDF zusammenführen")}</Link>
            </div>
            <ul className="divide-y divide-line-soft text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <a href={`/api/dateien/${d.file_id}`} target="_blank" rel="noreferrer" className="link font-medium">{d.title}</a>
                  <span className="text-xs text-muted">{t(categoryLabel(d.category))} · {formatDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.length > 0 && (
          <section id="profil" className="scroll-mt-24 space-y-3">
            <h2 className="h2">{c.coaching_type === "job" ? t("Meine Stärken und Kompetenzen") : t("Bausteine für meinen Businessplan")}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {groups.map(({ cat, list }) => (
                <div key={cat.key} className="card space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t(cat.label)}</p>
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

        <section id="gespraeche" className="scroll-mt-24 space-y-3">
          <h2 className="h2">{t("Unsere Gespräche")}</h2>
          {meetings.length === 0 && <Empty>{t("Hier erscheinen die Zusammenfassungen unserer Gespräche.")}</Empty>}
          {meetings.map((m) => (
            <article key={m.id} className="card space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{m.title}</h3><p className="text-sm text-muted">{formatDate(m.held_on)}</p></div>
              {m.notes && <p className="whitespace-pre-wrap text-sm">{m.notes}</p>}
              {m.results && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">{t("Ergebnisse:")} </span>{m.results}</p>}
              {m.next_steps && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">{t("Nächste Schritte:")} </span>{m.next_steps}</p>}
            </article>
          ))}
        </section>

        <section className="card space-y-3">
          <h2 className="h2">{t("Schlagzeilen")}</h2>
          <Suspense fallback={<NewsSkeleton />}>
            <NewsBox />
          </Suspense>
        </section>
      </MoreSection>
    </div>
  );
}
