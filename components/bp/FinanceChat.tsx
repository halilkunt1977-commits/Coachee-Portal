"use client";
import { useState, type ReactNode } from "react";
import { financeChat, financeChatUndo } from "@/app/actions/businessplan";
import { FINANCING_KIND, calculate, eur, financeIsEmpty, keyFigures, type FinanceInput } from "@/lib/bp/finance";
import { Bubble, ChatBox, Working, type ChatFile } from "./ChatBox";
import { Workspace } from "./PlanChat";
import { FiguresTable } from "./PlanEditor";
import { openFile } from "./openFile";

/*
 * Finanzplan als Chat (nur Coach): Der Coach sagt, was hinein soll, oder schreibt „Finanzplan fertigstellen“,
 * und gibt Unterlagen oder Bilder mit. Die KI trägt alles selbst in die Blätter ein, ohne Rückfragen; der neue Stand
 * ist sofort gespeichert. Rechts stehen die wichtigsten Zahlen und alle Posten. „Rückgängig“ holt den Stand davor zurück.
 */

type Turn = { id: string; message: string; note: string | null; error?: string; before: FinanceInput | null; undone?: boolean };

const SUGGESTIONS = ["Finanzplan fertigstellen", "Übernimm die Zahlen aus den hochgeladenen Unterlagen", "Passe den Finanzplan an den Businessplan an", "Stundensatz 60 €, Start im März"];

export function FinanceChat({ coacheeId, name, initial, uploadHref, ai, pdfHref, excelHref, onBack, onEdit, onChange }: { coacheeId: string; name: string; initial: FinanceInput; uploadHref: string; ai: boolean; pdfHref: string; excelHref: string; onBack?: () => void; onEdit: () => void; onChange: (f: FinanceInput, version: number) => void }) {
  const [f, setF] = useState(initial);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "dokument">("chat");
  const working = turns.some((t) => t.note === null && !t.error);

  const apply = (next: FinanceInput, version: number) => {
    setF(next);
    onChange(next, version);
  };

  async function send(text: string, files: ChatFile[]) {
    setError(null);
    const id = `${Date.now()}`;
    const earlier = turns.filter((t) => t.note).map((t) => ({ message: t.message, note: t.note ?? "" }));
    setTurns((all) => [...all, { id, message: text, note: null, before: null }]);
    const res = await financeChat(coacheeId, text, files.map((x) => x.id), earlier).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
    if (!res.ok) {
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, error: res.error } : t)));
      return true;
    }
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, note: res.note, before: res.before } : t)));
    apply(res.finance, res.version);
    return true;
  }

  async function undo(turn: Turn) {
    if (!turn.before) return;
    const res = await financeChatUndo(coacheeId, turn.before);
    if (!res.ok) return setError(res.error);
    apply(res.finance, res.version);
    // alles ab dieser Antwort gilt als zurückgenommen
    const at = turns.findIndex((t) => t.id === turn.id);
    setTurns((all) => all.map((t, i) => (i >= at && t.before ? { ...t, before: null, undone: i === at } : t)));
  }

  const lastUndo = turns.findLastIndex((t) => t.before);
  const empty = financeIsEmpty(f);
  const r = calculate(f);

  const doc = (
    <article className="card min-w-0 space-y-6 sm:!px-8 sm:!py-7" aria-label="Finanzplan">
      <header className="space-y-1 border-b border-line-soft pb-4">
        <p className="eyebrow">Finanzplan · 36 Monate</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight">Finanzplan</h2>
        <p className="text-sm text-muted">{name}</p>
      </header>
      {empty ? (
        <p className="text-sm text-muted">Noch leer. Schreib im Chat „Finanzplan fertigstellen“ oder sag, was hinein soll.</p>
      ) : (
        <>
          <Part title="Die wichtigsten Zahlen"><FiguresTable rows={keyFigures(f, r)} /></Part>
          <Part title="Umsätze">
            <Rows rows={f.revenues.map((x) => [x.label, `${eur(x.price, 2)} je Einheit`, `Jahr 1: ${Math.round(x.qty.slice(0, 12).reduce((a, b) => a + b, 0)).toLocaleString("de-DE")} Einheiten`])} />
          </Part>
          <Part title="Laufende Kosten im Monat">
            <Rows rows={f.costs.map((x) => [x.label, x.category, `${eur(x.monthly[0])} / ${eur(x.monthly[1])} / ${eur(x.monthly[2])}`])} />
          </Part>
          <Part title="Anschaffungen">
            <Rows rows={f.investments.map((x) => [x.label, x.life ? `${Math.round(x.life / 12 * 10) / 10} Jahre Nutzung` : "sofort Aufwand", eur(x.amount)])} />
          </Part>
          {f.staff.length > 0 && <Part title="Personal"><Rows rows={f.staff.map((x) => [x.label, `ab Monat ${x.start + 1}`, `${eur(x.gross)} brutto`])} /></Part>}
          <Part title="Finanzierung">
            <Rows rows={[...f.financing.map((x) => [x.label, FINANCING_KIND[x.kind] + (x.kind === "darlehen" ? `, ${x.rate} %, ${x.years} Jahre` : ""), eur(x.amount)]), ...f.grants.map((g) => [g.label, `Zuschuss ${g.months} Monate`, `${eur(g.monthly)} im Monat`])]} />
            <p className="text-xs text-muted">Kapitalbedarf {eur(r.capitalNeed.total)}, Finanzierung {eur(r.financingTotal)}{r.gap < 0 ? `, es fehlen ${eur(-r.gap)}` : ""}.</p>
          </Part>
        </>
      )}
    </article>
  );

  return (
    <Workspace
      title="Finanzplan"
      name={name}
      onBack={onBack}
      tab={tab}
      setTab={setTab}
      docLabel="Zahlen"
      actions={
        <>
          <button type="button" className="btn btn-sm" disabled={empty || working} onClick={() => void openFile(excelHref)}>Excel</button>
          <button type="button" className="btn-ghost btn-sm" disabled={empty || working} onClick={() => void openFile(`${pdfHref}?ansehen`, undefined, true)}>PDF ansehen</button>
          <button type="button" className="btn-ghost btn-sm" disabled={working} onClick={onEdit}>Selbst bearbeiten</button>
        </>
      }
      chat={
        <ChatBox
          className="lg:h-[calc(100dvh-8.5rem)]"
          items={turns.map((t, i) => ({
            id: t.id,
            user: t.message,
            answer: t.error ? <Bubble tone="error">{t.error}</Bubble> : t.note === null ? <Working text="Ich trage alles in den Finanzplan ein …" /> : (
              <Bubble>
                <p className="whitespace-pre-wrap">{t.note}</p>
                {(t.undone || i === lastUndo) && (
                  <p className="border-t border-line-soft pt-2 text-xs text-muted">
                    {t.undone ? "Rückgängig gemacht." : <button type="button" className="link" onClick={() => void undo(t)}>Rückgängig</button>}
                  </p>
                )}
              </Bubble>
            ),
          }))}
          uploadHref={uploadHref}
          onSend={send}
          working={working}
          enabled={ai}
          emptyTitle="Was soll in den Finanzplan?"
          emptyText="Sag einfach, was hinein soll, oder schreib „Finanzplan fertigstellen“. Ich trage alles selbst in die Blätter ein, ohne Rückfragen. Fehlende Zahlen setze ich als Annahme."
          suggestions={SUGGESTIONS}
          filesOnly="Übernimm die Zahlen aus diesen Unterlagen und stell den Finanzplan fertig."
          onClear={() => setTurns([])}
          error={error}
          scrollKey={turns.map((t) => (t.note === null ? "w" : "d")).join("")}
        />
      }
      doc={doc}
    />
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="h3">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-muted">Noch nichts eingetragen.</p>;
  return (
    <ul className="divide-y divide-line-soft text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
          <span className="min-w-0 font-medium">{r[0]}</span>
          <span className="text-xs text-muted">{r[1]}</span>
          <span className="ml-auto tabular-nums">{r[2]}</span>
        </li>
      ))}
    </ul>
  );
}
