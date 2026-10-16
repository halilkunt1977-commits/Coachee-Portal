import Link from "next/link";
import { markAllRead, markMailUnread, setMailCategory, setMailCoachee, toggleMailDone, attachmentToDocuments } from "@/app/actions/postfach";
import { FetchNow } from "@/components/attendance/Forms";
import { Avatar, PageHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { Empty, Notice, formatDateTime } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { imapConfigured } from "@/lib/attendance/import";
import { dayMedium } from "@/lib/calendar/dates";
import { query, one } from "@/lib/db";
import { CATEGORIES, SOURCES, isCategory, ownPart, type Category, type Source } from "@/lib/inbox/classify";
import type { Applied, Parsed } from "@/lib/inbox/ingest";
import { ago } from "@/lib/inbox/time";

export const metadata = { title: "Posteingang" };

type Row = {
  id: string;
  source: Source;
  from_addr: string;
  from_name: string;
  subject: string;
  received_at: string;
  category: Category;
  coachee_id: string | null;
  coachee_name: string | null;
  read_at: string | null;
  done_at: string | null;
  attachments: number;
  snippet: string;
};

type Detail = Row & { body: string; parsed: Parsed; applied: Applied; category_by: string };

const str = (v: unknown) => (typeof v === "string" ? v : null);

export default async function Inbox({ searchParams }: PageProps<"/coach/posteingang">) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const art = str(sp.art);
  const quelle = str(sp.quelle);
  const selectedId = str(sp.mail);
  const filters: string[] = ["m.coach_id = $1", "m.direction = 'in'"];
  if (art === "neu") filters.push("m.read_at IS NULL");
  else if (art === "offen") filters.push("m.done_at IS NULL");
  else if (art && isCategory(art)) filters.push(`m.category = '${art}'`);
  if (quelle === "avocons" || quelle === "erfolgspfad") filters.push(`m.source = '${quelle}'`);

  const [rows, counts, coachees] = await Promise.all([
    query<Row>(
      `SELECT m.id, m.source, m.from_addr, m.from_name, m.subject, m.received_at, m.category, m.coachee_id, m.read_at, m.done_at,
              c.first_name || ' ' || c.last_name AS coachee_name, left(regexp_replace(m.body, '\\s+', ' ', 'g'), 160) AS snippet,
              (SELECT count(*) FROM inbox_attachments a WHERE a.mail_id = m.id)::int AS attachments
         FROM inbox_mails m LEFT JOIN coachees c ON c.id = m.coachee_id
        WHERE ${filters.join(" AND ")} ORDER BY m.received_at DESC LIMIT 200`,
      [coach.id],
    ),
    query<{ category: Category; total: number; unread: number }>(
      "SELECT category, count(*)::int AS total, count(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM inbox_mails WHERE coach_id = $1 AND direction = 'in' GROUP BY category",
      [coach.id],
    ),
    query<{ id: string; name: string }>("SELECT id, first_name || ' ' || last_name AS name FROM coachees WHERE coach_id = $1 AND archived_at IS NULL ORDER BY first_name, last_name", [coach.id]),
  ]);

  let mail: Detail | null = null;
  if (selectedId && /^[0-9a-f-]{36}$/i.test(selectedId)) {
    mail = await one<Detail>(
      `SELECT m.*, c.first_name || ' ' || c.last_name AS coachee_name, '' AS snippet, 0 AS attachments
         FROM inbox_mails m LEFT JOIN coachees c ON c.id = m.coachee_id WHERE m.id = $1 AND m.coach_id = $2`,
      [selectedId, coach.id],
    );
    // Öffnen heißt gelesen
    if (mail && !mail.read_at) await query("UPDATE inbox_mails SET read_at = now() WHERE id = $1", [mail.id]);
  }
  const unread = counts.reduce((s, c) => s + c.unread, 0);
  const total = counts.reduce((s, c) => s + c.total, 0);
  const href = (p: Record<string, string | null | undefined>) => {
    const q = new URLSearchParams(Object.entries({ art, quelle, ...p }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/coach/posteingang${q.size ? `?${q}` : ""}`;
  };
  const chip = (key: string | null, label: string, n?: number, dot?: string) => (
    <Link key={key ?? "alle"} href={href({ art: key, mail: null })} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${art === key ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-accent/40 hover:text-accent"}`}>
      {dot && <span className={`size-2 rounded-full ${dot}`} />}
      {label}
      {n ? <span className={`rounded-full px-1.5 text-[11px] ${art === key ? "bg-white/20" : "bg-danger text-white"}`}>{n}</span> : null}
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Bildungsträger"
        title="Posteingang"
        description="Das Portal liest alle Mails von AVOCONS und Erfolgspfad und erledigt sie selbst: Buchungen in die Kalender, Verträge und Berichte in die Akte, neue Coachees werden angelegt, Anfragen landen unter „Anfragen“. Hier siehst du, was passiert ist."
        actions={
          <>
            {unread > 0 && (
              <form action={markAllRead}>
                <button className="btn-ghost btn-sm !py-2">Alle gelesen</button>
              </form>
            )}
            {imapConfigured() && <FetchNow />}
          </>
        }
      />
      {!imapConfigured() && <div className="mb-4"><Notice tone="error">Der Postfach-Abruf ist nicht eingerichtet: In Coolify fehlen IMAP_USER und IMAP_PASS.</Notice></div>}

      <nav className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Art">
        {chip(null, "Alle", undefined)}
        {chip("neu", "Ungelesen", unread)}
        {chip("offen", "Nicht erledigt")}
        {(Object.keys(CATEGORIES) as Category[]).map((k) => {
          const c = counts.find((x) => x.category === k);
          return c?.total ? chip(k, CATEGORIES[k].plural, c.unread, CATEGORIES[k].dot) : null;
        })}
      </nav>
      <nav className="mb-5 flex gap-1 text-sm" aria-label="Absender">
        {([null, "avocons", "erfolgspfad"] as const).map((q) => (
          <Link key={q ?? "alle"} href={href({ quelle: q, mail: null })} className={`rounded-lg px-3 py-1 font-semibold transition ${quelle === q ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-ink"}`}>
            {q ? SOURCES[q] : "Alle Absender"}
          </Link>
        ))}
      </nav>

      {total === 0 ? (
        <Empty>Noch keine Mails von AVOCONS oder Erfolgspfad abgerufen. Der Abruf läuft alle 15 Minuten, oder oben „Postfach jetzt abrufen“.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr]">
          <ul className={`card divide-y divide-line-soft self-start overflow-hidden !p-0 ${mail ? "order-2 xl:order-none" : ""}`}>
            {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Keine Mails in dieser Auswahl.</li>}
            {rows.map((r) => {
              const unreadRow = !r.read_at && r.id !== mail?.id;
              return (
                <li key={r.id}>
                  <Link href={href({ mail: r.id })} scroll={false} className={`flex gap-3 px-4 py-3 transition hover:bg-surface-2 ${r.id === mail?.id ? "bg-tint/60" : ""} ${r.done_at ? "opacity-60" : ""}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${unreadRow ? "bg-accent-2" : "bg-transparent"}`} />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-sm ${unreadRow ? "font-bold" : "font-medium"}`}>{r.from_name || SOURCES[r.source]}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(r.received_at)}</span>
                      </span>
                      <span className={`block truncate text-sm ${unreadRow ? "font-semibold" : ""}`}>{r.subject || "(ohne Betreff)"}</span>
                      <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className={`rounded-full border px-2 py-px text-[10.5px] font-semibold ${CATEGORIES[r.category].chip}`}>{CATEGORIES[r.category].label}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-px text-[10.5px] font-semibold text-muted">{SOURCES[r.source]}</span>
                        {r.coachee_name && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Avatar name={r.coachee_name} size="size-4" className="!text-[6px]" />{r.coachee_name}</span>}
                        {r.attachments > 0 && <span className="text-[11px] text-muted">📎 {r.attachments}</span>}
                        {r.done_at && <span className="text-[11px] font-semibold text-ok">✓ erledigt</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="min-w-0">
            {mail ? <MailDetail m={mail} coachees={coachees} close={href({ mail: null })} /> : (
              <div className="hidden h-full min-h-64 place-items-center rounded-[20px] border border-dashed border-line text-sm text-muted xl:grid">Mail links auswählen</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

async function MailDetail({ m, coachees, close }: { m: Detail; coachees: { id: string; name: string }[]; close: string }) {
  const [attachments, appts, lead] = await Promise.all([
    query<{ id: string; name: string; size: number; document_id: string | null }>("SELECT id, name, size, document_id FROM inbox_attachments WHERE mail_id = $1 ORDER BY name", [m.id]),
    m.applied.appointments?.length
      ? query<{ id: string; day: string; start: string; end: string; status: string }>(
          `SELECT id, status, to_char(starts_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, to_char(starts_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS start,
                  to_char(ends_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI') AS "end" FROM appointments WHERE id = ANY($1) ORDER BY starts_at`,
          [[...m.applied.appointments, ...(m.applied.cancelled ?? [])]],
        )
      : [],
    m.applied.lead ? one<{ id: string; first_name: string; last_name: string; status: string }>("SELECT id, first_name, last_name, status FROM leads WHERE id = $1", [m.applied.lead]) : null,
  ]);
  const own = ownPart(m.body);
  const quoted = m.body.replace(/\r/g, "").length > own.length + 40 ? m.body.replace(/\r/g, "").slice(own.length) : "";
  const cat = CATEGORIES[m.category];
  const reply = `mailto:${m.from_addr}?subject=${encodeURIComponent(/^(re|aw):/i.test(m.subject) ? m.subject : `AW: ${m.subject}`)}`;

  return (
    <article className="card rise relative space-y-5">
      <Link href={close} scroll={false} aria-label="Schließen" className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"><Icon name="close" className="size-4" /></Link>
      <header className="space-y-2 pr-8">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cat.chip}`}>{cat.label}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{SOURCES[m.source]}</span>
          {m.category_by === "auto" && <span className="text-[11px] text-muted">automatisch erkannt</span>}
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-snug tracking-tight">{m.subject || "(ohne Betreff)"}</h2>
        <p className="text-sm text-muted">{m.from_name ? `${m.from_name} · ` : ""}{m.from_addr} · {formatDateTime(m.received_at)}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <form action={setMailCategory.bind(null, m.id)} className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="label !text-xs">Art</span>
            <select name="category" defaultValue={m.category} className="input !py-2 !text-sm">
              {(Object.keys(CATEGORIES) as Category[]).map((k) => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
            </select>
          </label>
          <button className="btn-ghost btn-sm !py-2.5">Ändern</button>
        </form>
        <form action={setMailCoachee.bind(null, m.id)} className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="label !text-xs">Coachee</span>
            <select name="coachee_id" defaultValue={m.coachee_id ?? ""} className="input !py-2 !text-sm">
              <option value="">Keinem zugeordnet</option>
              {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn-ghost btn-sm !py-2.5">Zuordnen</button>
        </form>
      </div>

      <ActionBox m={m} appts={appts} lead={lead} attachments={attachments} suggest={m.coachee_id ? undefined : coachees.find((c) => c.id === m.applied.suggest)} />

      {attachments.length > 0 && (
        <section className="space-y-2">
          <p className="eyebrow">Anhänge</p>
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface-2/60 px-3 py-2 text-sm">
                <Icon name="doc" className="size-4 text-muted" />
                <a href={`/api/postfach/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-accent">{a.name}</a>
                <span className="text-xs text-muted">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                {a.document_id ? (
                  <Link href={`/coach/coachees/${m.coachee_id}?tab=dokumente`} className="text-xs font-semibold text-ok">✓ in Dokumenten</Link>
                ) : m.coachee_id ? (
                  <form action={attachmentToDocuments.bind(null, a.id)}><button className="text-xs font-semibold text-accent hover:underline">In Dokumente legen</button></form>
                ) : (
                  <span className="text-xs text-muted">erst Coachee zuordnen</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line-soft bg-surface-2/40 p-4">
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{own.trim() || "(kein Text)"}</p>
        {quoted.trim() && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-accent">Früherer Verlauf anzeigen</summary>
            <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-line pl-3 text-muted">{quoted.trim()}</p>
          </details>
        )}
      </section>

      <footer className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        <a href={reply} className="btn btn-sm"><Icon name="mail" className="size-3.5" /> Antworten</a>
        <form action={toggleMailDone.bind(null, m.id)}><button className="btn-ghost btn-sm">{m.done_at ? "Wieder offen" : "✓ Erledigt"}</button></form>
        <form action={markMailUnread.bind(null, m.id)}><button className="btn-ghost btn-sm">Ungelesen</button></form>
      </footer>
    </article>
  );
}

function ActionBox({ m, appts, lead, attachments, suggest }: { m: Detail; appts: { id: string; day: string; start: string; end: string; status: string }[]; lead: { id: string; first_name: string; last_name: string; status: string } | null; attachments: { document_id: string | null }[]; suggest?: { id: string; name: string } }) {
  const box = "rounded-2xl border p-4 space-y-2";
  if (m.category === "buerobuchung") {
    const found = m.parsed.bookings ?? [];
    return (
      <section className={`${box} border-gold/30 bg-gold-soft/50`}>
        <p className="font-semibold">Bürobuchung</p>
        {appts.length > 0 ? (
          <>
            <p className="text-sm">{m.coachee_id ? `Im Kalender von dir und ${m.coachee_name}:` : "In deinem Kalender eingetragen. Die Mail nennt keinen Coachee; nach dem Zuordnen steht der Termin auch in seinem Kalender:"}</p>
            <ul className="space-y-1 text-sm">
              {appts.map((a) => (
                <li key={a.id}>
                  <Link href={`/coach/kalender?datum=${a.day}&termin=${a.id}`} className={`link ${a.status === "abgesagt" ? "line-through" : ""}`}>
                    {a.status === "abgesagt" ? "✕" : "✓"} {dayMedium(a.day)}, {a.start}–{a.end} Uhr
                  </Link>
                  {a.status === "abgesagt" && <span className="text-muted"> abgesagt</span>}
                </li>
              ))}
            </ul>
            {suggest && (
              <form action={setMailCoachee.bind(null, m.id)} className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                <input type="hidden" name="coachee_id" value={suggest.id} />
                <span>Vermutlich für <strong>{suggest.name}</strong> (eine frühere Mail nennt dasselbe Datum).</span>
                <button className="btn btn-sm">{suggest.name} zuordnen</button>
              </form>
            )}
          </>
        ) : found.length > 0 ? (
          <p className="text-sm">Erkannt: {found.map((b) => `${dayMedium(b.day)} ${b.start}${b.end ? `–${b.end}` : ""}`).join(", ")}. {m.coachee_id ? "" : "Ordne oben den Coachee zu, dann landet der Termin automatisch in beiden Kalendern."}</p>
        ) : (
          <p className="text-sm">Datum und Uhrzeit waren nicht eindeutig. <Link href={`/coach/kalender?neu=1${m.coachee_id ? `&coachee=${m.coachee_id}` : ""}`} className="link">Termin selbst anlegen</Link></p>
        )}
      </section>
    );
  }
  if (m.category === "anfrage") {
    const c = m.parsed.contact;
    return (
      <section className={`${box} border-danger/20 bg-danger-soft/60`}>
        <p className="font-semibold text-danger">Neue Anfrage: schnell melden</p>
        {c && (c.phone || c.email) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {c.phone && <a href={`tel:${c.phone}`} className="btn btn-sm">📞 {c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn-ghost btn-sm">✉️ {c.email}</a>}
          </div>
        )}
        {lead ? (
          <p className="text-sm"><Link href={`/coach/anfragen?anfrage=${lead.id}`} className="link">Zur Anfrage von {lead.first_name} {lead.last_name}</Link> · Stand: {lead.status}</p>
        ) : m.coachee_id ? (
          <p className="text-sm">Gehört zu einem bestehenden Coachee.</p>
        ) : null}
      </section>
    );
  }
  if (m.category === "projektvertrag" || m.category === "coachbericht") {
    const placed = attachments.filter((a) => a.document_id).length;
    return (
      <section className={`${box} ${m.category === "coachbericht" ? "border-[#5b5fc7]/25 bg-[#eef0ff]/70" : "border-accent/20 bg-tint/60"}`}>
        <p className="font-semibold">{m.category === "coachbericht" ? "Coachingstart und Bericht zum Unterschreiben" : "Projektvertrag"}</p>
        {!m.coachee_id && lead ? (
          <p className="text-sm">
            {lead.first_name} {lead.last_name} ist noch kein Coachee.{" "}
            {lead.status === "gewonnen" ? null : <Link href={`/coach/neu?anfrage=${lead.id}`} className="link font-semibold">Jetzt als Coachee anlegen.</Link>}
            {attachments.length > 0 && " Danach liegen die Anhänge automatisch in den Dokumenten."}
          </p>
        ) : !attachments.length ? (
          <p className="text-sm">Die Mail hat keinen Anhang.</p>
        ) : placed && m.coachee_id ? (
          <p className="text-sm">{placed} Datei{placed > 1 ? "en" : ""} liegt in den <Link href={`/coach/coachees/${m.coachee_id}?tab=dokumente`} className="link">Dokumenten von {m.coachee_name}</Link>{m.category === "coachbericht" ? ", markiert mit „Unterschrift fehlt“." : "."}</p>
        ) : (
          <p className="text-sm">Ordne oben den Coachee zu, dann wandern die Anhänge in seine Dokumente.</p>
        )}
      </section>
    );
  }
  if (m.category === "anwesenheit") {
    return (
      <section className={`${box} border-ok/20 bg-ok-soft/60`}>
        <p className="text-sm">Anwesenheiten trägt das Portal automatisch beim Coachee ein. <Link href="/coach/anwesenheit" className="link">Zur Anwesenheit</Link></p>
      </section>
    );
  }
  return null;
}
