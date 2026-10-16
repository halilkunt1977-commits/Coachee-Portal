import Link from "next/link";
import { deleteMeeting } from "@/app/actions/akte";
import { MeetingForm } from "@/components/akte/MeetingForm";
import { MessageForm } from "@/components/akte/MessageForm";
import { MessageList, TaskList, type Message, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { CvList } from "@/components/cv/CvList";
import { AttendancePanel } from "@/components/attendance/Panel";
import { DocumentsPanel } from "@/components/documents/Panel";
import { SurveyPanel } from "@/components/survey/Panel";
import { setCoachingStatus } from "@/app/actions/dokumente";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { FinancePanel, PlanPanel } from "@/components/bp/Panels";
import { BewerbungenPanel, StellenPanel } from "@/components/jobs/Panels";
import { AnalyzeButton, FinanceItemForm, ProfileItemForm, SuggestionCard } from "@/components/akte/Wissen";
import { aiEnabled } from "@/lib/ai";
import { MAIL_PROBLEM_TEXT } from "@/lib/mail";
import { FINANCE_SECTIONS, PERIOD_LABEL, categoriesFor, euro, monthly, type FinanceItem, type ProfileItem } from "@/lib/profile";
import { Empty, Notice, formatDate, formatDateTime, formatUnits } from "@/components/ui";
import { coacheeFor, fullName, fundingLabel, statusLabel, typeLabel } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { unitsUsedSql } from "@/lib/attendance/units";
import { deleteFinanceItem, deleteProfileItem, rejectAllSuggestions } from "@/app/actions/profil";
import { resendInvite, setAccess } from "../../actions";
import DeleteCoachee from "./DeleteCoachee";
import InviteLink from "./InviteLink";
import StammdatenForm from "./StammdatenForm";

type Meeting = { id: string; held_on: string; units: number; format: string; title: string; notes: string; results: string; next_steps: string; internal_note: string; shared: boolean; ai_questions: string[]; analyzed_at: string | null };

const TABS = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "gespraeche", label: "Gespräche" },
  { key: "anwesenheit", label: "Anwesenheit" },
  { key: "dokumente", label: "Dokumente" },
  { key: "wissen", label: "Kompetenzprofil" },
  { key: "stellen", label: "Stellen" },
  { key: "bewerbungen", label: "Bewerbungen" },
  { key: "zahlen", label: "Zahlen" },
  { key: "businessplan", label: "Businessplan" },
  { key: "finanzplan", label: "Finanzplan" },
  { key: "lebenslauf", label: "Lebenslauf" },
  { key: "erfahrung", label: "Erfahrungsbogen" },
  { key: "assistent", label: "KI-Assistent" },
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
  cv_created: "Lebenslauf angelegt", cv_imported: "Lebenslauf aus Datei übernommen", cv_duplicated: "Lebenslauf kopiert", cv_deleted: "Lebenslauf gelöscht",
  assistant_used: "KI-Assistent gefragt", bp_saved: "Businessplan bearbeitet", bp_draft: "KI-Entwurf für den Businessplan", bp_pdf: "Businessplan als PDF geladen",
  job_search_saved: "Stellensuche gespeichert", job_proposed: "Stelle vorgeschlagen", job_saved: "Stelle gemerkt", application_created: "Bewerbung eingetragen",
  application_status: "Bewerbungsstand geändert", application_deleted: "Bewerbung gelöscht", applications_pdf: "Bewerbungsnachweis als PDF geladen",
  applications_excel: "Bewerbungen als Excel geladen", jobs_ai_searches: "KI-Vorschläge für Stellensuchen", jobs_ai_rated: "KI-Einschätzung zu Stellen",
  finance_saved: "Finanzplan bearbeitet", finance_imported: "Zahlen in den Finanzplan übernommen", finance_excel: "Finanzplan als Excel geladen", assistant_deleted: "KI-Unterhaltung gelöscht",
  cv_saved: "Lebenslauf bearbeitet", cv_opened: "Lebenslauf geöffnet", cv_photo: "Foto hochgeladen", cv_pdf: "Lebenslauf als PDF geladen",
  attendance_added: "Anwesenheit eingetragen", attendance_deleted: "Anwesenheit gelöscht", attendance_mail_assigned: "Anwesenheits-Mail zugeordnet",
  document_uploaded: "Dokument hochgeladen", document_updated: "Dokument geändert", document_deleted: "Dokument gelöscht",
  attendance_from_document: "Anwesenheit aus Dokument übernommen", coaching_closed: "Coaching abgeschlossen", coaching_reopened: "Coaching wieder aufgenommen",
  attendance_updated: "Anwesenheit geändert", attendance_moved: "Anwesenheit verschoben",
  coachee_deleted: "Coachee gelöscht",
  access_disabled: "Zugang gesperrt", access_enabled: "Zugang freigegeben", akte_viewed: "Akte geöffnet",
};

export default async function CoacheePage({ params, searchParams }: PageProps<"/coach/coachees/[id]">) {
  const coach = await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const c = await coacheeFor(coach, id);
  const tabs = TABS.filter((t) => (["zahlen", "businessplan", "finanzplan"].includes(t.key) ? c.coaching_type === "gruendung" : ["stellen", "bewerbungen"].includes(t.key) ? c.coaching_type === "job" : true)).map((t) => (t.key === "wissen" && c.coaching_type === "gruendung" ? { ...t, label: "Businessplan-Bausteine" } : t));
  const tab: Tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "uebersicht";
  await audit(coach.id, "akte_viewed", c.id, { tab });

  const [stats, account] = await Promise.all([
    one<{ units_used: number; meetings: number; open_tasks: number; unread: number; suggestions: number; due: number; survey_new: number }>(
      `SELECT ${unitsUsedSql("$1")} AS units_used,
              (SELECT count(*) FROM meetings WHERE coachee_id = $1)::int AS meetings,
              (SELECT count(*) FROM tasks WHERE coachee_id = $1 AND done_at IS NULL)::int AS open_tasks,
              (SELECT count(*) FROM messages WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2)::int AS unread,
              (SELECT count(*) FROM ai_suggestions WHERE coachee_id = $1 AND status = 'offen')::int AS suggestions,
              (SELECT count(*) FROM applications WHERE coachee_id = $1 AND next_on <= CURRENT_DATE AND status IN ('vorschlag', 'gemerkt', 'beworben', 'gespraech'))::int AS due,
              (SELECT count(*) FROM experience_surveys WHERE coachee_id = $1 AND status = 'eingereicht')::int AS survey_new`,
      [c.id, coach.id],
    ),
    c.user_id ? one<{ active: boolean; has_password: boolean; last_login_at: string | null; totp_enabled: boolean }>("SELECT active, password_hash IS NOT NULL AS has_password, last_login_at, totp_enabled FROM users WHERE id = $1", [c.user_id]) : null,
  ]);
  const used = stats?.units_used ?? 0;
  const jobLinks = { search: "?tab=stellen", tracker: "?tab=bewerbungen" };
  const bpLinks = { plan: "?tab=businessplan", finance: "?tab=finanzplan", zahlen: "?tab=zahlen" };
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
              <span className={`badge ${c.status === "abgeschlossen" ? "bg-[#e5f2ea] text-ok" : "bg-bg text-muted"}`}>{c.status === "abgeschlossen" ? "✓ " : ""}{statusLabel[c.status]}</span>
              {account && !account.has_password && <span className="badge bg-[#fbf1e3] text-gold">Einladung offen</span>}
              {account && !account.active && <span className="badge bg-[#f8e6e3] text-danger">Zugang gesperrt</span>}
            </p>
          </div>
          <div className="min-w-56">
            <Link href="?tab=anwesenheit" className="text-xs text-muted hover:text-ink">Unterrichtseinheiten</Link>
            <p className="font-semibold">{formatUnits(used)}{c.units_total ? ` von ${c.units_total}` : ""}</p>
            {pct !== null && <div className="mt-1 h-2 rounded-full bg-line-soft"><div className={`h-2 rounded-full ${c.status === "abgeschlossen" ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>}
            <form action={setCoachingStatus.bind(null, c.id, c.status === "abgeschlossen" ? "aktiv" : "abgeschlossen")} className="mt-2 text-right">
              <button className={`text-xs hover:underline ${c.status === "abgeschlossen" ? "text-muted" : "text-ok"}`}>{c.status === "abgeschlossen" ? "Coaching wieder aufnehmen" : "✓ Coaching abschließen"}</button>
            </form>
          </div>
        </div>
      </div>

      {sp.eingeladen === "1" && <Notice tone="ok">Die Einladung ist per E-Mail an {c.email} unterwegs.</Notice>}
      {typeof sp.eingeladen === "string" && sp.eingeladen !== "1" && (
        <Notice tone="error">
          {MAIL_PROBLEM_TEXT[sp.eingeladen === "link" ? "aus" : sp.eingeladen] ?? MAIL_PROBLEM_TEXT.sonst} Bis dahin unter „Stammdaten“ einen Einladungslink erzeugen und selbst weitergeben.
        </Notice>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-line-soft">
        {tabs.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
            {t.key === "nachrichten" && (stats?.unread ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] text-white">{stats?.unread}</span>}
            {t.key === "bewerbungen" && (stats?.due ?? 0) > 0 && <span title="Nachfassen fällig" className="ml-1.5 rounded-full bg-danger px-1.5 text-[11px] text-white">{stats?.due}</span>}
            {t.key === "erfahrung" && (stats?.survey_new ?? 0) > 0 && <span title="Neu ausgefüllt" className="ml-1.5 rounded-full bg-ok px-1.5 text-[11px] text-white">neu</span>}
            {t.key === "wissen" && (stats?.suggestions ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[11px] text-white">{stats?.suggestions}</span>}
          </Link>
        ))}
      </nav>

      {tab === "uebersicht" && <Overview coacheeId={c.id} goal={c.goal} note={c.internal_note} stats={stats} />}
      {tab === "gespraeche" && <Meetings coacheeId={c.id} edit={typeof sp.bearbeiten === "string" ? sp.bearbeiten : null} />}
      {tab === "anwesenheit" && <AttendancePanel coachee={c} used={used} oldestFirst={sp.sortierung === "alt"} />}
      {tab === "dokumente" && <DocumentsPanel coachee={c} />}
      {tab === "wissen" && <Wissen coacheeId={c.id} type={c.coaching_type} healthConsent={Boolean(c.consent_special_at)} fresh={typeof sp.neu === "string" ? Number(sp.neu) : null} />}
      {tab === "stellen" && <StellenPanel user={coach} coachee={c} links={jobLinks} />}
      {tab === "bewerbungen" && <BewerbungenPanel user={coach} coachee={c} links={jobLinks} />}
      {tab === "zahlen" && <Zahlen coacheeId={c.id} />}
      {tab === "businessplan" && <PlanPanel user={coach} coachee={c} links={bpLinks} />}
      {tab === "finanzplan" && <FinancePanel user={coach} coachee={c} links={bpLinks} />}
      {tab === "lebenslauf" && <CvList coacheeId={c.id} coach />}
      {tab === "erfahrung" && <SurveyPanel coachee={c} coach />}
      {tab === "assistent" && <AssistantPanel user={coach} coachee={c} chatId={typeof sp.chat === "string" ? sp.chat : null} base={{ chat: "?tab=assistent&chat=", fresh: "?tab=assistent" }} />}
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
            <div className="card space-y-3 border-danger/30">
              <h2 className="h2">Löschen</h2>
              <DeleteCoachee coacheeId={c.id} lastName={c.last_name} />
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
  const ai = aiEnabled();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="h2">{editing ? "Gespräch bearbeiten" : "Neues Gespräch erfassen"}</h2>
          {editing && <Link href="?tab=gespraeche" className="link text-sm">Abbrechen</Link>}
        </div>
        <MeetingForm key={editing?.id ?? "neu"} coacheeId={coacheeId} meeting={editing} ai={aiEnabled()} />
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
            {m.ai_questions.length > 0 && (
              <div className="rounded-lg bg-tint/60 p-3 text-sm">
                <p className="mb-1 font-semibold text-accent">Fragen fürs nächste Gespräch</p>
                <ul className="list-disc space-y-0.5 pl-5">{m.ai_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap gap-4 pt-1 text-sm">
              {ai && m.notes.trim().length >= 20 && <AnalyzeButton coacheeId={coacheeId} meetingId={m.id} done={Boolean(m.analyzed_at)} />}
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

async function Wissen({ coacheeId, type, healthConsent, fresh }: { coacheeId: string; type: "job" | "gruendung"; healthConsent: boolean; fresh: number | null }) {
  const [items, suggestions] = await Promise.all([
    query<ProfileItem>(
      `SELECT p.*, m.title AS source_title, m.held_on AS source_date FROM profile_items p LEFT JOIN meetings m ON m.id = p.source_meeting_id
        WHERE p.coachee_id = $1 ORDER BY p.created_at`,
      [coacheeId],
    ),
    query<{ id: string; target: "profile" | "finance"; payload: Record<string, unknown>; meeting_title: string | null }>(
      `SELECT s.id, s.target, s.payload, m.title AS meeting_title FROM ai_suggestions s LEFT JOIN meetings m ON m.id = s.meeting_id
        WHERE s.coachee_id = $1 AND s.status = 'offen' ORDER BY s.target DESC, s.created_at`,
      [coacheeId],
    ),
  ]);
  const cats = categoriesFor(type);
  const missing = cats.filter((cat) => !cat.internal && !items.some((i) => i.category === cat.key));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        {fresh !== null && <Notice tone="ok">Die KI hat {fresh} Vorschläge gemacht. Prüfe sie unten und übernimm, was stimmt.</Notice>}
        {suggestions.length > 0 && (
          <section className="card space-y-4 border-gold/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">Vorschläge aus Gesprächen <span className="text-muted">({suggestions.length})</span></h2>
              <form action={rejectAllSuggestions.bind(null, coacheeId)}><button className="text-sm text-muted hover:text-danger">Alle verwerfen</button></form>
            </div>
            <p className="text-sm text-muted">Nichts davon ist gespeichert, bevor du es übernimmst. Du kannst jeden Vorschlag vorher ändern.</p>
            <div className="space-y-3">{suggestions.map((s) => <SuggestionCard key={s.id} coacheeId={coacheeId} type={type} s={s} healthConsent={healthConsent} />)}</div>
          </section>
        )}
        {cats.map((cat) => {
          const list = items.filter((i) => i.category === cat.key);
          if (!list.length) return null;
          return (
            <section key={cat.key} className="card space-y-3">
              <div>
                <h2 className="h2">{cat.label}</h2>
                <p className="text-xs text-muted">{cat.hint}</p>
              </div>
              <ul className="divide-y divide-line-soft">
                {list.map((i) => (
                  <li key={i.id} className="flex gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {i.title}
                        {i.level && <span className="ml-2 tracking-wider text-accent" title={`Stufe ${i.level} von 5`}>{"●".repeat(i.level)}<span className="text-line">{"●".repeat(5 - i.level)}</span></span>}
                        {i.internal && <span className="badge ml-2 bg-bg text-muted">intern</span>}
                      </p>
                      {i.detail && <p className="text-sm">{i.detail}</p>}
                      {(i.evidence || i.source_title) && (
                        <p className="text-xs text-muted">{i.evidence}{i.evidence && i.source_title ? " · " : ""}{i.source_title ? `aus „${i.source_title}“ vom ${formatDate(i.source_date)}` : ""}</p>
                      )}
                    </div>
                    <form action={deleteProfileItem.bind(null, coacheeId, i.id)}><button className="text-xs text-muted hover:text-danger">Löschen</button></form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {items.length === 0 && suggestions.length === 0 && (
          <Empty>Noch leer. Erfasse ein Gespräch und klicke dort auf „Mit KI auswerten“, oder trage rechts selbst etwas ein.</Empty>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="card space-y-3">
          <h2 className="h2">Selbst eintragen</h2>
          <ProfileItemForm coacheeId={coacheeId} type={type} />
        </div>
        {missing.length > 0 && (
          <div className="card space-y-2">
            <h2 className="h2">Noch offen</h2>
            <p className="text-sm text-muted">Dazu gibt es noch keinen Eintrag. Gute Themen fürs nächste Gespräch:</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">{missing.map((m) => <li key={m.key}>{m.label}</li>)}</ul>
          </div>
        )}
      </aside>
    </div>
  );
}

async function Zahlen({ coacheeId }: { coacheeId: string }) {
  const items = await query<FinanceItem & { source_title: string | null }>(
    "SELECT f.*, m.title AS source_title FROM finance_items f LEFT JOIN meetings m ON m.id = f.source_meeting_id WHERE f.coachee_id = $1 ORDER BY f.created_at",
    [coacheeId],
  );
  const sum = (key: string, fn: (i: FinanceItem) => number) => items.filter((i) => i.section === key).reduce((a, i) => a + fn(i), 0);
  const once = (i: FinanceItem) => (i.period === "einmalig" ? i.amount : 0);
  const umsatz = sum("umsatz", monthly), kosten = sum("kosten", monthly), privat = sum("privat", monthly);
  const bedarf = sum("kapitalbedarf", once), finanzierung = sum("finanzierung", once);
  const tiles = [
    { label: "Kapitalbedarf", value: euro(bedarf), sub: `finanziert: ${euro(finanzierung)}` },
    { label: "Umsatz im Monat", value: euro(umsatz) },
    { label: "Kosten im Monat", value: euro(kosten) },
    { label: "Bleibt im Monat", value: euro(umsatz - kosten - privat), sub: `nach ${euro(privat)} privatem Bedarf`, warn: umsatz - kosten - privat < 0 },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4 sm:p-4">
              <p className="text-xs text-muted">{t.label}</p>
              <p className={`text-xl font-bold tabular-nums ${t.warn ? "text-danger" : ""}`}>{t.value}</p>
              {t.sub && <p className="text-xs text-muted">{t.sub}</p>}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">Das sind die gesammelten Zahlen aus den Gesprächen. Beim ersten Öffnen des <Link href="?tab=finanzplan" className="link">Finanzplans</Link> werden sie dort eingetragen, später lassen sie sich dort neu übernehmen.</p>
        {FINANCE_SECTIONS.map((sec) => {
          const list = items.filter((i) => i.section === sec.key);
          if (!list.length) return null;
          return (
            <section key={sec.key} className="card space-y-2">
              <h2 className="h2">{sec.label}</h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line-soft">
                  {list.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 pr-3"><p className="font-medium">{i.label}</p>{(i.note || i.source_title) && <p className="text-xs text-muted">{i.note}{i.note && i.source_title ? " · " : ""}{i.source_title ? `aus „${i.source_title}“` : ""}</p>}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums">{euro(i.amount)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">{PERIOD_LABEL[i.period]}</td>
                      <td className="py-2 text-right"><form action={deleteFinanceItem.bind(null, coacheeId, i.id)}><button className="text-xs text-muted hover:text-danger">Löschen</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        {items.length === 0 && <Empty>Noch keine Zahlen. Beträge aus den Gesprächsnotizen schlägt die KI automatisch vor.</Empty>}
      </div>
      <aside className="card space-y-3 lg:sticky lg:top-20 lg:self-start">
        <h2 className="h2">Position eintragen</h2>
        <FinanceItemForm coacheeId={coacheeId} />
      </aside>
    </div>
  );
}
