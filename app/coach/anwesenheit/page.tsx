import Link from "next/link";
import { setMailIgnored } from "@/app/actions/anwesenheit";
import { AssignForm, FetchNow, PasteForm } from "@/components/attendance/Forms";
import { Empty, Notice, formatDate, formatDateTime, formatUnits } from "@/components/ui";
import { imapAccount, imapConfigured, type MailRow } from "@/lib/attendance/import";
import { requireCoach } from "@/lib/auth";
import { one, query } from "@/lib/db";

export const metadata = { title: "Anwesenheit" };

type Mail = MailRow & { coachee_name: string | null };

export default async function AttendanceInbox({ searchParams }: PageProps<"/coach/anwesenheit">) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const showIgnored = sp.ignoriert === "1";
  const [open, done, ignored, coachees, state] = await Promise.all([
    query<Mail>("SELECT m.*, NULL AS coachee_name FROM attendance_mails m WHERE m.coach_id = $1 AND m.status = 'offen' ORDER BY (m.parsed->>'held_on') DESC NULLS LAST, (m.parsed->>'starts_at') DESC NULLS LAST, m.received_at DESC", [coach.id]),
    query<Mail>(
      `SELECT m.*, c.first_name || ' ' || c.last_name AS coachee_name FROM attendance_mails m LEFT JOIN coachees c ON c.id = m.coachee_id
        WHERE m.coach_id = $1 AND m.status = 'zugeordnet' ORDER BY (m.parsed->>'held_on') DESC NULLS LAST, (m.parsed->>'starts_at') DESC NULLS LAST, m.received_at DESC LIMIT 30`,
      [coach.id],
    ),
    query<Mail>("SELECT m.*, NULL AS coachee_name FROM attendance_mails m WHERE m.coach_id = $1 AND m.status = 'ignoriert' ORDER BY (m.parsed->>'held_on') DESC NULLS LAST, (m.parsed->>'starts_at') DESC NULLS LAST, m.received_at DESC LIMIT 50", [coach.id]),
    query<{ id: string; name: string; traeger: string | null }>(
      "SELECT id, first_name || ' ' || last_name AS name, traeger FROM coachees WHERE coach_id = $1 AND archived_at IS NULL ORDER BY status = 'aktiv' DESC, last_name, first_name",
      [coach.id],
    ),
    one<{ last_run: string | null; last_ok: string | null; last_error: string | null }>("SELECT last_run, last_ok, last_error FROM mail_import_state WHERE id = 1"),
  ]);
  const options = coachees.map((c) => ({ id: c.id, name: c.name }));
  const configured = imapConfigured();

  const summary = (m: Mail) => {
    const p = m.parsed;
    return [p.name, p.held_on && formatDate(p.held_on), p.starts_at && `${p.starts_at}${p.ends_at ? `–${p.ends_at}` : ""}`, p.units != null && formatUnits(p.units), p.rest_units != null && `Rest ${formatUnits(p.rest_units)}`]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach" className="text-sm text-muted hover:text-ink">← Alle Coachees</Link>
        <h1 className="h1 mt-2">Anwesenheit</h1>
        <p className="text-muted">Bestätigte Termine von Erfolgspfad werden automatisch beim passenden Coachee eingetragen. Was sich nicht eindeutig zuordnen lässt, steht hier.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card space-y-3">
            <h2 className="h2">Nicht zugeordnet {open.length > 0 && <span className="text-muted">({open.length})</span>}</h2>
            {open.length === 0 ? (
              <Empty>Alles zugeordnet.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {open.map((m) => {
                  const incomplete = !m.parsed.held_on || m.parsed.units == null;
                  return (
                    <li key={m.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{m.subject || "(ohne Betreff)"}</p>
                        <p className="text-xs text-muted">{formatDateTime(m.received_at)}</p>
                      </div>
                      <p className="text-sm">{summary(m) || <span className="text-muted">Nichts erkannt</span>}</p>
                      {m.parsed.name && <p className="text-xs text-muted">Kein Coachee eindeutig mit dem Namen „{m.parsed.name}“ gefunden. Bitte den richtigen auswählen.</p>}
                      {incomplete && <Notice tone="error">In dieser Mail fehlen Datum oder Dauer. Trag den Termin bitte direkt in der Akte ein und blende die Mail aus.</Notice>}
                      {!incomplete && <AssignForm mailId={m.id} options={options} />}
                      <div className="flex gap-4 text-xs">
                        <details>
                          <summary className="cursor-pointer text-muted hover:text-ink">Mail anzeigen</summary>
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 font-sans text-xs">{m.body}</pre>
                        </details>
                        <form action={setMailIgnored.bind(null, m.id, true)}><button className="text-muted hover:text-danger">Ausblenden</button></form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="h2">Zuletzt eingetragen</h2>
            {done.length === 0 ? (
              <Empty>Noch keine Mails verarbeitet.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft text-sm">
                {done.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      {m.coachee_id ? <Link href={`/coach/coachees/${m.coachee_id}?tab=anwesenheit`} className="link font-medium">{m.coachee_name}</Link> : <span className="font-medium">–</span>}
                      <span className="text-muted"> · {[m.parsed.held_on && formatDate(m.parsed.held_on), m.parsed.units != null && formatUnits(m.parsed.units), m.parsed.rest_units != null && `Rest ${formatUnits(m.parsed.rest_units)}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-xs text-muted">{m.from_addr === "eingefügt" ? "eingefügt" : "per Mail"} {formatDateTime(m.received_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ignored.length > 0 && (
            <section className="space-y-2">
              <Link href={showIgnored ? "?" : "?ignoriert=1"} className="text-sm text-muted hover:text-ink">{showIgnored ? "Ausgeblendete verbergen" : `${ignored.length} ausgeblendete Mail${ignored.length > 1 ? "s" : ""} anzeigen`}</Link>
              {showIgnored && (
                <ul className="card divide-y divide-line-soft text-sm">
                  {ignored.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span>{m.subject || "(ohne Betreff)"} <span className="text-muted">· {summary(m)}</span></span>
                      <form action={setMailIgnored.bind(null, m.id, false)}><button className="text-xs text-accent hover:underline">Wieder einblenden</button></form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card space-y-3">
            <h2 className="h2">Postfach</h2>
            {configured ? (
              <>
                <p className="text-sm text-muted">
                  {imapAccount()} wird alle 15 Minuten nach Mails von Erfolgspfad durchsucht. Im Postfach selbst ändert sich dabei nichts.
                </p>
                <p className="text-sm">Zuletzt erfolgreich: {formatDateTime(state?.last_ok)}</p>
                {state?.last_error && <Notice tone="error">{state.last_error}</Notice>}
                <FetchNow />
              </>
            ) : (
              <p className="text-sm text-muted">
                Der automatische Abruf ist noch nicht eingerichtet. Dafür in Coolify bei der App <b>IMAP_USER</b> (Mailadresse des Postfachs) und <b>IMAP_PASS</b> (Passwort) eintragen und neu starten.
                Bis dahin kannst du Mails unten einfügen.
              </p>
            )}
          </div>
          <div className="card space-y-3">
            <h2 className="h2">Mail einfügen</h2>
            <p className="text-sm text-muted">Für einzelne Mails, z. B. ältere oder weitergeleitete: Betreff und Text aus Outlook kopieren.</p>
            <PasteForm />
          </div>
        </aside>
      </div>
    </div>
  );
}
