import Link from "next/link";
import { deleteTask, toggleTask } from "@/app/actions/akte";
import { isShareKind, SHARE_META, sharedHref, type ShareKind } from "@/lib/teilen-shared";
import { Icon } from "../shell/icons";
import { ConfirmButton } from "../ConfirmButton";
import { ShareButton } from "../teilen/ShareButton";
import { Empty, formatDate, formatDateTime } from "../ui";

export type Task = { id: string; title: string; details: string; due_on: string | null; done_at: string | null; /** vom Coachee selbst angelegt: kein „An … senden“ */ by_coachee?: boolean };
export type Message = { id: string; body: string; created_at: string; author_id: string | null; author_name: string | null; read_at?: string | null; ref_kind?: string | null; ref_title?: string | null };

/** Spalten für MessageList (Platzhalter m = messages, u = users) */
export const MESSAGE_COLUMNS = "m.id, m.body, m.created_at, m.author_id, m.read_at, m.ref_kind, m.ref_title, u.name AS author_name";

export function TaskList({ coacheeId, tasks, coach, recipient }: { coacheeId: string; tasks: Task[]; coach: boolean; /** Vorname: Aufgabe noch einmal an den Coachee schicken */ recipient?: string }) {
  if (!tasks.length) return <Empty>Keine Aufgaben.</Empty>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="divide-y divide-line-soft">
      {tasks.map((t) => (
        <li key={t.id} id={`aufgabe-${t.id}`} className="flex scroll-mt-24 items-start gap-3 py-3">
          <form action={toggleTask.bind(null, coacheeId, t.id)} className="-my-2.5 -ml-2.5 shrink-0">
            {/* Trefferfläche 44 px, sichtbar ein Kästchen */}
            <button aria-label={t.done_at ? "Als offen markieren" : "Als erledigt markieren"} className="group/check grid size-11 place-items-center rounded-lg">
              <span className={`grid size-6 place-items-center rounded-md border sm:size-5 ${t.done_at ? "border-ok bg-ok text-white" : "border-line bg-surface group-hover/check:border-accent"}`}>
                {t.done_at && <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>}
              </span>
            </button>
          </form>
          <div className="min-w-0 flex-1">
            <p className={t.done_at ? "text-muted line-through" : "font-medium"}>{t.title}</p>
            {t.details && <p className="text-sm text-muted">{t.details}</p>}
            {t.due_on && !t.done_at && <p className={`text-xs ${t.due_on < today ? "font-semibold text-danger" : "text-muted"}`}>bis {formatDate(t.due_on)}</p>}
          </div>
          {coach && (
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              {recipient && !t.done_at && !t.by_coachee && <ShareButton kind="aufgabe" refId={t.id} role="coach" coacheeId={coacheeId} recipient={recipient} title={t.title} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline" />}
              <form action={deleteTask.bind(null, coacheeId, t.id)}>
                <ConfirmButton label="Löschen" />
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MessageList({ messages, selfId }: { messages: Message[]; selfId: string }) {
  if (!messages.length) return <Empty>Noch keine Nachrichten.</Empty>;
  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const mine = m.author_id === selfId;
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "bg-accent text-white" : "bg-bg"}`}>
              {m.ref_kind && isShareKind(m.ref_kind) && <SharedCard id={m.id} kind={m.ref_kind} title={m.ref_title ?? ""} mine={mine} />}
              {m.body && <p className="whitespace-pre-wrap break-words text-[15px] [overflow-wrap:anywhere]">{m.body}</p>}
              <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-muted"}`}>{m.author_name ?? "Gelöschtes Konto"} · {formatDateTime(m.created_at)}{mine && m.read_at ? " · gelesen" : ""}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Geteilte Sache als Karte in der Nachricht; der Link prüft die Berechtigung und öffnet die passende Ansicht */
function SharedCard({ id, kind, title, mine }: { id: string; kind: ShareKind; title: string; mine: boolean }) {
  const meta = SHARE_META[kind];
  return (
    <Link href={sharedHref(id)} className={`mb-1.5 flex items-center gap-2.5 rounded-xl p-2 pr-3 transition ${mine ? "bg-white/15 hover:bg-white/25" : "bg-surface hover:bg-surface-2"}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${mine ? "bg-white/20 text-white" : meta.tone}`}><Icon name={meta.icon} className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[10.5px] font-bold uppercase tracking-[0.12em] ${mine ? "text-white/70" : "text-muted"}`}>{meta.label}</span>
        <span className="block truncate text-sm font-semibold">{title || meta.label}</span>
      </span>
      <Icon name="arrow" className="size-4 shrink-0 opacity-70" />
    </Link>
  );
}
