import Link from "next/link";
import { deleteDocument } from "@/app/actions/dokumente";
import type { Coachee } from "@/lib/access";
import { DOC_CATEGORIES, compareWithPortal, isReport, reportTotal, type ReportRow } from "@/lib/documents";
import { query } from "@/lib/db";
import { PARSER_VERSION, reparseDocument } from "@/lib/documents-text";
import { ConfirmButton } from "../ConfirmButton";
import { Empty, Notice, formatDate, formatUnits } from "../ui";
import { EditDocument, ImportRows, UploadForm } from "./Forms";

type Doc = { id: string; file_id: string; category: string; title: string; shared: boolean; extracted: ReportRow[] | null; has_text: boolean; extracted_text: string | null; name: string; size: number; created_at: string };
type Att = { id: string; held_on: string; units: number; starts_at: string | null };

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const time = (r: { starts_at: string | null; ends_at?: string | null }) => (r.starts_at ? ` ${r.starts_at.slice(0, 5)}${r.ends_at ? `–${r.ends_at.slice(0, 5)}` : ""}` : "");

export async function DocumentsPanel({ coachee: c }: { coachee: Coachee }) {
  // Mit älterer Erkennung gelesene Dokumente einmal neu auslesen
  const stale = await query<{ id: string; file_id: string; category: string; name: string }>(
    "SELECT d.id, d.file_id, d.category, f.name FROM documents d JOIN files f ON f.id = d.file_id WHERE d.coachee_id = $1 AND d.parser_version < $2",
    [c.id, PARSER_VERSION],
  );
  for (const d of stale) await reparseDocument(d);
  const [docs, attendance] = await Promise.all([
    query<Doc>(
      `SELECT d.id, d.file_id, d.category, d.title, d.shared, d.extracted, d.extracted_text IS NOT NULL AS has_text, CASE WHEN d.category IN ('anwesenheit', 'taetigkeitsnachweis', 'coachbericht') THEN d.extracted_text END AS extracted_text, f.name, f.size, d.created_at
         FROM documents d JOIN files f ON f.id = d.file_id WHERE d.coachee_id = $1 ORDER BY d.created_at DESC`,
      [c.id],
    ),
    query<Att>("SELECT id, to_char(held_on, 'YYYY-MM-DD') AS held_on, units::float AS units, to_char(starts_at, 'HH24:MI') AS starts_at FROM attendance WHERE coachee_id = $1", [c.id]),
  ]);
  const groups = DOC_CATEGORIES.map((cat) => ({ ...cat, docs: docs.filter((d) => d.category === cat.key) })).filter((g) => g.docs.length);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        {docs.length === 0 && <Empty>Noch keine Dokumente. Lade rechts Berichte, Nachweise, Businesspläne oder Lebensläufe hoch.</Empty>}
        {groups.map((g) => (
          <section key={g.key} className="card space-y-2">
            <h2 className="h2">{g.label} <span className="text-muted">({g.docs.length})</span></h2>
            <ul className="divide-y divide-line-soft">
              {g.docs.map((d) => {
                const report = isReport(d.category);
                const cmp = report && d.extracted?.length ? compareWithPortal(d.extracted, attendance) : null;
                const ok = cmp && !cmp.differs.length && !cmp.missing.length && !cmp.extra.length;
                return (
                  <li key={d.id} className="py-2">
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="font-medium">{d.title}</span>
                          <span className="text-xs text-muted"> · {formatDate(d.created_at)} · {kb(d.size)}</span>
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {d.shared && <span className="badge bg-bg text-muted">für Coachee sichtbar</span>}
                          {cmp && (ok ? <span className="badge bg-[#e5f2ea] text-ok">passt zum Portal</span> : <span className="badge bg-[#fbf1e3] text-gold">Abweichungen</span>)}
                          {report && !cmp && <span className="badge bg-bg text-muted">keine Termine erkannt</span>}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <a href={`/api/dateien/${d.file_id}`} target="_blank" rel="noreferrer" className="btn btn-sm">Öffnen</a>
                          <a href={`/api/dateien/${d.file_id}?download=1`} className="btn-ghost btn-sm">Herunterladen</a>
                          <form action={deleteDocument.bind(null, c.id, d.id)}><ConfirmButton /></form>
                        </div>
                        <EditDocument coacheeId={c.id} doc={d} />
                        {cmp && <Comparison coacheeId={c.id} docId={d.id} rows={d.extracted!} cmp={cmp} total={reportTotal(d.extracted_text)} />}
                        {report && !cmp && (
                          <p className="text-sm text-muted">
                            {d.has_text ? "Im Text dieses Dokuments stehen keine Zeilen mit Datum und UE oder Uhrzeit." : "Aus dieser Datei lässt sich kein Text lesen (z. B. ein eingescanntes Bild)."} Ein Abgleich mit der Anwesenheit ist deshalb nicht möglich.
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="card space-y-3">
          <h2 className="h2">Hochladen</h2>
          <UploadForm coacheeId={c.id} />
          <p className="text-xs text-muted">Die Dateien liegen verschlüsselt im Portal und sind nur für dich sichtbar, bis du einzelne für den Coachee freigibst. In Anwesenheitsberichten, Tätigkeitsnachweisen und Coachberichten werden Termine und UE erkannt und mit der Anwesenheit abgeglichen.</p>
        </div>
      </aside>
    </div>
  );
}

function Comparison({ coacheeId, docId, rows, cmp, total }: { coacheeId: string; docId: string; rows: ReportRow[]; cmp: ReturnType<typeof compareWithPortal>; total: number | null }) {
  const diff = Math.round((cmp.reportSum - cmp.portalSum) * 100) / 100;
  const indexOf = (r: ReportRow) => rows.indexOf(r);
  return (
    <div className="space-y-3 rounded-lg bg-bg p-3 text-sm">
      <p>
        <b>Abgleich:</b> Im Dokument {cmp.matched.length + cmp.differs.length + cmp.missing.length} Termine mit {formatUnits(cmp.reportSum)}, im Portal für denselben Zeitraum {formatUnits(cmp.portalSum)}.
        {diff !== 0 && <span className={diff > 0 ? " text-gold" : " text-danger"}> Unterschied {diff > 0 ? "+" : ""}{formatUnits(diff)}.</span>}
      </p>
      {total != null && Math.abs(total - cmp.reportSum) >= 0.05 && (
        <p className="text-xs text-muted">Das Dokument nennt selbst eine Summe von {formatUnits(total)}, die einzelnen Termine ergeben {formatUnits(cmp.reportSum)}. Bitte im Dokument prüfen, ob ein Termin fehlt oder die Summe anders gerechnet ist.</p>
      )}
      {cmp.matched.length > 0 && <p className="text-ok">✓ {cmp.matched.length} Termin{cmp.matched.length > 1 ? "e stimmen" : " stimmt"} überein.</p>}
      {cmp.differs.length > 0 && (
        <div>
          <p className="font-medium text-gold">UE weichen ab</p>
          <ul className="list-inside list-disc">
            {cmp.differs.map((x) => <li key={x.portal.id}>{formatDate(x.report.held_on)}: Dokument {formatUnits(x.report.units)}, Portal {formatUnits(x.portal.units)}</li>)}
          </ul>
          <p className="text-xs text-muted">Korrigieren unter <Link href="?tab=anwesenheit" className="link">Anwesenheit</Link>.</p>
        </div>
      )}
      {cmp.missing.some((r) => r.units != null) && (
        <div className="space-y-1">
          <p className="font-medium text-gold">Im Portal fehlen {cmp.missing.length} Termin{cmp.missing.length > 1 ? "e" : ""}</p>
          <ImportRows coacheeId={coacheeId} docId={docId} rows={cmp.missing.filter((r) => r.units != null).map((r) => ({ index: indexOf(r), label: `${formatDate(r.held_on)}${time(r)} · ${formatUnits(r.units)}` }))} />
        </div>
      )}
      {cmp.extra.length > 0 && (
        <div>
          <p className="font-medium text-danger">Nur im Portal, nicht im Dokument</p>
          <ul className="list-inside list-disc">
            {cmp.extra.map((x) => <li key={x.id}>{formatDate(x.held_on)}{time(x)} · {formatUnits(x.units)}</li>)}
          </ul>
          <p className="text-xs text-muted">Vielleicht falsch zugeordnet? Prüfen unter <Link href="?tab=anwesenheit" className="link">Anwesenheit</Link>.</p>
        </div>
      )}
      {cmp.matched.length + cmp.differs.length + cmp.missing.length === 0 && <Notice>Keine Termine im Dokument erkannt.</Notice>}
    </div>
  );
}

