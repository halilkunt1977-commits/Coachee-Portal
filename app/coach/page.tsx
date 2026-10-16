import Link from "next/link";
import { Empty, formatDate, formatUnits } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { fullName, statusLabel, typeLabel, type Coachee } from "@/lib/access";
import { query } from "@/lib/db";
import { unitsUsedSql } from "@/lib/attendance/units";

export const metadata = { title: "Coachees" };

type Row = Coachee & { units_used: number; open_tasks: number; last_meeting: string | null; unread: number; has_login: boolean };

export default async function CoachHome({ searchParams }: PageProps<"/coach">) {
  const user = await requireCoach();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const typ = sp.typ === "job" || sp.typ === "gruendung" ? sp.typ : "";
  const status = sp.status === "abgeschlossen" || sp.status === "pausiert" || sp.status === "alle" ? sp.status : "aktiv";

  const rows = await query<Row>(
    `SELECT c.*,
            ${unitsUsedSql("c.id")} AS units_used,
            (SELECT count(*) FROM tasks t WHERE t.coachee_id = c.id AND t.done_at IS NULL)::int AS open_tasks,
            (SELECT max(held_on) FROM meetings m WHERE m.coachee_id = c.id) AS last_meeting,
            (SELECT count(*) FROM messages x WHERE x.coachee_id = c.id AND x.read_at IS NULL AND x.author_id IS DISTINCT FROM $1)::int AS unread,
            (u.password_hash IS NOT NULL) AS has_login
       FROM coachees c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.coach_id = $1
        AND ($2 = '' OR (c.first_name || ' ' || c.last_name || ' ' || c.email) ILIKE '%' || $2 || '%')
        AND ($3 = '' OR c.coaching_type = $3)
        AND ($4 = 'alle' OR c.status = $4)
      ORDER BY c.status = 'aktiv' DESC, c.last_name, c.first_name`,
    [user.id, q, typ, status],
  );

  const openMails = (await query<{ n: number }>("SELECT count(*)::int AS n FROM attendance_mails WHERE coach_id = $1 AND status = 'offen'", [user.id]))[0]?.n ?? 0;

  const filterLink = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(typ && { typ }), status, ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/coach?${p}`;
  };
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm font-medium ${active ? "bg-accent text-white" : "bg-surface text-muted hover:text-ink border border-line-soft"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Coachees</h1>
          <p className="text-muted">{rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}</p>
        </div>
        <Link href="/coach/neu" className="btn">+ Neuer Coachee</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="mr-2"><input name="q" defaultValue={q} placeholder="Name oder E-Mail suchen" className="input w-64" />{typ && <input type="hidden" name="typ" value={typ} />}<input type="hidden" name="status" value={status} /></form>
        <Link href={filterLink({ typ: "" })} className={chip(!typ)}>Alle</Link>
        <Link href={filterLink({ typ: "job" })} className={chip(typ === "job")}>Jobcoaching</Link>
        <Link href={filterLink({ typ: "gruendung" })} className={chip(typ === "gruendung")}>Gründungscoaching</Link>
        <span className="mx-1 h-5 w-px bg-line" />
        {(["aktiv", "pausiert", "abgeschlossen", "alle"] as const).map((s) => (
          <Link key={s} href={filterLink({ status: s })} className={chip(status === s)}>{s === "alle" ? "Alle Status" : statusLabel[s]}</Link>
        ))}
      </div>

      {openMails > 0 && (
        <Link href="/coach/anwesenheit" className="block rounded-xl bg-[#fbf1e3] px-4 py-3 text-sm text-gold hover:underline">
          {openMails} Anwesenheits-Mail{openMails > 1 ? "s" : ""} von Erfolgspfad konnte{openMails > 1 ? "n" : ""} keinem Coachee zugeordnet werden. Jetzt zuordnen →
        </Link>
      )}

      {rows.length === 0 ? (
        <Empty>Noch keine Coachees in dieser Auswahl. Lege mit „Neuer Coachee“ den ersten an.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.id} href={`/coach/coachees/${c.id}`} className="card block transition hover:border-accent">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{fullName(c)}</p>
                  <p className="text-sm text-muted">{typeLabel[c.coaching_type]}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.status !== "aktiv" && <span className="badge bg-bg text-muted">{statusLabel[c.status]}</span>}
                  {!c.has_login && <span className="badge bg-[#fbf1e3] text-gold">Einladung offen</span>}
                  {c.unread > 0 && <span className="badge">{c.unread} neue Nachricht{c.unread > 1 ? "en" : ""}</span>}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs text-muted">
                <div><dt>Stunden</dt><dd className="text-sm font-semibold text-ink">{formatUnits(c.units_used)}{c.units_total ? ` / ${c.units_total}` : ""}</dd></div>
                <div><dt>Offene Aufgaben</dt><dd className="text-sm font-semibold text-ink">{c.open_tasks}</dd></div>
                <div><dt>Letztes Gespräch</dt><dd className="text-sm font-semibold text-ink">{formatDate(c.last_meeting)}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
