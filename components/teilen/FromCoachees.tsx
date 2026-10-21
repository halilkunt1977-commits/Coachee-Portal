import Link from "next/link";
import { markFromCoacheesRead } from "@/app/actions/teilen";
import { Avatar } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty } from "@/components/ui";
import { query } from "@/lib/db";
import { ago } from "@/lib/inbox/time";
import { isShareKind, SHARE_META, sharedHref } from "@/lib/teilen-shared";

type Row = { id: string; coachee_id: string; name: string; body: string; created_at: string; read_at: string | null; ref_kind: string | null; ref_title: string };

/**
 * Posteingang des Coachs, Bereich „Von Coachees“: Nachrichten und alles, was Coachees geschickt haben, das Neueste oben.
 * Geteilte Sachen öffnen direkt in der Akte (über /geteilt/…, das die Berechtigung prüft), Antworten geht im Nachrichten-Tab der Akte.
 */
export async function FromCoachees({ coachId, art, href }: { coachId: string; art: string | null; href: (p: Record<string, string | null>) => string }) {
  const filter = art === "neu" ? "AND m.read_at IS NULL" : art === "geteilt" ? "AND m.ref_kind IS NOT NULL" : "";
  const [rows, counts] = await Promise.all([
    query<Row>(
      `SELECT m.id, m.coachee_id, c.first_name || ' ' || c.last_name AS name, m.body, m.created_at, m.read_at, m.ref_kind, m.ref_title
         FROM messages m JOIN coachees c ON c.id = m.coachee_id
        WHERE c.coach_id = $1 AND c.user_id IS NOT NULL AND m.author_id = c.user_id ${filter}
        ORDER BY m.created_at DESC LIMIT 150`,
      [coachId],
    ),
    query<{ unread: number; shared: number }>(
      `SELECT count(*) FILTER (WHERE m.read_at IS NULL)::int AS unread, count(*) FILTER (WHERE m.ref_kind IS NOT NULL)::int AS shared
         FROM messages m JOIN coachees c ON c.id = m.coachee_id WHERE c.coach_id = $1 AND c.user_id IS NOT NULL AND m.author_id = c.user_id`,
      [coachId],
    ),
  ]);
  const { unread = 0, shared = 0 } = counts[0] ?? {};
  const chip = (key: string | null, label: string, n?: number) => (
    <Link key={key ?? "alle"} href={href({ art: key })} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${art === key ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-accent/40 hover:text-accent"}`}>
      {label}
      {n ? <span className={`rounded-full px-1.5 text-[11px] ${art === key ? "bg-white/20" : key === "neu" ? "bg-danger text-white" : "bg-surface-2"}`}>{n}</span> : null}
    </Link>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <nav className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Auswahl">
        {chip(null, "Alle")}
        {chip("neu", "Ungelesen", unread)}
        {chip("geteilt", "Geteilt", shared)}
        {unread > 0 && (
          <form action={markFromCoacheesRead.bind(null, undefined)} className="ml-auto shrink-0">
            <SubmitButton className="btn-ghost btn-sm !py-2" pendingText="Einen Moment …">Alle gelesen</SubmitButton>
          </form>
        )}
      </nav>
      {rows.length === 0 && (
        <Empty>{art ? "Nichts in dieser Auswahl." : "Hier landet alles, was deine Coachees dir schicken: Nachrichten, Stellen, Lebensläufe, Aufgaben, Anschreiben und Pläne."}</Empty>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const unreadRow = !r.read_at;
          const kind = r.ref_kind && isShareKind(r.ref_kind) ? r.ref_kind : null;
          const meta = kind ? SHARE_META[kind] : null;
          const akte = `/coach/coachees/${r.coachee_id}`;
          return (
            <li key={r.id} id={`von-${r.id}`} className={`card !p-4 ${unreadRow ? "ring-1 ring-accent/25" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="relative">
                  <Avatar name={r.name} size="size-10" />
                  {unreadRow && <span aria-label="ungelesen" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-danger ring-2 ring-surface" />}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex items-baseline justify-between gap-2">
                    <Link href={akte} className={`truncate hover:text-accent ${unreadRow ? "font-bold" : "font-semibold"}`}>{r.name}</Link>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{ago(r.created_at)}</span>
                  </p>
                  <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${unreadRow ? "text-accent" : "text-muted"}`}>{meta ? `${meta.label} geteilt` : "Nachricht"}</p>
                  {kind && meta && (
                    <Link href={sharedHref(r.id)} className="flex items-center gap-3 rounded-xl bg-bg p-2.5 pr-3 transition hover:bg-surface-2">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}><Icon name={meta.icon} className="size-4" /></span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.ref_title || meta.label}</span>
                      <Icon name="arrow" className="size-4 shrink-0 text-muted" />
                    </Link>
                  )}
                  {r.body && <p className="line-clamp-4 whitespace-pre-wrap break-words text-[15px] [overflow-wrap:anywhere]">{r.body}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {kind && <Link href={sharedHref(r.id)} className="btn btn-sm">Öffnen</Link>}
                    <Link href={`${akte}?tab=nachrichten`} className={kind ? "btn-ghost btn-sm" : "btn btn-sm"}>Antworten</Link>
                    {unreadRow && (
                      <form action={markFromCoacheesRead.bind(null, r.id)}>
                        <SubmitButton className="btn-ghost btn-sm text-muted" pendingText="…">Gelesen</SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
