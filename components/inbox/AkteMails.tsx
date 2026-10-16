import Link from "next/link";
import { Empty } from "../ui";
import { query } from "@/lib/db";
import { CATEGORIES, SOURCES, ownPart, type Category, type Source } from "@/lib/inbox/classify";
import { ago } from "@/lib/inbox/time";

/** Mails von Erfolgspfad und AVOCONS zu diesem Coachee; Details und Korrekturen im Posteingang */
export async function AkteMails({ coacheeId }: { coacheeId: string }) {
  const mails = await query<{ id: string; source: Source; subject: string; received_at: string; category: Category; read_at: string | null; attachments: number; direction: string; body: string }>(
    `SELECT m.id, m.direction, m.source, m.subject, m.received_at, m.category, m.read_at, left(m.body, 8000) AS body,
            (SELECT count(*) FROM inbox_attachments a WHERE a.mail_id = m.id)::int AS attachments
       FROM inbox_mails m WHERE m.coachee_id = $1 ORDER BY m.received_at DESC LIMIT 100`,
    [coacheeId],
  );
  if (!mails.length) return <Empty>Noch keine Mails von Erfolgspfad oder AVOCONS zu diesem Coachee.</Empty>;
  return (
    <section className="card">
      <p className="mb-2 text-xs text-muted">Alle Mails mit AVOCONS und Erfolgspfad zu diesem Coachee, auch die von dir gesendeten. Antippen zeigt den Text.</p>
      <ul className="divide-y divide-line-soft">
        {mails.map((m) => {
          const out = m.direction === "out";
          return (
            <li key={m.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 transition hover:text-accent">
                  <span className={`size-2 shrink-0 rounded-full ${m.read_at ? "bg-transparent" : "bg-accent"}`} aria-hidden />
                  <span className={`badge shrink-0 ${out ? "bg-surface-2 text-muted" : CATEGORIES[m.category].chip}`}>{out ? "Von dir gesendet" : CATEGORIES[m.category].label}</span>
                  <span className={`min-w-0 flex-1 truncate ${m.read_at ? "" : "font-semibold"}`}>{m.subject || "(ohne Betreff)"}</span>
                  {m.attachments > 0 && <span className="hidden text-xs text-muted sm:inline">{m.attachments} Anhang{m.attachments > 1 ? "e" : ""}</span>}
                  <span className="shrink-0 text-xs text-muted">{out ? "an " : ""}{SOURCES[m.source] ?? m.source} · {ago(m.received_at)}</span>
                </summary>
                <div className="mb-3 space-y-2 rounded-xl bg-bg p-3 text-sm">
                  <p className="whitespace-pre-line break-words">{ownPart(m.body).trim()}</p>
                  {!out && <Link href={`/coach/posteingang?mail=${m.id}`} className="link text-xs">Im Posteingang öffnen</Link>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
