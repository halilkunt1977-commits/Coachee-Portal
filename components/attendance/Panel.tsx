import Link from "next/link";
import { deleteAttendance } from "@/app/actions/anwesenheit";
import type { Coachee } from "@/lib/access";
import { SOURCE_LABEL, TRAEGER_LABEL } from "@/lib/attendance/units";
import { query } from "@/lib/db";
import { Empty, Notice, formatDate, formatUnits } from "../ui";
import { AttendanceForm } from "./Forms";

type Row = { id: string; held_on: string; starts_at: string | null; ends_at: string | null; units: number; rest_units: number | null; source: string; note: string; mail_id: string | null };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export async function AttendancePanel({ coachee: c, used }: { coachee: Coachee; used: number }) {
  const [rows, meetingUnits, open] = await Promise.all([
    query<Row>("SELECT id, held_on, starts_at, ends_at, units, rest_units, source, note, mail_id FROM attendance WHERE coachee_id = $1 ORDER BY held_on DESC, starts_at DESC NULLS LAST, created_at DESC", [c.id]),
    query<{ units: number }>("SELECT COALESCE(sum(units), 0) AS units FROM meetings WHERE coachee_id = $1", [c.id]),
    query<{ n: number }>("SELECT count(*)::int AS n FROM attendance_mails WHERE coach_id = $1 AND status = 'offen'", [c.coach_id]),
  ]);
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
        {rows.length === 0 && meetingUnits[0]?.units > 0 && (
          <Notice>Noch keine Anwesenheit erfasst. Bis dahin zählen die {formatUnits(meetingUnits[0].units)} aus den Gesprächen. Ab dem ersten Eintrag hier zählt nur noch die Anwesenheit.</Notice>
        )}
        {rows.length === 0 ? (
          <Empty>
            {c.traeger === "erfolgspfad" ? "Noch keine Anwesenheit. Sobald Erfolgspfad eine Unterschrift meldet, erscheint sie hier automatisch." : "Noch keine Anwesenheit eingetragen."}
          </Empty>
        ) : (
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line-soft">
                  <th className="px-4 py-2.5">Datum</th><th className="px-2 py-2.5">Zeit</th><th className="px-2 py-2.5 text-right">UE</th><th className="px-2 py-2.5 text-right">Rest laut Träger</th><th className="px-2 py-2.5">Quelle</th><th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{formatDate(r.held_on)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted">{r.starts_at ? `${hhmm(r.starts_at)}${r.ends_at ? `–${hhmm(r.ends_at)}` : ""}` : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">{formatUnits(r.units)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted">{r.rest_units != null ? formatUnits(r.rest_units) : "–"}</td>
                    <td className="px-2 py-2">
                      <span className={`badge ${r.source === "erfolgspfad" ? "" : "bg-bg text-muted"}`}>{SOURCE_LABEL[r.source] ?? r.source}</span>
                      {r.note && <span className="ml-2 text-xs text-muted">{r.note}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteAttendance.bind(null, c.id, r.id)}><button className="text-xs text-muted hover:text-danger">Löschen</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
