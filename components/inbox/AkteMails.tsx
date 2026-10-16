import Link from "next/link";
import { Empty } from "../ui";
import { query } from "@/lib/db";
import { CATEGORIES, SOURCES, type Category, type Source } from "@/lib/inbox/classify";
import { ago } from "@/lib/inbox/time";

/** Mails von Erfolgspfad und AVOCONS zu diesem Coachee; Details und Korrekturen im Posteingang */
export async function AkteMails({ coacheeId }: { coacheeId: string }) {
  const mails = await query<{ id: string; source: Source; subject: string; received_at: string; category: Category; read_at: string | null; attachments: number }>(
    `SELECT m.id, m.source, m.subject, m.received_at, m.category, m.read_at, (SELECT count(*) FROM inbox_attachments a WHERE a.mail_id = m.id)::int AS attachments
       FROM inbox_mails m WHERE m.coachee_id = $1 ORDER BY m.received_at DESC LIMIT 100`,
    [coacheeId],
  );
  if (!mails.length) return <Empty>Noch keine Mails von Erfolgspfad oder AVOCONS zu diesem Coachee.</Empty>;
  return (
    <section className="card">
      <ul className="divide-y divide-line-soft">
        {mails.map((m) => (
          <li key={m.id}>
            <Link href={`/coach/posteingang?mail=${m.id}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent">
              <span className={`size-2 shrink-0 rounded-full ${m.read_at ? "bg-transparent" : "bg-accent"}`} aria-hidden />
              <span className={`badge shrink-0 ${CATEGORIES[m.category].chip}`}>{CATEGORIES[m.category].label}</span>
              <span className={`min-w-0 flex-1 truncate ${m.read_at ? "" : "font-semibold"}`}>{m.subject || "(ohne Betreff)"}</span>
              {m.attachments > 0 && <span className="hidden text-xs text-muted sm:inline">{m.attachments} Anhang{m.attachments > 1 ? "e" : ""}</span>}
              <span className="shrink-0 text-xs text-muted">{SOURCES[m.source] ?? m.source} · {ago(m.received_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
