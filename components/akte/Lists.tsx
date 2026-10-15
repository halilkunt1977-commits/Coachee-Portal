import { deleteTask, toggleTask } from "@/app/actions/akte";
import { Empty, formatDate, formatDateTime } from "../ui";

export type Task = { id: string; title: string; details: string; due_on: string | null; done_at: string | null };
export type Message = { id: string; body: string; created_at: string; author_id: string | null; author_name: string | null };

export function TaskList({ coacheeId, tasks, coach }: { coacheeId: string; tasks: Task[]; coach: boolean }) {
  if (!tasks.length) return <Empty>Keine Aufgaben.</Empty>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="divide-y divide-line-soft">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-3">
          <form action={toggleTask.bind(null, coacheeId, t.id)}>
            <button aria-label={t.done_at ? "Als offen markieren" : "Als erledigt markieren"} className={`mt-0.5 grid size-5 place-items-center rounded-md border ${t.done_at ? "border-ok bg-ok text-white" : "border-line bg-surface hover:border-accent"}`}>
              {t.done_at && <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>}
            </button>
          </form>
          <div className="min-w-0 flex-1">
            <p className={t.done_at ? "text-muted line-through" : "font-medium"}>{t.title}</p>
            {t.details && <p className="text-sm text-muted">{t.details}</p>}
            {t.due_on && !t.done_at && <p className={`text-xs ${t.due_on < today ? "font-semibold text-danger" : "text-muted"}`}>bis {formatDate(t.due_on)}</p>}
          </div>
          {coach && (
            <form action={deleteTask.bind(null, coacheeId, t.id)}>
              <button className="text-xs text-muted hover:text-danger">Löschen</button>
            </form>
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
              <p className="whitespace-pre-wrap text-[15px]">{m.body}</p>
              <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-muted"}`}>{m.author_name ?? "Gelöschtes Konto"} · {formatDateTime(m.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
