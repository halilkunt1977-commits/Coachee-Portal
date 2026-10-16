import Link from "next/link";
import { deleteAttendance } from "@/app/actions/anwesenheit";
import type { Coachee } from "@/lib/access";
import { nameKey } from "@/lib/attendance/parse";
import { SOURCE_LABEL, TRAEGER_LABEL } from "@/lib/attendance/units";
import { query } from "@/lib/db";
import { Empty, Notice, formatDate, formatDateTime, formatUnits } from "../ui";
import { AttendanceForm, EditEntry, MoveEntry } from "./Forms";

type Row = {
  id: string; held_on: string; starts_at: string | null; ends_at: string | null; units: number; rest_units: number | null; source: string; note: string; mail_id: string | null;
  subject: string | null; from_addr: string | null; received_at: string | null; body: string | null; mail_name: string | null;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * Hinweise auf falsche Zuordnung: Name in der Mail passt nicht zum Coachee, der Rest laut Träger passt nicht zum
 * vorherigen Termin (vorheriger Rest minus UE), oder derselbe Termin steht doppelt da.
 */
function entryFlags(rows: Row[], coacheeName: string) {
  const own = nameKey(coacheeName);
  const out = new Map<string, { otherName: string | null; restJump: number | null; duplicate: boolean }>();
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.held_on}|${hhmm(r.starts_at)}|${r.units}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const chrono = [...rows].reverse();
  let prevRest: number | null = null;
  for (const r of chrono) {
    let restJump: number | null = null;
    if (r.rest_units != null) {
      const expected = prevRest != null ? Math.round((prevRest - r.units) * 100) / 100 : null;
      if (expected != null && Math.abs(expected - r.rest_units) >= 0.05) restJump = expected;
      prevRest = r.rest_units;
    }
    out.set(r.id, {
      otherName: r.mail_name && nameKey(r.mail_name) !== own ? r.mail_name : null,
      restJump,
      duplicate: (seen.get(`${r.held_on}|${hhmm(r.starts_at)}|${r.units}`) ?? 0) > 1,
    });
  }
  return out;
}

export async function AttendancePanel({ coachee: c, used }: { coachee: Coachee; used: number }) {
  const [rows, meetingUnits, open, coachees] = await Promise.all([
    query<Row>(
      `SELECT a.id, a.held_on, a.starts_at, a.ends_at, a.units, a.rest_units, a.source, a.note, a.mail_id,
              m.subject, m.from_addr, m.received_at, m.body, m.parsed->>'name' AS mail_name
         FROM attendance a LEFT JOIN attendance_mails m ON m.id = a.mail_id
        WHERE a.coachee_id = $1 ORDER BY a.held_on DESC, a.starts_at DESC NULLS LAST, a.created_at DESC`,
      [c.id],
    ),
    query<{ units: number }>("SELECT COALESCE(sum(units), 0) AS units FROM meetings WHERE coachee_id = $1", [c.id]),
    query<{ n: number }>("SELECT count(*)::int AS n FROM attendance_mails WHERE coach_id = $1 AND status = 'offen'", [c.coach_id]),
    query<{ id: string; name: string }>("SELECT id, first_name || ' ' || last_name AS name FROM coachees WHERE coach_id = $1 AND archived_at IS NULL ORDER BY status = 'aktiv' DESC, last_name, first_name", [c.coach_id]),
  ]);
  const others = coachees;
  const flags = entryFlags(rows, `${c.first_name} ${c.last_name}`);
  const wrong = rows.filter((r) => flags.get(r.id)?.otherName).length;
  const open1 = rows.find((r) => flags.get(r.id)?.otherName)?.id ?? null;
  // Letzte Meldung des Trägers; bei mehreren am selben Termin zählt der kleinste Rest
  const withRest = rows.filter((r) => r.rest_units != null);
  const top = withRest[0];
  const latestRest = top ? Math.min(...withRest.filter((r) => r.held_on === top.held_on && r.starts_at === top.starts_at).map((r) => r.rest_units!)) : null;
  const ownRest = c.units_total != null ? Math.round((c.units_total - used) * 100) / 100 : null;
  const mismatch = latestRest != null && ownRest != null && Math.abs(latestRest - ownRest) >= 0.05;
  const tiles = [
    { label: "Bewilligt", value: c.units_total != null ? formatUnits(c.units_total) : "–", sub: c.units_total == null ? "in den Stammdaten eintragen" : undefined },
    { label: "Genutzt", value: formatUnits(used), sub: `${rows.length} Termin${rows.length === 1 ? "" : "e"}` },
    { label: "Rest (gerechnet)", value: ownRest != null ? formatUnits(ownRest) : "–", warn: ownRest != null && ownRest < 0 },
    { label: "Rest laut Träger", value: latestRest != null ? formatUnits(latestRest) : "–", sub: latestRest != null ? "aus der letzten Meldung" : "noch keine Meldung", warn: mismatch },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4 sm:p-4">
              <p className="text-xs text-muted">{t.label}</p>
              <p className={`text-xl font-bold tabular-nums ${t.warn ? "text-danger" : ""}`}>{t.value}</p>
              {t.sub && <p className="text-xs text-muted">{t.sub}</p>}
            </div>
          ))}
        </div>
        {mismatch && (
          <Notice tone="error">
            Laut Träger sind noch {formatUnits(latestRest)} offen, gerechnet sind es {formatUnits(ownRest)}. Entweder fehlt hier ein Termin, oder die bewilligten UE in den Stammdaten stimmen nicht.
          </Notice>
        )}
        {wrong > 0 && (
          <Notice tone="error">
            {wrong === 1 ? "Ein Termin stammt" : `${wrong} Termine stammen`} aus einer Mail für einen anderen Namen. Klick auf den rot markierten Termin, dort siehst du die Mail und kannst ihn dem richtigen Coachee geben oder entfernen.
          </Notice>
        )}
        {rows.length === 0 && meetingUnits[0]?.units > 0 && (
          <Notice>Noch keine Anwesenheit erfasst. Bis dahin zählen die {formatUnits(meetingUnits[0].units)} aus den Gesprächen. Ab dem ersten Eintrag hier zählt nur noch die Anwesenheit.</Notice>
        )}
        {rows.length === 0 ? (
          <Empty>
            {c.traeger === "erfolgspfad" ? "Noch keine Anwesenheit. Sobald Erfolgspfad eine Unterschrift meldet, erscheint sie hier automatisch." : "Noch keine Anwesenheit eingetragen."}
          </Empty>
        ) : (
          <div className="card divide-y divide-line-soft p-0 sm:p-0">
            <div className="hidden grid-cols-[110px_110px_80px_1fr_auto] gap-2 px-4 py-2.5 text-xs font-semibold text-muted sm:grid">
              <span>Datum</span><span>Zeit</span><span className="text-right">UE</span><span className="pl-6">Rest laut Träger · Quelle</span><span />
            </div>
            {rows.map((r) => {
              const f = flags.get(r.id)!;
              return (
                <details key={r.id} className="group" open={open1 === r.id}>
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm hover:bg-bg/60 sm:grid-cols-[110px_110px_80px_1fr_auto] [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">{formatDate(r.held_on)}</span>
                    <span className="text-muted sm:order-none">{r.starts_at ? `${hhmm(r.starts_at)}${r.ends_at ? `–${hhmm(r.ends_at)}` : ""}` : "–"}</span>
                    <span className="font-semibold tabular-nums sm:text-right">{formatUnits(r.units)}</span>
                    <span className="flex flex-wrap items-center gap-1.5 sm:pl-6">
                      <span className="tabular-nums text-muted">{r.rest_units != null ? formatUnits(r.rest_units) : "–"}</span>
                      <span className={`badge ${r.source === "erfolgspfad" ? "" : "bg-bg text-muted"}`}>{SOURCE_LABEL[r.source] ?? r.source}</span>
                      {f.otherName && <span className="badge bg-[#f8e6e3] text-danger" title="Name in der Mail">Mail für {f.otherName}</span>}
                      {f.restJump && <span className="badge bg-[#fbf1e3] text-gold" title={`Erwartet ${formatUnits(f.restJump)} nach dem vorherigen Termin`}>Rest passt nicht</span>}
                      {f.duplicate && <span className="badge bg-[#fbf1e3] text-gold">doppelt?</span>}
                      {r.note && <span className="text-xs text-muted">{r.note}</span>}
                    </span>
                    <span className="text-right text-xs text-accent"><span className="group-open:hidden">Details</span><span className="hidden group-open:inline">Schließen</span></span>
                  </summary>
                  <div className="space-y-4 border-t border-line-soft bg-bg/40 px-4 py-4">
                    {r.mail_id ? (
                      <div className="rounded-xl border border-line-soft bg-surface p-3 text-sm">
                        <p className="font-semibold">{r.subject || "(ohne Betreff)"}</p>
                        <p className="text-xs text-muted">{r.from_addr === "eingefügt" ? "Von Hand eingefügt" : r.from_addr} · {formatDateTime(r.received_at)}{r.mail_name ? ` · Name in der Mail: ${r.mail_name}` : ""}</p>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs">{(r.body ?? "").trim()}</pre>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Selbst eingetragen, ohne Mail.</p>
                    )}
                    <EditEntry coacheeId={c.id} e={r} />
                    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line-soft pt-3">
                      <MoveEntry coacheeId={c.id} id={r.id} options={others} />
                      <div className="flex flex-wrap gap-4 pt-1.5 text-sm">
                        <form action={deleteAttendance.bind(null, c.id, r.id, false)}>
                          <button className="text-muted hover:text-danger" title={r.mail_id ? "Die Mail kommt zurück in die Liste zum Zuordnen" : undefined}>{r.mail_id ? "Hier entfernen" : "Löschen"}</button>
                        </form>
                        {r.mail_id && (
                          <form action={deleteAttendance.bind(null, c.id, r.id, true)}><button className="text-muted hover:text-danger">Löschen und Mail ausblenden</button></form>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="card space-y-3">
          <h2 className="h2">Termin eintragen</h2>
          <p className="text-sm text-muted">
            Träger: {c.traeger ? TRAEGER_LABEL[c.traeger] : <>noch nicht festgelegt, siehe <Link href="?tab=stammdaten" className="link">Stammdaten</Link></>}.
            {c.traeger === "erfolgspfad" && " Termine kommen automatisch per Mail, hier nur Ausnahmen nachtragen."}
          </p>
          <AttendanceForm coacheeId={c.id} avocons={c.traeger === "avocons"} />
        </div>
        {(open[0]?.n ?? 0) > 0 && (
          <Link href="/coach/anwesenheit" className="card block text-sm hover:border-accent">
            <span className="font-semibold text-gold">{open[0].n} Anwesenheits-Mail{open[0].n > 1 ? "s" : ""}</span> konnte{open[0].n > 1 ? "n" : ""} keinem Coachee zugeordnet werden. Zuordnen →
          </Link>
        )}
      </aside>
    </div>
  );
}
