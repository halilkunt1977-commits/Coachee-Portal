import Link from "next/link";
import { deleteMeeting } from "@/app/actions/akte";
import { MeetingForm } from "@/components/akte/MeetingForm";
import { MessageForm } from "@/components/akte/MessageForm";
import { MessageList, TaskList, type Message, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { Empty, Notice, formatDate, formatDateTime, formatUnits } from "@/components/ui";
import { coacheeFor, fullName, fundingLabel, statusLabel, typeLabel } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { resendInvite, setAccess } from "../../actions";
import InviteLink from "./InviteLink";
import StammdatenForm from "./StammdatenForm";

type Meeting = { id: string; held_on: string; units: number; format: string; title: string; notes: string; results: string; next_steps: string; internal_note: string; shared: boolean };

const TABS = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "gespraeche", label: "Gespräche" },
  { key: "aufgaben", label: "Aufgaben" },
  { key: "nachrichten", label: "Nachrichten" },
  { key: "stammdaten", label: "Stammdaten" },
  { key: "verlauf", label: "Zugriffe" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const formatLabel: Record<string, string> = { praesenz: "Vor Ort", online: "Online", telefon: "Telefon" };
const actionLabel: Record<string, string> = {
  login: "Anmeldung", logout: "Abmeldung", login_failed: "Fehlgeschlagene Anmeldung", mfa_passed: "Zweiter Faktor bestätigt",
  coachee_created: "Akte angelegt", coachee_updated: "Stammdaten geändert", invite_sent: "Einladung verschickt", invite_link_created: "Einladungslink erzeugt",
  invite_accepted: "Einladung angenommen", meeting_created: "Gespräch angelegt", meeting_updated: "Gespräch geändert", meeting_deleted: "Gespräch gelöscht",
  task_created: "Aufgabe angelegt", task_toggled: "Aufgabe abgehakt", task_deleted: "Aufgabe gelöscht", message_sent: "Nachricht gesendet",
  access_disabled: "Zugang gesperrt", access_enabled: "Zugang freigegeben", akte_viewed: "Akte geöffnet",
};

export default async function CoacheePage({ params, searchParams }: PageProps<"/coach/coachees/[id]">) {
  const coach = await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const c = await coacheeFor(coach, id);
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "uebersicht";
  await audit(coach.id, "akte_viewed", c.id, { tab });

  const [stats, account] = await Promise.all([
    one<{ units_used: number; meetings: number; open_tasks: number; unread: number }>(
      `SELECT COALESCE((SELECT sum(units) FROM meetings WHERE coachee_id = $1), 0) AS units_used,
              (SELECT count(*) FROM meetings WHERE coachee_id = $1)::int AS meetings,
              (SELECT count(*) FROM tasks WHERE coachee_id = $1 AND done_at IS NULL)::int AS open_tasks,
              (SELECT count(*) FROM messages WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2)::int AS unread`,
      [c.id, coach.id],
    ),
    c.user_id ? one<{ active: boolean; has_password: boolean; last_login_at: string | null; totp_enabled: boolean }>("SELECT active, password_hash IS NOT NULL AS has_password, last_login_at, totp_enabled FROM users WHERE id = $1", [c.user_id]) : null,
  ]);
  const used = stats?.units_used ?? 0;
  const pct = c.units_total ? Math.min(100, Math.round((used / c.units_total) * 100)) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach" className="text-sm text-muted hover:text-ink">← Alle Coachees</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h1">{fullName(c)}</h1>
            <p className="mt-1 flex flex-wrap gap-2 text-sm">
              <span className="badge">{typeLabel[c.coaching_type]}</span>
              <span className="badge bg-bg text-muted">{fundingLabel[c.funding]}{c.voucher_number ? ` · ${c.voucher_number}` : ""}</span>
              <span className="badge bg-bg text-muted">{statusLabel[c.status]}</span>
              {account && !account.has_password && <span className="badge bg-[#fbf1e3] text-gold">Einladung offen</span>}
              {account && !account.active && <span className="badge bg-[#f8e6e3] text-danger">Zugang gesperrt</span>}
            </p>
          </div>
          <div className="min-w-56">
            <p className="text-xs text-muted">Unterrichtseinheiten</p>
            <p className="font-semibold">{formatUnits(used)}{c.units_total ? ` von ${c.units_total}` : ""}</p>
            {pct !== null && <div className="mt-1 h-2 rounded-full bg-line-soft"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>}
          </div>
        </div>
      </div>

      {sp.eingeladen === "1" && <Notice tone="ok">Die Einladung ist per E-Mail an {c.email} unterwegs.</Notice>}
      {sp.eingeladen === "link" && <Notice tone="error">Die E-Mail konnte nicht verschickt werden (SMTP nicht eingerichtet). Erzeuge unter „Stammdaten“ einen Link zum Weitergeben.</Notice>}

      <nav className="flex gap-1 overflow-x-auto border-b border-line-soft">
        {TABS.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
            {t.key === "nachrichten" && (stats?.unread ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] text-white">{stats?.unread}</span>}
          </Link>
        ))}
        {["Kompetenzprofil", c.coaching_type === "job" ? "Lebenslauf" : "Businessplan", c.coaching_type === "job" ? "Stellen" : "Finanzplan", "KI-Assistent"].map((l) => (
          <span key={l} title="Kommt im nächsten Schritt" className="cursor-default whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-line">{l}</span>
        ))}
      </nav>

      {tab === "uebersicht" && <Overview coacheeId={c.id} goal={c.goal} note={c.internal_note} stats={stats} />}
      {tab === "gespraeche" && <Meetings coacheeId={c.id} edit={typeof sp.bearbeiten === "string" ? sp.bearbeiten : null} />}
      {tab === "aufgaben" && <Tasks coacheeId={c.id} />}
      {tab === "nachrichten" && <Messages coacheeId={c.id} selfId={coach.id} />}
      {tab === "stammdaten" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="card"><StammdatenForm c={c} /></div>
          <div className="space-y-4">
            <div className="card space-y-3">
              <h2 className="h2">Zugang</h2>
              {account ? (
                <>
                  <p className="text-sm text-muted">
                    {account.has_password ? `Eingerichtet. Letzte Anmeldung: ${formatDateTime(account.last_login_at)}.` : "Der Coachee hat sein Passwort noch nicht festgelegt."}
                    {account.totp_enabled ? " Zwei-Faktor ist aktiv." : ""}
                  </p>
                  <form action={resendInvite.bind(null, c.id)}><button className="btn w-full">{account.has_password ? "Link zum Passwort-Zurücksetzen mailen" : "Einladung erneut mailen"}</button></form>
                  <InviteLink coacheeId={c.id} />
                  <form action={setAccess.bind(null, c.id, !account.active)}>
                    <button className={`text-sm ${account.active ? "text-danger" : "text-ok"} hover:underline`}>{account.active ? "Zugang sperren" : "Zugang wieder freigeben"}</button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-muted">Kein Zugang verknüpft.</p>
              )}
            </div>
            <div className="card text-sm text-muted">
              <p>Angelegt am {formatDate(c.created_at)}</p>
              <p>Datenschutz-Einwilligung: {c.consent_at ? formatDate(c.consent_at) : "noch nicht"}</p>
            </div>
          </div>
        </div>
      )}
      {tab === "verlauf" && <AuditTrail coacheeId={c.id} />}
    </div>
  );
}

async function Overview({ coacheeId, goal, note, stats }: { coacheeId: string; goal: string | null; note: string | null; stats: { meetings: number; open_tasks: number } | null }) {
  const [last, tasks] = await Promise.all([
    one<Meeting>("SELECT * FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 1", [coacheeId]),
    query<Task>("SELECT * FROM tasks WHERE coachee_id = $1 AND done_at IS NULL ORDER BY due_on NULLS LAST, created_at LIMIT 5", [coacheeId]),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="h2">Ziel</h2>
        <p className="whitespace-pre-wrap">{goal || <span className="text-muted">Noch kein Ziel eingetragen.</span>}</p>
        {note && (<><h3 className="pt-2 text-sm font-semibold text-muted">Interne Notiz</h3><p className="whitespace-pre-wrap text-sm">{note}</p></>)}
      </div>
      <div className="card space-y-3">
        <div className="flex items-center justify-between"><h2 className="h2">Letztes Gespräch</h2><Link href="?tab=gespraeche" className="link text-sm">Alle {stats?.meetings ?? 0}</Link></div>
        {last ? (
          <div>
            <p className="font-medium">{last.title} <span className="text-sm font-normal text-muted">· {formatDate(last.held_on)}</span></p>
            {last.next_steps && <p className="mt-2 whitespace-pre-wrap text-sm"><span className="font-semibold">Nächste Schritte: </span>{last.next_steps}</p>}
          </div>
        ) : (
          <Empty>Noch kein Gespräch erfasst.</Empty>
        )}
      </div>
      <div className="card space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between"><h2 className="h2">Offene Aufgaben</h2><Link href="?tab=aufgaben" className="link text-sm">Alle {stats?.open_tasks ?? 0}</Link></div>
        <TaskList coacheeId={coacheeId} tasks={tasks} coach />
      </div>
    </div>
  );
}

async function Meetings({ coacheeId, edit }: { coacheeId: string; edit: string | null }) {
  const meetings = await query<Meeting>("SELECT * FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC", [coacheeId]);
  const editing = edit ? meetings.find((m) => m.id === edit) : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="h2">{editing ? "Gespräch bearbeiten" : "Neues Gespräch erfassen"}</h2>
          {editing && <Link href="?tab=gespraeche" className="link text-sm">Abbrechen</Link>}
        </div>
        <MeetingForm key={editing?.id ?? "neu"} coacheeId={coacheeId} meeting={editing} />
      </div>
      <div className="space-y-3">
        {meetings.length === 0 && <Empty>Noch keine Gespräche.</Empty>}
        {meetings.map((m) => (
          <article key={m.id} className="card space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{m.title}</h3>
              <p className="text-sm text-muted">{formatDate(m.held_on)} · {formatUnits(m.units)} · {formatLabel[m.format]}{!m.shared && " · nur intern"}</p>
            </div>
            {m.notes && <p className="whitespace-pre-wrap text-sm">{m.notes}</p>}
            {m.results && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Ergebnisse: </span>{m.results}</p>}
            {m.next_steps && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Nächste Schritte: </span>{m.next_steps}</p>}
            {m.internal_note && <p className="whitespace-pre-wrap rounded-lg bg-bg p-2 text-sm text-muted"><span className="font-semibold">Intern: </span>{m.internal_note}</p>}
            <div className="flex gap-4 pt-1 text-sm">
              <Link href={`?tab=gespraeche&bearbeiten=${m.id}`} className="link">Bearbeiten</Link>
              <form action={deleteMeeting.bind(null, coacheeId, m.id)}><button className="text-muted hover:text-danger">Löschen</button></form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

async function Tasks({ coacheeId }: { coacheeId: string }) {
  const tasks = await query<Task>("SELECT * FROM tasks WHERE coachee_id = $1 ORDER BY done_at IS NOT NULL, due_on NULLS LAST, created_at", [coacheeId]);
  return (
    <div className="card space-y-5">
      <TaskForm coacheeId={coacheeId} coach />
      <TaskList coacheeId={coacheeId} tasks={tasks} coach />
    </div>
  );
}

async function Messages({ coacheeId, selfId }: { coacheeId: string; selfId: string }) {
  const messages = await query<Message>(
    "SELECT m.id, m.body, m.created_at, m.author_id, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.coachee_id = $1 ORDER BY m.created_at",
    [coacheeId],
  );
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [coacheeId, selfId]);
  return (
    <div className="card mx-auto max-w-3xl space-y-5">
      <MessageList messages={messages} selfId={selfId} />
      <MessageForm coacheeId={coacheeId} />
    </div>
  );
}

async function AuditTrail({ coacheeId }: { coacheeId: string }) {
  const rows = await query<{ id: number; action: string; created_at: string; name: string | null; ip: string | null }>(
    "SELECT a.id, a.action, a.created_at, u.name, a.ip FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.coachee_id = $1 ORDER BY a.created_at DESC LIMIT 200",
    [coacheeId],
  );
  return (
    <div className="card">
      <p className="mb-4 text-sm text-muted">Wer hat wann was in dieser Akte gemacht. Die letzten 200 Einträge.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="pb-2">Zeitpunkt</th><th className="pb-2">Wer</th><th className="pb-2">Was</th></tr></thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => (
            <tr key={r.id}><td className="py-1.5 pr-4 whitespace-nowrap">{formatDateTime(r.created_at)}</td><td className="py-1.5 pr-4">{r.name ?? "–"}</td><td className="py-1.5">{actionLabel[r.action] ?? r.action}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
