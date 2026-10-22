import Link from "next/link";
import { AkteMails } from "@/components/inbox/AkteMails";
import { deleteMeeting } from "@/app/actions/akte";
import { MeetingForm } from "@/components/akte/MeetingForm";
import { MessageForm } from "@/components/akte/MessageForm";
import { MESSAGE_COLUMNS, MessageList, TaskList, type Message, type Task } from "@/components/akte/Lists";
import { TaskForm } from "@/components/akte/TaskForm";
import { CvList } from "@/components/cv/CvList";
import { AttendancePanel } from "@/components/attendance/Panel";
import { DocumentsPanel } from "@/components/documents/Panel";
import { SurveyPanel } from "@/components/survey/Panel";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { FinancePanel, PlanPanel } from "@/components/bp/Panels";
import { BewerbungenPanel, StellenPanel } from "@/components/jobs/Panels";
import { StellenAnalysen } from "@/components/jobs/Analysen";
import { AnalyzeButton, FinanceItemForm, ProfileItemForm, SuggestionCard } from "@/components/akte/Wissen";
import { aiEnabled } from "@/lib/ai";
import { MAIL_PROBLEM_TEXT } from "@/lib/mail";
import { FINANCE_SECTIONS, PERIOD_LABEL, categoriesFor, euro, monthly, type FinanceItem, type ProfileItem } from "@/lib/profile";
import { Empty, Notice, formatDate, formatDateTime, formatUnits } from "@/components/ui";
import { coacheeFor, foerderartLabel, fullName, fundingLabel, statusLabel, typeLabel } from "@/lib/access";
import { audit, requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { unitsUsedSql } from "@/lib/attendance/units";
import { deleteFinanceItem, deleteProfileItem, rejectAllSuggestions } from "@/app/actions/profil";
import { resendInvite, setAccess } from "../../actions";
import DeleteCoachee from "./DeleteCoachee";
import { Avatar } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { PresenceLine } from "@/components/presence/Presence";
import { Ring } from "@/components/dashboard/Charts";
import InviteLink from "./InviteLink";
import MoreMenu from "./MoreMenu";
import { SetupHint } from "@/components/coach/SetupHint";
import CloseCoaching from "./CloseCoaching";
import StammdatenForm from "./StammdatenForm";
import { progressFor, type Links } from "@/lib/dashboard/progress";
import { ChaptersCard, JobsFunnel, MilestonesCard, PartsGrid, UnitsCard } from "@/components/dashboard/ProgressBoard";
import type { Coachee } from "@/lib/access";
import { AkteTermine } from "@/components/calendar/AkteTermine";
import { HandbookView } from "@/components/handbuch/HandbookView";
import { handbookFor } from "@/lib/handbuch/store";
import { FeatureBlock } from "@/components/features/Parts";

type Meeting = { id: string; held_on: string; units: number; format: string; title: string; notes: string; results: string; next_steps: string; internal_note: string; shared: boolean; ai_questions: string[]; analyzed_at: string | null; doc_text: string; doc_auto: boolean };

const TABS = [
  { key: "uebersicht", label: "Übersicht", group: "ueberblick" },
  { key: "termine", label: "Termine", group: "coaching" },
  { key: "gespraeche", label: "Gespräche", group: "coaching" },
  { key: "anwesenheit", label: "Anwesenheit", group: "coaching" },
  { key: "aufgaben", label: "Aufgaben", group: "coaching" },
  { key: "nachrichten", label: "Nachrichten", group: "coaching" },
  { key: "mails", label: "Träger-Mails", group: "coaching" },
  { key: "assistent", label: "KI-Assistent", group: "coaching" },
  { key: "wissen", label: "Kompetenzprofil", group: "ziel" },
  { key: "stellen", label: "Stellen", group: "ziel" },
  { key: "bewerbungen", label: "Bewerbungen", group: "ziel" },
  { key: "zahlen", label: "Zahlen", group: "ziel" },
  { key: "businessplan", label: "Businessplan", group: "ziel" },
  { key: "finanzplan", label: "Finanzplan", group: "ziel" },
  { key: "lebenslauf", label: "Lebenslauf", group: "unterlagen" },
  { key: "erfahrung", label: "Erfahrungsbogen", group: "unterlagen" },
  { key: "dokumente", label: "Dokumente", group: "unterlagen" },
  { key: "handbuch", label: "Handbuch", group: "unterlagen" },
  { key: "stammdaten", label: "Stammdaten", group: "verwaltung" },
  { key: "verlauf", label: "Zugriffe", group: "verwaltung" },
] as const;
const GROUPS = [
  { key: "ueberblick", label: "Überblick", icon: "grid" },
  { key: "coaching", label: "Coaching", icon: "chat" },
  { key: "ziel", label: "", icon: "flag" },
  { key: "unterlagen", label: "Unterlagen", icon: "folder" },
  { key: "verwaltung", label: "Verwaltung", icon: "settings" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const de2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const formatLabel: Record<string, string> = { praesenz: "Vor Ort", online: "Online", telefon: "Telefon" };
const actionLabel: Record<string, string> = {
  login: "Anmeldung", logout: "Abmeldung", login_failed: "Fehlgeschlagene Anmeldung", mfa_passed: "Zweiter Faktor bestätigt",
  coachee_created: "Akte angelegt", coachee_updated: "Stammdaten geändert", invite_sent: "Einladung verschickt", invite_link_created: "Einladungslink erzeugt",
  invite_accepted: "Einladung angenommen", meeting_created: "Gespräch angelegt", meeting_updated: "Gespräch geändert", meeting_deleted: "Gespräch gelöscht",
  mail_category: "Mail neu eingeordnet", mail_coachee: "Mail zugeordnet", document_from_mail: "Dokument aus Mail übernommen", document_signature: "Unterschrift-Status geändert",
  task_created: "Aufgabe angelegt", task_toggled: "Aufgabe abgehakt", task_deleted: "Aufgabe gelöscht", message_sent: "Nachricht gesendet", doku_pdf: "Beratungsdokumentation geöffnet", job_analyzed: "Stelle analysiert", job_report_filed: "Stellenbericht abgelegt",
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
  coachee_deleted: "Coachee gelöscht", milestone_done: "Etappe abgehakt", milestone_undone: "Etappe zurückgenommen",
  appointment_created: "Termin angelegt", appointment_updated: "Termin geändert", appointment_cancelled: "Termin abgesagt", appointment_deleted: "Termin gelöscht",
  handbook_pdf: "Handbuch als PDF geladen", contact_updated: "Eigene Kontaktdaten geändert",
  feature_enabled: "Freigabe erteilt", feature_disabled: "Freigabe entzogen", ai_limit_set: "Monatsgrenze für Hilfen geändert",
  access_disabled: "Zugang gesperrt", access_enabled: "Zugang freigegeben", akte_viewed: "Akte geöffnet", shared: "Geteilt (an Coach oder Coachee gesendet)",
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

  const activeGroup = tabs.find((t) => t.key === tab)!.group;
  const badge = (key: string) =>
    key === "nachrichten" ? stats?.unread : key === "bewerbungen" ? stats?.due : key === "wissen" ? stats?.suggestions : key === "erfahrung" ? stats?.survey_new : 0;
  const groupBadge = (g: string) => tabs.filter((t) => t.group === g).reduce((a, t) => a + (badge(t.key) ?? 0), 0);
  const done = c.status === "abgeschlossen";
  const quick = "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold transition hover:bg-white/20 sm:min-h-9 sm:text-xs";
  const menuItem = "flex min-h-11 items-center gap-2.5 rounded-lg px-3 font-medium transition hover:bg-surface-2";

  return (
    <div className="space-y-6">
      <Link href="/coach/coachees" className="rise inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-accent">
        <span className="rotate-180"><Icon name="arrow" className="size-4" /></span> Alle Coachees
      </Link>

      <section className={`rise relative rounded-[24px] px-4 py-4 sm:px-8 sm:py-7 ${done ? "bg-gradient-to-br from-[#1f6b45] to-[#123f29] text-white" : "night"}`}>
        <div className="night-grid pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-3 sm:gap-5">
            <Avatar name={fullName(c)} size="size-12 sm:size-20" className="!text-base ring-4 ring-white/10 sm:!text-xl" />
            <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
              <h1 className="font-[family-name:var(--font-display)] text-xl leading-tight font-bold tracking-tight break-words sm:text-3xl">{fullName(c)}</h1>
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <span className="rounded-full bg-white/15 px-2.5 py-1">{typeLabel[c.coaching_type]}</span>
                {c.coaching_type === "gruendung" && c.foerderart && <span className="rounded-full bg-gold/90 px-2.5 py-1 text-night">{foerderartLabel[c.foerderart]}</span>}
                <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-white/75 sm:inline">{fundingLabel[c.funding]}{c.voucher_number ? ` · ${c.voucher_number}` : ""}</span>
                <span className={`rounded-full px-2.5 py-1 ${done ? "bg-white text-ok" : "bg-white/10 text-white/75"}`}>{done ? "✓ " : ""}{statusLabel[c.status]}</span>
                {account && !account.has_password && <span className="rounded-full bg-gold px-2.5 py-1 text-night">Einladung offen</span>}
                {account && !account.active && <span className="rounded-full bg-danger px-2.5 py-1">Zugang gesperrt</span>}
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/65">
                <PresenceLine id={c.id} />
                <span className="hidden items-center gap-1.5 sm:inline-flex"><Icon name="mail" className="size-4" />{c.email}</span>
                {c.phone && <span className="hidden sm:inline">{c.phone}</span>}
                {(c.start_date || c.end_date) && <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="size-4" />{formatDate(c.start_date)} bis {formatDate(c.end_date)}</span>}
              </p>
            </div>
          </div>
          <div className="glass flex w-full items-center gap-3 px-3 py-2.5 sm:w-auto sm:gap-4 sm:p-4" aria-label="Kontingent an Unterrichtseinheiten">
            <Ring pct={pct ?? 0} size={44} stroke={5} tone="white" track="rgba(255,255,255,.18)">
              <Icon name="clock" className="size-4 text-white/80" />
            </Ring>
            <div className="min-w-0">
              <p className="text-xs text-white/60">Unterrichtseinheiten</p>
              <p className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums sm:text-xl">
                {c.units_total ? `${de2(used)} von ${c.units_total} UE` : formatUnits(used)}
              </p>
              <p className="text-xs text-white/60">{c.units_total ? `${de2(Math.max(0, c.units_total - used))} UE übrig` : "kein Kontingent hinterlegt"}</p>
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
          <Link href="?tab=termine&neu=1" className={quick}><Icon name="calendar" className="size-4" />Termin planen</Link>
          <Link href="?tab=nachrichten" className={quick}><Icon name="chat" className="size-4" /><span>Nachricht<span className="hidden sm:inline"> schreiben</span></span></Link>
          <Link href="?tab=gespraeche" className={`${quick} max-sm:!hidden`}><Icon name="plus" className="size-4" />Gespräch erfassen</Link>
          <Link href="?tab=anwesenheit" className={`${quick} max-sm:!hidden`}><Icon name="clock" className="size-4" />Anwesenheit</Link>
          <div className="ml-auto">
            <MoreMenu>
              <Link href="?tab=gespraeche" role="menuitem" className={`${menuItem} sm:hidden`}><Icon name="plus" className="size-4 text-muted" />Gespräch erfassen</Link>
              <Link href="?tab=anwesenheit" role="menuitem" className={`${menuItem} sm:hidden`}><Icon name="clock" className="size-4 text-muted" />Anwesenheit</Link>
              <a href={`mailto:${c.email}`} role="menuitem" className={menuItem}><Icon name="mail" className="size-4 shrink-0 text-muted" /><span className="truncate">{c.email}</span></a>
              {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} role="menuitem" className={menuItem}><span className="w-4 text-center text-muted">☎</span>{c.phone}</a>}
              <p className="px-3 pt-1.5 pb-1 text-xs text-muted">{fundingLabel[c.funding]}{c.voucher_number ? ` · ${c.voucher_number}` : ""}</p>
              <div className="my-1 border-t border-line-soft" />
              <Link href="?tab=stammdaten" role="menuitem" className={menuItem}><Icon name="settings" className="size-4 text-muted" />Stammdaten und Zugang</Link>
              <Link href={`/coach/coachees/${c.id}/erklaervideo`} role="menuitem" className={menuItem}><Icon name="play" className="size-4 text-muted" />Erklärvideo ansehen</Link>
              <Link href="?tab=stammdaten#abschluss" role="menuitem" className={menuItem}><Icon name="check" className="size-4 text-muted" />{done ? "Coaching wieder aufnehmen" : "Coaching abschließen"}</Link>
            </MoreMenu>
          </div>
        </div>
      </section>

      <nav className="rise z-20 space-y-2 sm:sticky sm:top-[57px] sm:-mx-0 sm:bg-bg/90 sm:py-2 sm:backdrop-blur-xl lg:top-0" style={{ ["--i" as string]: 1 }} aria-label="Bereiche der Akte">
        <div className="grid grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:gap-1.5">
          {GROUPS.map((g) => {
            const first = tabs.find((t) => t.group === g.key);
            if (!first) return null;
            const active = g.key === activeGroup;
            const n = groupBadge(g.key);
            return (
              <Link key={g.key} href={`?tab=${first.key}`} aria-current={active ? "true" : undefined}
                className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition sm:min-h-0 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm ${active ? "bg-accent text-white shadow-[0_6px_14px_-8px_rgba(29,58,102,.8)]" : "bg-surface text-muted ring-1 ring-line-soft hover:text-ink"}`}>
                <Icon name={g.icon} className="size-5 sm:size-4" />
                <span className="max-w-full truncate">{g.label || (c.coaching_type === "gruendung" ? "Gründung" : "Bewerbung")}</span>
                {n > 0 && <span className={`rounded-full px-1.5 text-[11px] max-sm:absolute max-sm:top-1 max-sm:right-1 ${active ? "bg-white/20" : "bg-danger text-white"}`}>{n}</span>}
              </Link>
            );
          })}
        </div>
        {tabs.filter((t) => t.group === activeGroup).length > 1 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-1 sm:border-b sm:border-line-soft">
            {tabs.filter((t) => t.group === activeGroup).map((t) => (
              <Link key={t.key} href={`?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
                className={`relative inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition max-sm:ring-1 sm:min-h-0 sm:rounded-none sm:py-2 ${tab === t.key ? "text-accent max-sm:bg-tint max-sm:ring-accent/30" : "text-muted hover:text-ink max-sm:bg-surface max-sm:ring-line-soft"}`}>
                {t.label}
                {(badge(t.key) ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[11px] text-white">{t.key === "erfahrung" ? "neu" : badge(t.key)}</span>}
                {tab === t.key && <span className="absolute inset-x-2 -bottom-px hidden h-0.5 rounded-full bg-accent sm:block" />}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {sp.eingeladen === "1" && <Notice tone="ok">Die Einladung ist per E-Mail an {c.email} unterwegs.</Notice>}
      {typeof sp.eingeladen === "string" && sp.eingeladen !== "1" && (
        <Notice tone="error">
          {MAIL_PROBLEM_TEXT[sp.eingeladen === "link" ? "aus" : sp.eingeladen] ?? MAIL_PROBLEM_TEXT.sonst} Bis dahin unter „Stammdaten“ einen Einladungslink erzeugen und selbst weitergeben.
          <SetupHint>In den Einstellungen der App SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS und MAIL_FROM prüfen.</SetupHint>
        </Notice>
      )}


      {tab === "uebersicht" && <Overview coachee={c} stats={stats} />}
      {tab === "termine" && <AkteTermine coach={coach} coachee={c} sp={sp} />}
      {tab === "gespraeche" && <Meetings coachee={c} edit={typeof sp.bearbeiten === "string" ? sp.bearbeiten : null} />}
      {tab === "anwesenheit" && <AttendancePanel coachee={c} used={used} oldestFirst={sp.sortierung === "alt"} />}
      {tab === "dokumente" && <DocumentsPanel coachee={c} />}
      {tab === "wissen" && <Wissen coacheeId={c.id} type={c.coaching_type} healthConsent={Boolean(c.consent_special_at)} fresh={typeof sp.neu === "string" ? Number(sp.neu) : null} />}
      {tab === "stellen" && <StellenPanel user={coach} coachee={c} links={jobLinks} />}
      {tab === "bewerbungen" && (
        <div className="space-y-8">
          <BewerbungenPanel user={coach} coachee={c} links={jobLinks} focus={typeof sp.stelle === "string" ? sp.stelle : null} />
          <StellenAnalysen coachee={c} coachId={coach.id} />
        </div>
      )}
      {tab === "zahlen" && <Zahlen coacheeId={c.id} />}
      {tab === "businessplan" && <PlanPanel user={coach} coachee={c} links={bpLinks} />}
      {tab === "finanzplan" && <FinancePanel user={coach} coachee={c} links={bpLinks} />}
      {tab === "lebenslauf" && <CvList coacheeId={c.id} coach recipient={c.first_name} />}
      {tab === "erfahrung" && <SurveyPanel coachee={c} coach />}
      {tab === "assistent" && <AssistantPanel user={coach} coachee={c} chatId={typeof sp.chat === "string" ? sp.chat : null} base={{ chat: "?tab=assistent&chat=", fresh: "?tab=assistent" }} />}
      {tab === "handbuch" && <AkteHandbook coachee={c} />}
      {tab === "aufgaben" && <Tasks coacheeId={c.id} firstName={c.first_name} />}
      {tab === "mails" && <AkteMails coacheeId={c.id} />}
      {tab === "nachrichten" && <Messages coacheeId={c.id} selfId={coach.id} firstName={c.first_name} />}
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
                    <button className={`min-h-11 text-sm sm:min-h-0 ${account.active ? "text-danger" : "text-ok"} hover:underline`}>{account.active ? "Zugang sperren" : "Zugang wieder freigeben"}</button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-muted">Kein Zugang verknüpft.</p>
              )}
            </div>
            <div id="abschluss" className="card scroll-mt-28 space-y-3">
              <h2 className="h2">Coaching {done ? "abgeschlossen" : "abschließen"}</h2>
              <p className="text-sm text-muted">{done ? "Das Coaching ist abgeschlossen. Der Zugang bleibt bestehen." : "Wenn alle Termine erledigt sind. Der Zugang bleibt bestehen."}</p>
              <CloseCoaching key={c.status} coacheeId={c.id} firstName={c.first_name} done={done} />
            </div>
            <div className="card space-y-3">
              <h2 className="h2">Erklärvideo</h2>
              <p className="text-sm text-muted">
                „So funktioniert dein Portal“ mit Begrüßung für {c.first_name}, auf {c.language === "tr" ? "Türkisch" : "Deutsch"}.
                {c.video_seen_at ? ` Angesehen am ${formatDate(c.video_seen_at)}.` : " Noch nicht angesehen."}
              </p>
              <Link href={`/coach/coachees/${c.id}/erklaervideo`} className="btn-ghost w-full justify-center"><Icon name="play" className="size-4" />Erklärvideo ansehen</Link>
            </div>
            <FeatureBlock coachId={coach.id} coachee={c} />
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

const AKTE_LINKS: Links = {
  cv: "?tab=lebenslauf",
  plan: "?tab=businessplan",
  finance: "?tab=finanzplan",
  profile: "?tab=wissen",
  survey: "?tab=erfahrung",
  jobs: "?tab=bewerbungen",
  attendance: "?tab=anwesenheit",
};

async function Overview({ coachee, stats }: { coachee: Coachee; stats: { meetings: number; open_tasks: number } | null }) {
  const { id: coacheeId, goal, internal_note: note } = coachee;
  const [last, tasks, progress] = await Promise.all([
    one<Meeting>("SELECT * FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 1", [coacheeId]),
    query<Task>("SELECT t.*, (c.user_id IS NOT NULL AND t.created_by = c.user_id) AS by_coachee FROM tasks t JOIN coachees c ON c.id = t.coachee_id WHERE t.coachee_id = $1 AND t.done_at IS NULL ORDER BY t.due_on NULLS LAST, t.created_at LIMIT 5", [coacheeId]),
    progressFor(coachee),
  ]);
  return (
    <div className="space-y-6">
    <PartsGrid p={progress} links={AKTE_LINKS} />
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="min-w-0 space-y-6">
        <UnitsCard p={progress} href={AKTE_LINKS.attendance} you={false} />
        {coachee.coaching_type === "gruendung" ? <ChaptersCard p={progress} href={AKTE_LINKS.plan} /> : <JobsFunnel p={progress} href={AKTE_LINKS.jobs} />}
      </div>
      <MilestonesCard coacheeId={coacheeId} p={progress} you={false} />
    </div>
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
        <TaskList coacheeId={coacheeId} tasks={tasks} coach recipient={coachee.first_name} />
      </div>
    </div>
    </div>
  );
}

async function Meetings({ coachee, edit }: { coachee: Coachee; edit: string | null }) {
  const coacheeId = coachee.id;
  const meetings = await query<Meeting>("SELECT * FROM meetings WHERE coachee_id = $1 ORDER BY held_on DESC, created_at DESC", [coacheeId]);
  const editing = edit ? meetings.find((m) => m.id === edit) : undefined;
  const ai = aiEnabled();
  const counted = meetings.filter((m) => Number(m.units) > 0);
  const formSheets = await query<{ generated: string; signature: string | null }>(
    "SELECT generated, signature FROM documents WHERE coachee_id = $1 AND generated LIKE 'avocons\\_doku\\_%' ORDER BY length(generated), generated",
    [coacheeId],
  );
  const missing = [!coachee.voucher_number && "Kunden-Nummer", !coachee.measure_type && "Maßnahmeart", !coachee.start_date && "Bewilligungszeitraum"].filter(Boolean);
  return (
    <div className="space-y-6">
    <section className="card flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="h2">Beratungsdokumentation {coachee.traeger === "avocons" ? "für AVOCONS" : "(Formular AVOCONS)"}</h2>
        <p className="text-sm text-muted">
          {counted.length
            ? `${counted.length} ${counted.length === 1 ? "Termin" : "Termine"} auf ${Math.ceil(counted.length / 4)} ${Math.ceil(counted.length / 4) === 1 ? "Blatt" : "Blättern"}. `
            : "Noch keine Gespräche mit UE. "}
          {coachee.traeger === "avocons"
            ? formSheets.length
              ? "Das Original-Formular von AVOCONS wird nach jedem Gespräch ausgefüllt, jedes Blatt liegt unter „Dokumente“ zum Unterschreiben."
              : "Wird nach jedem Gespräch neu erzeugt und liegt unter „Dokumente“ zum Unterschreiben. Sobald das Formular von AVOCONS unter „Dokumente“ liegt, wird es im Original ausgefüllt."
            : "Entsteht aus den Gesprächen mit UE."}
          {missing.length > 0 && <> Im Kopf fehlt noch: {missing.join(", ")} (unter <Link href="?tab=stammdaten" className="link">Stammdaten</Link>).</>}
        </p>
      </div>
      {formSheets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {formSheets.map((d) => {
            const n = d.generated.replace("avocons_doku_", "");
            return (
              <a key={n} href={`/api/dokumentation/${coacheeId}?blatt=${n}`} target="_blank" className="btn-ghost btn-sm">
                <Icon name="doc" className="size-4" /> Blatt {n}{d.signature === "unterschrieben" && " ✓"}
              </a>
            );
          })}
        </div>
      ) : (
        counted.length > 0 && <a href={`/api/dokumentation/${coacheeId}`} target="_blank" className="btn-ghost btn-sm"><Icon name="doc" className="size-4" /> PDF ansehen</a>
      )}
    </section>
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
            {m.doc_text && Number(m.units) > 0 && (
              <p className="rounded-lg border border-line-soft p-2 text-sm"><span className="font-semibold">Dokumentation{m.doc_auto ? "" : " (von dir angepasst)"}: </span>{m.doc_text}</p>
            )}
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
    </div>
  );
}

async function Tasks({ coacheeId, firstName }: { coacheeId: string; firstName: string }) {
  const tasks = await query<Task>("SELECT t.*, (c.user_id IS NOT NULL AND t.created_by = c.user_id) AS by_coachee FROM tasks t JOIN coachees c ON c.id = t.coachee_id WHERE t.coachee_id = $1 ORDER BY t.done_at IS NOT NULL, t.due_on NULLS LAST, t.created_at", [coacheeId]);
  return (
    <div className="card space-y-5">
      <TaskForm coacheeId={coacheeId} coach />
      <TaskList coacheeId={coacheeId} tasks={tasks} coach recipient={firstName} />
    </div>
  );
}

async function Messages({ coacheeId, selfId, firstName }: { coacheeId: string; selfId: string; firstName: string }) {
  const messages = await query<Message>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.coachee_id = $1 ORDER BY m.created_at`,
    [coacheeId],
  );
  await query("UPDATE messages SET read_at = now() WHERE coachee_id = $1 AND read_at IS NULL AND author_id IS DISTINCT FROM $2", [coacheeId, selfId]);
  return (
    <div className="card mx-auto max-w-3xl space-y-5">
      <p className="text-xs text-muted">Nachrichten zwischen dir und {firstName} hier im Portal. Mails von AVOCONS und Erfolgspfad stehen unter <Link href="?tab=mails" className="link">Träger-Mails</Link>.</p>
      <MessageList messages={messages} selfId={selfId} />
      <MessageForm coacheeId={coacheeId} />
    </div>
  );
}

async function AuditTrail({ coacheeId }: { coacheeId: string }) {
  const rows = await query<{ id: number; action: string; created_at: string; name: string | null; ip: string | null; label: string | null }>(
    "SELECT a.id, a.action, a.created_at, u.name, a.ip, CASE WHEN a.action LIKE 'feature_%' THEN a.detail->>'label' END AS label FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.coachee_id = $1 ORDER BY a.created_at DESC LIMIT 200",
    [coacheeId],
  );
  return (
    <div className="card">
      <p className="mb-4 text-sm text-muted">Wer hat wann was in dieser Akte gemacht. Die letzten 200 Einträge.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="pb-2">Zeitpunkt</th><th className="pb-2">Wer</th><th className="pb-2">Was</th></tr></thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => (
            <tr key={r.id}><td className="py-1.5 pr-4 whitespace-nowrap">{formatDateTime(r.created_at)}</td><td className="py-1.5 pr-4">{r.name ?? "–"}</td><td className="py-1.5">{actionLabel[r.action] ?? r.action}{r.label ? `: ${r.label}` : ""}</td></tr>
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

/** Das Handbuch des Coachees, so wie er es sieht (lesend; abhaken kann nur der Coachee) */
async function AkteHandbook({ coachee }: { coachee: Coachee }) {
  const { book, done, total } = await handbookFor(coachee);
  return (
    <div className="space-y-4">
      <Notice>
        So sieht {coachee.first_name} das Handbuch unter „Mein Handbuch“, auch nach dem Coaching. Die Fassung richtet sich nach Coaching-Art
        {coachee.coaching_type === "gruendung" ? " und Förderart" : ""} in den Stammdaten. Abhaken kann nur {coachee.first_name}.
      </Notice>
      <HandbookView book={book} name={fullName(coachee)} done={done} total={total} coacheeId={coachee.id} editable={false} pdfHref={`/api/handbuch/${coachee.id}/pdf`} embedded />
    </div>
  );
}
