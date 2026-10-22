import Link from "next/link";
import { AppSetup } from "@/components/app/AppSetup";
import { pushPublicKey } from "@/lib/push";
import { Suspense } from "react";
import { setCoachCity } from "@/app/actions/dashboard";
import { Meter, Ring, WeekBars, toneFor } from "@/components/dashboard/Charts";
import { greeting, todayLong } from "@/components/dashboard/Hero";
import { Avatar } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { OnlineCard } from "@/components/presence/Presence";
import { ComposeButton } from "@/components/teilen/ComposeButton";
import { CityForm, WeatherBox, WeatherSkeleton } from "@/components/dashboard/Widgets";
import { Fold } from "@/components/coach/Fold";
import { Empty, formatDate, formatUnits } from "@/components/ui";
import { fullName, typeLabel, type Coachee } from "@/lib/access";
import { requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { UpcomingList } from "@/components/calendar/Upcoming";
import { todayBerlin } from "@/lib/calendar/dates";
import { upcomingAppointments } from "@/lib/calendar/store";
import { progressFor, weekSeries, weeklyUnitsSql, type Progress } from "@/lib/dashboard/progress";
import { usageFor } from "@/lib/feature-usage";
import { FEATURES, hasFeature } from "@/lib/features";

export const metadata = { title: "Dashboard" };

type Row = Coachee & { unread: number; has_login: boolean; survey_new: boolean; overdue: number; due_jobs: number };
type Item = { c: Row; p: Progress };

const de = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(`${d.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000) : null);
const daysUntil = (d: string | null) => (d ? Math.ceil((new Date(`${d}T23:59:59`).getTime() - Date.now()) / 86_400_000) : null);

// Stufen für die Übersicht „Wo stehen die Gründer?“ und „Wo stehen die Jobsuchenden?“
const FOUNDER_STAGES = [
  { key: "start", label: "Erste Schritte" },
  { key: "idee", label: "Idee steht" },
  { key: "businessplan", label: "Businessplan" },
  { key: "finanzplan", label: "Finanzplan" },
  { key: "tragfaehigkeit_beantragt", label: "Tragfähigkeit beantragt" },
  { key: "tragfaehigkeit_erhalten", label: "Tragfähigkeit erhalten" },
  { key: "gruendungszuschuss", label: "Zuschuss beantragt" },
  { key: "gegruendet", label: "Gestartet" },
];
const JOB_STAGES = [
  { key: "start", label: "Erste Schritte" },
  { key: "erfahrung", label: "Erfahrung erfasst" },
  { key: "lebenslauf", label: "Lebenslauf fertig" },
  { key: "bewerbung", label: "Bewirbt sich" },
  { key: "gespraech", label: "Gespräche" },
  { key: "zusage", label: "Zusage" },
];

function stageOf(it: Item) {
  const done = (k: string) => it.p.milestones.find((m) => m.key === k)?.done;
  if (it.c.coaching_type === "gruendung") {
    if (done("start") || done("gewerbe")) return "gegruendet";
    for (const k of ["gruendungszuschuss", "tragfaehigkeit_erhalten", "tragfaehigkeit_beantragt", "finanzplan", "businessplan", "idee"]) if (done(k)) return k;
    return "start";
  }
  for (const k of ["zusage", "gespraech", "bewerbung", "lebenslauf", "erfahrung"]) if (done(k)) return k;
  return "start";
}

export default async function CoachDashboard() {
  const user = await requireCoach();
  const upcomingP = upcomingAppointments(user, 5);
  const [rows, me, weekRows, month, openMails, closed, leads, inbox, unsigned, usage] = await Promise.all([
    query<Row>(
      `SELECT c.*,
              (SELECT count(*) FROM messages x WHERE x.coachee_id = c.id AND x.read_at IS NULL AND x.author_id IS DISTINCT FROM $1)::int AS unread,
              (u.password_hash IS NOT NULL) AS has_login,
              EXISTS (SELECT 1 FROM experience_surveys s WHERE s.coachee_id = c.id AND s.status = 'eingereicht') AS survey_new,
              (SELECT count(*) FROM tasks t WHERE t.coachee_id = c.id AND t.done_at IS NULL AND t.due_on < CURRENT_DATE)::int AS overdue,
              (SELECT count(*) FROM applications a WHERE a.coachee_id = c.id AND a.next_on <= CURRENT_DATE AND a.status IN ('gemerkt', 'beworben', 'gespraech'))::int AS due_jobs
         FROM coachees c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.coach_id = $1 AND c.status <> 'abgeschlossen' AND c.archived_at IS NULL
        ORDER BY c.last_name, c.first_name`,
      [user.id],
    ),
    one<{ city: string | null }>("SELECT city FROM users WHERE id = $1", [user.id]),
    query<{ week: string; units: number }>(weeklyUnitsSql("$c IN (SELECT id FROM coachees WHERE coach_id = $1)").replace("$WEEKS", "12"), [user.id]),
    one<{ units: number }>(
      `SELECT COALESCE(sum(units), 0)::float AS units FROM (
         SELECT a.units FROM attendance a JOIN coachees c ON c.id = a.coachee_id WHERE c.coach_id = $1 AND a.held_on >= date_trunc('month', CURRENT_DATE)
         UNION ALL
         SELECT m.units FROM meetings m JOIN coachees c ON c.id = m.coachee_id WHERE c.coach_id = $1 AND m.held_on >= date_trunc('month', CURRENT_DATE)
           AND NOT EXISTS (SELECT 1 FROM attendance x WHERE x.coachee_id = m.coachee_id)) u`,
      [user.id],
    ),
    one<{ n: number }>("SELECT count(*)::int AS n FROM attendance_mails WHERE coach_id = $1 AND status = 'offen'", [user.id]),
    one<{ n: number }>("SELECT count(*)::int AS n FROM coachees WHERE coach_id = $1 AND status = 'abgeschlossen'", [user.id]),
    query<{ id: string; name: string; status: string }>(
      `SELECT id, trim(first_name || ' ' || last_name) AS name, status FROM leads
        WHERE coach_id = $1 AND status IN ('neu','kontaktiert') AND follow_up_on <= (now() AT TIME ZONE 'Europe/Berlin')::date ORDER BY created_at`,
      [user.id],
    ),
    one<{ n: number; open: number }>(
      `SELECT count(*) FILTER (WHERE read_at IS NULL AND coachee_id IS NOT NULL)::int AS n,
              count(*) FILTER (WHERE done_at IS NULL AND coachee_id IS NULL AND category <> 'anfrage')::int AS open
         FROM inbox_mails WHERE coach_id = $1 AND direction = 'in'`,
      [user.id],
    ),
    query<{ coachee_id: string; n: number }>(
      `SELECT d.coachee_id, count(*)::int AS n FROM documents d JOIN coachees c ON c.id = d.coachee_id
        WHERE c.coach_id = $1 AND c.archived_at IS NULL AND d.signature = 'offen' GROUP BY d.coachee_id`,
      [user.id],
    ),
    usageFor(user.id),
  ]);

  const items: Item[] = await Promise.all(rows.map(async (c) => ({ c, p: await progressFor(c) })));
  const active = items.filter((i) => i.c.status === "aktiv");
  const weeks = weekSeries(weekRows);
  const thisWeek = weeks[weeks.length - 1]?.units ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.units ?? 0;
  const restAll = active.reduce((a, i) => a + (i.p.units.rest ?? 0), 0);
  const avg = active.length ? Math.round(active.reduce((a, i) => a + i.p.overall, 0) / active.length) : 0;

  // Was heute Aufmerksamkeit braucht, das Dringendste zuerst
  type Alert = { tone: "danger" | "gold" | "accent" | "ok"; text: string; href: string; c?: Row };
  const alerts: Alert[] = [];
  for (const l of leads)
    alerts.push({ tone: "danger", text: l.status === "neu" ? `Neue Anfrage: ${l.name || "ohne Namen"}, jetzt melden` : `Anfrage ${l.name || "ohne Namen"}: heute nachfassen`, href: `/coach/anfragen?anfrage=${l.id}#a-${l.id}` });
  if ((inbox?.n ?? 0) > 0) alerts.push({ tone: "accent", text: `${inbox?.n} neue Träger-Mail${inbox!.n > 1 ? "s" : ""} (AVOCONS oder Erfolgspfad)`, href: "/coach/posteingang?art=neu" });
  if ((inbox?.open ?? 0) > 0) alerts.push({ tone: "gold", text: `${inbox?.open} Mail${inbox!.open > 1 ? "s" : ""} ohne erkennbaren Coachee`, href: "/coach/posteingang?art=offen" });
  if ((openMails?.n ?? 0) > 0) alerts.push({ tone: "gold", text: `${openMails?.n} Anwesenheits-Mail${openMails!.n > 1 ? "s" : ""} nicht zugeordnet`, href: "/coach/anwesenheit" });
  for (const { c, p } of items) {
    const name = fullName(c);
    const href = `/coach/coachees/${c.id}`;
    if (c.unread) alerts.push({ tone: "accent", text: `${name}: ${c.unread} neue Nachricht${c.unread > 1 ? "en" : ""}`, href: `${href}?tab=nachrichten`, c });
    const sign = unsigned.find((u) => u.coachee_id === c.id)?.n;
    if (sign) alerts.push({ tone: "gold", text: `${name}: ${sign} Bericht${sign > 1 ? "e" : ""} noch nicht unterschrieben`, href: `${href}?tab=dokumente`, c });
    if (c.survey_new) alerts.push({ tone: "ok", text: `${name} hat den Erfahrungsbogen ausgefüllt`, href: `${href}?tab=erfahrung`, c });
    if (c.overdue) alerts.push({ tone: "danger", text: `${name}: ${c.overdue} Aufgabe${c.overdue > 1 ? "n" : ""} überfällig`, href: `${href}?tab=aufgaben`, c });
    if (c.due_jobs) alerts.push({ tone: "gold", text: `${name}: bei ${c.due_jobs} Bewerbung${c.due_jobs > 1 ? "en" : ""} nachfassen`, href: `${href}?tab=bewerbungen`, c });
    if (c.status !== "aktiv") continue;
    const left = daysUntil(c.end_date);
    if (left != null && left >= 0 && left <= 30 && (p.units.rest ?? 0) > 0)
      alerts.push({ tone: left <= 14 ? "danger" : "gold", text: `${name}: endet in ${left} Tag${left === 1 ? "" : "en"}, noch ${de(p.units.rest ?? 0)} UE offen`, href, c });
    else if (left != null && left < 0 && (p.units.rest ?? 0) > 0) alerts.push({ tone: "danger", text: `${name}: Ende überschritten, noch ${de(p.units.rest ?? 0)} UE offen`, href: `${href}?tab=stammdaten`, c });
    if (p.units.perWeek != null && p.units.perWeek > 6) alerts.push({ tone: "danger", text: `${name}: ${de(p.units.perWeek)} UE pro Woche nötig, um das Kontingent zu schaffen`, href: `${href}?tab=anwesenheit`, c });
    const quiet = daysSince(p.lastContact);
    if (quiet != null && quiet >= 14) alerts.push({ tone: "gold", text: `${name}: seit ${quiet} Tagen kein Termin und keine Nachricht`, href, c });
    if (quiet == null && !c.has_login) alerts.push({ tone: "gold", text: `${name}: Einladung noch nicht angenommen`, href: `${href}?tab=stammdaten`, c });
  }
  const order = { danger: 0, gold: 1, accent: 2, ok: 3 };
  alerts.sort((a, b) => order[a.tone] - order[b.tone]);

  // Empfänger für „Nachricht an Coachee“: aktive mit Zugang
  const pick = rows.filter((c) => c.has_login && c.user_id).map((c) => ({ id: c.id, name: fullName(c) }));
  const unreadAll = rows.reduce((a, c) => a + c.unread, 0);
  const upcoming = await upcomingP;
  const todayDay = todayBerlin();
  const todayCount = upcoming.filter((a) => a.day === todayDay).length;
  const founders = active.filter((i) => i.c.coaching_type === "gruendung");
  const jobs = active.filter((i) => i.c.coaching_type === "job");
  const firstName = user.name.split(" ")[0];
  // Für die eingeklappte Zeile „Freigaben“: freigegeben von möglich (nur Funktionen, die zur Coaching-Art passen)
  const possible = FEATURES.flatMap((f) => rows.filter((c) => (f.types as readonly string[]).includes(c.coaching_type)).map((c) => hasFeature(c, f.key)));
  const released = possible.filter(Boolean).length;
  const board = [...items].sort((a, b) => (a.c.status === b.c.status ? a.p.overall - b.p.overall : a.c.status === "aktiv" ? -1 : 1));

  return (
    <div className="space-y-6">
      <section className="rise night relative -mx-4 -mt-6 overflow-hidden px-5 pt-6 pb-5 sm:mx-0 sm:mt-0 sm:rounded-[24px] sm:px-8 sm:py-6">
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">{todayLong()}</p>
            <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-[1.1] font-bold tracking-tight sm:text-4xl">{greeting()}, <span className="text-gradient-gold">{firstName}</span>!</h1>
            <p className="mt-1 text-white/80">
              {todayCount ? `${todayCount} ${todayCount === 1 ? "Termin" : "Termine"} heute. ` : ""}
              {alerts.length ? `${alerts.length} ${alerts.length === 1 ? "Punkt braucht" : "Punkte brauchen"} deinen Blick.` : "Alles im grünen Bereich."}
            </p>
          </div>
          {pick.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <ComposeButton coachees={pick} label="Nachricht an Coachee" className="btn-gold btn-sm min-h-11 sm:min-h-9" />
              <Link href="/coach/posteingang?bereich=coachees" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/25 px-3 text-xs font-semibold text-white transition hover:bg-white/10 sm:min-h-9">
                <Icon name="mail" className="size-4" /> Von Coachees{unreadAll ? <span className="rounded-full bg-danger px-1.5 text-[11px]">{unreadAll}</span> : null}
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rise card min-w-0 space-y-3" style={{ ["--i" as string]: 1 }}>
          <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-danger-soft text-danger"><Icon name="flag" className="size-4" /></span><h2 className="h2">Heute wichtig</h2>{alerts.length > 0 && <span className="ml-auto rounded-full bg-danger px-2 text-xs font-bold text-white">{alerts.length}</span>}</div>
          {alerts.length === 0 ? (
            <Empty>Nichts Dringendes. Gute Arbeit!</Empty>
          ) : (
            <ul className="grid gap-x-4 gap-y-1 xl:grid-cols-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="group flex min-h-11 items-start gap-3 rounded-xl px-2.5 py-2 text-sm transition hover:bg-surface-2">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(--${a.tone === "accent" ? "accent" : a.tone})` }} />
                    {a.c ? <Avatar name={fullName(a.c)} size="size-6" className="!text-[9px]" /> : null}
                    <span className="min-w-0 flex-1">{a.text}</span>
                    <span className="text-muted opacity-0 transition group-hover:opacity-100"><Icon name="arrow" className="size-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <OnlineCard style={{ ["--i" as string]: 2 }} />
          <section className="rise card space-y-3" style={{ ["--i" as string]: 2 }}>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-[#eef0ff] text-[#5b5fc7]"><Icon name="calendar" className="size-4" /></span>
              <h2 className="h2">Nächste Termine</h2>
              <Link href="/coach/kalender?neu=1" className="ml-auto grid size-11 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-accent sm:size-8" aria-label="Neuer Termin" title="Neuer Termin"><Icon name="plus" className="size-4" /></Link>
            </div>
            {upcoming.length ? (
              <UpcomingList items={upcoming} coach hrefFor={(a) => `/coach/kalender?datum=${a.day}&termin=${a.id}`} />
            ) : (
              <Empty>Keine Termine geplant. <Link href="/coach/kalender?neu=1" className="link">Termin anlegen</Link></Empty>
            )}
            <Link href="/coach/kalender" className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">Zum Kalender</Link>
          </section>
        </div>
      </div>

      <section className="rise night relative overflow-hidden rounded-[24px] px-5 py-6 sm:px-8 sm:py-7" style={{ ["--i" as string]: 3 }}>
        <div className="night-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid gap-6 xl:grid-cols-[1fr_330px]">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:self-start">
            {[
              { label: "Aktive Coachees", value: String(active.length), sub: `${jobs.length} Job · ${founders.length} Gründung` },
              { label: "UE diese Woche", value: de(thisWeek), sub: lastWeek ? `Vorwoche ${de(lastWeek)}` : "Vorwoche –" },
              { label: "UE im " + new Date().toLocaleDateString("de-DE", { month: "long", timeZone: "Europe/Berlin" }), value: de(month?.units ?? 0), sub: `${closed?.n ?? 0} Coachings abgeschlossen` },
              { label: "UE noch offen", value: de(restAll), sub: "über alle aktiven" },
            ].map((k) => (
              <div key={k.label} className="glass px-4 py-3">
                <dt className="text-xs text-white/70">{k.label}</dt>
                <dd className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold tabular-nums">{k.value}</dd>
                <dd className="text-[11px] text-white/60">{k.sub}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="glass flex items-center gap-4 p-4">
              <Ring pct={avg} size={64} stroke={7} tone="white" track="rgba(255,255,255,.2)">
                <span className="text-base font-bold">{avg}%</span>
              </Ring>
              <div>
                <p className="font-semibold">Durchschnittlicher Stand</p>
                <p className="text-xs text-white/70">aller aktiven Coachings, aus Bausteinen und Etappen</p>
              </div>
            </div>
            <div className="glass p-4">
              <Suspense fallback={<WeatherSkeleton />}>
                <WeatherBox city={me?.city ?? null} edit={<CityForm action={setCoachCity} city={me?.city ?? null} placeholder="Dein Ort, z. B. Köln" />} />
              </Suspense>
            </div>
          </div>
        </div>
        <div className="relative mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">Unterrichtseinheiten pro Kalenderwoche</p>
          <WeekBars weeks={weeks} height={100} light />
        </div>
      </section>
      <AppSetup publicKey={await pushPublicKey()} what="bei neuen Anfragen, Nachrichten und Mails" compact />

      {rows.length > 0 && (
        <Fold
          id="freigaben"
          title="Freigaben"
          icon="spark"
          iconClass="bg-[#fbf1e3] text-gold"
          summary={`${released} von ${possible.length} möglichen freigegeben`}
          action={<Link href="/coach/freigaben" className="btn-ghost btn-sm min-h-11 sm:min-h-9">Freigaben verwalten</Link>}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {FEATURES.map((f) => {
              const pool = rows.filter((c) => (f.types as readonly string[]).includes(c.coaching_type));
              const on = pool.filter((c) => hasFeature(c, f.key));
              const uses = rows.reduce((a, c) => a + usage.get(c.id).features[f.key].month, 0);
              return (
                <Link key={f.key} href="/coach/freigaben" className="rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm transition hover:bg-surface-2">
                  <span className="block font-semibold">{f.label}</span>
                  <span className="block text-xs text-muted"><b className="text-ink tabular-nums">{on.length}</b> von {pool.length} freigegeben · <b className="text-ink tabular-nums">{uses}</b> Aufrufe im Monat</span>
                </Link>
              );
            })}
          </div>
        </Fold>
      )}

      {founders.length > 0 && (
        <Fold id="gruender" title="Wo stehen die Gründer?" icon="flag" summary={`${founders.length} ${founders.length === 1 ? "Gründung" : "Gründungen"} in ${FOUNDER_STAGES.length} Stufen`}>
          <Pipeline stages={FOUNDER_STAGES} items={founders} />
        </Fold>
      )}
      {jobs.length > 0 && (
        <Fold id="jobsuchende" title="Wo stehen die Jobsuchenden?" icon="briefcase" summary={`${jobs.length} Jobcoaching${jobs.length === 1 ? "" : "s"} in ${JOB_STAGES.length} Stufen`}>
          <Pipeline stages={JOB_STAGES} items={jobs} />
        </Fold>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="h2">Alle laufenden Coachings</h2>
          <div className="flex gap-2">
            <Link href="/coach/coachees" className="btn-ghost btn-sm">Liste und Suche</Link>
            <Link href="/coach/neu" className="btn btn-sm">+ Neuer Coachee</Link>
          </div>
        </div>
        {board.length === 0 ? (
          <Empty>Noch keine laufenden Coachings. Lege mit „Neuer Coachee“ den ersten an.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {board.map(({ c, p }) => {
              const next = p.milestones.find((m) => !m.done);
              const left = daysUntil(c.end_date);
              const low = p.units.rest != null && p.units.total ? p.units.rest / p.units.total <= 0.1 : false;
              return (
                <Link key={c.id} href={`/coach/coachees/${c.id}`} className={`card card-hover group block space-y-3 !p-4 ${c.status === "pausiert" ? "opacity-70" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Ring pct={p.overall} size={52} stroke={5} tone={toneFor(p.overall)} track="var(--line-soft)">
                        <Avatar name={fullName(c)} size="size-9" className="!text-[11px]" />
                      </Ring>
                      <span className="absolute -right-1 -bottom-1 rounded-full bg-surface px-1 text-[10px] font-bold tabular-nums shadow ring-1 ring-line-soft">{p.overall}%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold group-hover:text-accent">{fullName(c)}</p>
                      <p className="text-xs text-muted">{typeLabel[c.coaching_type]}{c.status === "pausiert" ? " · pausiert" : ""}{left != null ? ` · ${left >= 0 ? `noch ${left} Tage` : "Ende überschritten"}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {c.unread > 0 && <span className="badge">{c.unread} neu</span>}
                      {c.survey_new && <span className="badge bg-[#e5f2ea] text-ok">Bogen</span>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{formatUnits(p.units.used)}{p.units.total ? ` von ${de(p.units.total)}` : ""}</span>
                      {p.units.rest != null && <span className={low ? "font-semibold text-danger" : ""}>{de(p.units.rest)} übrig</span>}
                    </div>
                    <Meter pct={p.units.pct ?? 0} tone={low ? "danger" : "accent"} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.parts.map((x) => (
                      <span key={x.key} title={`${x.label}: ${x.detail}`} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${x.pct >= 100 ? "bg-[#e5f2ea] text-ok" : x.pct >= 50 ? "bg-tint text-accent" : x.pct > 0 ? "bg-[#fbf1e3] text-gold" : "bg-bg text-muted"}`}>
                        {x.label} {x.pct}%
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted">
                    {next ? <>Als Nächstes: <span className="font-medium text-ink">{next.action}</span></> : "Alle Etappen erledigt"}
                    {p.lastContact ? ` · zuletzt ${formatDate(p.lastContact)}` : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Spalten je Stufe. Brechen in neue Zeilen um, statt rechts abgeschnitten zu werden. */
function Pipeline({ stages, items }: { stages: { key: string; label: string }[]; items: Item[] }) {
  const by = new Map<string, Item[]>();
  for (const it of items) by.set(stageOf(it), [...(by.get(stageOf(it)) ?? []), it]);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {stages.map((s, i) => {
            const list = by.get(s.key) ?? [];
            return (
              <div key={s.key} className={`min-w-0 rounded-xl p-3 ${list.length ? "bg-tint/70" : "bg-bg"}`}>
                <div className="mb-2 flex items-baseline justify-between gap-1">
                  <p className="text-xs font-semibold leading-tight text-accent">{i + 1}. {s.label}</p>
                  <span className="text-sm font-bold tabular-nums">{list.length}</span>
                </div>
                <ul className="space-y-1">
                  {list.map(({ c }) => (
                    <li key={c.id}><Link href={`/coach/coachees/${c.id}`} className="block truncate rounded-md bg-surface px-2 py-2 text-xs font-medium hover:text-accent sm:py-1">{fullName(c)}</Link></li>
                  ))}
                </ul>
              </div>
            );
          })}
    </div>
  );
}
