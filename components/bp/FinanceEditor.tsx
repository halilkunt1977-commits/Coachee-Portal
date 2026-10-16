"use client";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { importFinanceItems, saveFinance } from "@/app/actions/businessplan";
import {
  FINANCING_KIND, LIQ_ROWS, MONTHS, RENTA_ROWS, calculate, eur, financeHints, monthLabel,
  type FinanceInput, type FinanceResult, type Financing,
} from "@/lib/bp/finance";
import { Num, Pick, Rows, Text } from "./fields";
import { SaveBadge, useAutosave } from "./useAutosave";

type Props = {
  coacheeId: string;
  coach: boolean;
  initial: FinanceInput;
  version: number;
  prefilled: boolean;
  itemCount: number;
  excelHref: string;
  pdfHref: string;
  planHref: string;
  zahlenHref: string | null;
};

const FIXED_PRESETS = ["Miete", "Versicherungen", "Telefon und Internet", "Fahrzeug", "Marketing", "Steuerberatung", "Software"];

export function FinanceEditor(p: Props) {
  const [f, setF] = useState<FinanceInput>(p.initial);
  const version = useRef(p.version);
  const theirs = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(p.prefilled ? `Die ${p.itemCount} Zahlen aus den Gesprächen sind schon eingetragen. Bitte Annahmen wie Anlaufphase und Laufzeiten prüfen.` : null);
  const [confirmImport, setConfirmImport] = useState(false);
  const r = useMemo(() => calculate(f), [f]);

  const { state, schedule, save, resume } = useAutosave(async () => {
    const res = await saveFinance(p.coacheeId, version.current, f);
    if (res.ok) version.current = res.version;
    else if (res.conflict) theirs.current = res.conflict.version;
    return res;
  });

  const set = (patch: Partial<FinanceInput>) => {
    setF((x) => ({ ...x, ...patch }));
    schedule();
  };
  const months = useMemo(() => Array.from({ length: MONTHS }, (_, i) => ({ value: i, label: monthLabel(f.start, i) })), [f.start]);

  async function download(href: string) {
    await save();
    const a = document.createElement("a");
    a.href = href;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 !p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <SaveBadge state={state} />
          <span className="text-muted">Alle Beträge netto in Euro, gerechnet über 36 Monate.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={p.planHref} className="btn-ghost btn-sm">Businessplan</Link>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void download(p.excelHref)}>Excel herunterladen</button>
          <button type="button" className="btn btn-sm" onClick={() => void download(p.pdfHref)}>PDF mit Businessplan</button>
        </div>
      </div>

      {state.kind === "conflict" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8e6e3] px-4 py-3 text-sm text-danger" role="alert">
          <span>{state.by ?? "Jemand anderes"} hat den Finanzplan gerade auch geändert. Deine Änderungen sind noch nicht gespeichert.</span>
          <span className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => location.reload()}>Neu laden</button>
            <button type="button" className="btn btn-sm" onClick={() => {
              // bewusst überschreiben: auf die Fassung der anderen Person aufsetzen
              if (theirs.current !== null) version.current = theirs.current;
              resume();
            }}>Meine Fassung speichern</button>
          </span>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-tint px-4 py-3 text-sm text-accent">
          <span>{notice}</span>
          <button type="button" aria-label="Hinweis schließen" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      <Summary f={f} r={r} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Block title="Start und Rahmen" intro="Ab wann gerechnet wird und was du privat zum Leben brauchst.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">Erster Monat</span>
              <input type="month" className="input !py-2" value={f.start} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && set({ start: e.target.value })} />
            </label>
            <Num label="Privater Bedarf im Monat" suffix="€" value={f.privateMonthly} onChange={(v) => set({ privateMonthly: v })} hint="Miete, Krankenkasse, Leben" />
            <Num label="Steuerrücklage" suffix="%" digits={1} value={f.taxPct} onChange={(v) => set({ taxPct: v })} hint="vom Gewinn, vereinfacht" />
            {p.itemCount > 0 && (
              <div className="col-span-2 flex items-end sm:col-span-1">
                {confirmImport ? (
                  <span className="flex flex-wrap gap-2 text-xs">
                    <span className="w-full text-muted">Ersetzt alle Eingaben.</span>
                    <button type="button" className="btn btn-sm" onClick={async () => {
                      setConfirmImport(false);
                      await save();
                      const res = await importFinanceItems(p.coacheeId);
                      if (res.ok) {
                        setF(res.finance);
                        version.current = res.version;
                        setNotice(`Die ${p.itemCount} Zahlen aus den Gesprächen sind neu übernommen.`);
                      } else setNotice(res.error);
                    }}>Ja, übernehmen</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmImport(false)}>Abbrechen</button>
                  </span>
                ) : (
                  <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setConfirmImport(true)}>Zahlen aus Gesprächen neu übernehmen</button>
                )}
              </div>
            )}
          </div>
        </Block>

        <Block title="Kapitalbedarf" intro="Was vor und kurz nach dem Start bezahlt werden muss." total={eur(r.capitalNeed.total)}>
          <Sub title="Anschaffungen">
            <Rows
              rows={f.investments}
              onChange={(investments) => set({ investments })}
              make={(label = "") => ({ label, amount: 0, month: 0, years: 5 })}
              addLabel="Anschaffung"
              empty="Noch keine Anschaffungen, z. B. Fahrzeug, Maschinen, Laptop, Einrichtung."
              presets={["Fahrzeug", "Computer und Software", "Einrichtung", "Werkzeug und Maschinen"]}
              render={(x, s) => (
                <>
                  <Text className="col-span-2 sm:flex-1 sm:basis-52" label="Bezeichnung" value={x.label} onChange={(v) => s({ label: v })} />
                  <Num className="sm:w-32" label="Betrag" suffix="€" value={x.amount} onChange={(v) => s({ amount: v, years: v <= 800 && x.years === 5 ? 0 : x.years })} />
                  <Pick className="sm:w-32" label="Im Monat" value={x.month} options={months} onChange={(v) => s({ month: Number(v) })} />
                  <Pick className="col-span-2 sm:w-44" label="Abschreibung" value={x.years} options={[{ value: 0, label: "sofort (bis 800 €)" }, ...[3, 5, 6, 8, 10, 15].map((y) => ({ value: y, label: `über ${y} Jahre` }))]} onChange={(v) => s({ years: Number(v) })} />
                </>
              )}
            />
          </Sub>
          <Sub title="Gründungskosten">
            <Rows
              rows={f.startup}
              onChange={(startup) => set({ startup })}
              make={(label = "") => ({ label, amount: 0 })}
              addLabel="Gründungskosten"
              empty="Einmalige Kosten zum Start, z. B. Gewerbeanmeldung, Beratung, Website, Erstausstattung."
              presets={["Gewerbeanmeldung", "Website und Logo", "Beratung", "Erstes Marketing"]}
              render={(x, s) => (
                <>
                  <Text className="col-span-2 sm:flex-1 sm:basis-52" label="Bezeichnung" value={x.label} onChange={(v) => s({ label: v })} />
                  <Num className="col-span-2 sm:w-36" label="Betrag" suffix="€" value={x.amount} onChange={(v) => s({ amount: v })} />
                </>
              )}
            />
          </Sub>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="Liquiditätsreserve" suffix="€" value={f.reserve} onChange={(v) => set({ reserve: v })} hint="Puffer für Anlauf, oft 3 Monate Kosten" />
          </div>
        </Block>

        <Block title="Finanzierung" intro="Woher das Geld für den Kapitalbedarf kommt." total={eur(r.financingTotal)} warn={r.gap < 0 ? `Es fehlen ${eur(-r.gap)}` : undefined}>
          <Rows
            rows={f.financing}
            onChange={(financing) => set({ financing })}
            make={(label = ""): Financing => ({ label, kind: /darlehen|kredit/i.test(label) ? "darlehen" : "eigen", amount: 0, month: 0, rate: /darlehen|kredit/i.test(label) ? 5 : 0, years: 5, grace: /darlehen|kredit/i.test(label) ? 6 : 0 })}
            addLabel="Finanzierung"
            empty="Noch keine Finanzierung, z. B. Erspartes, Mikrokredit, KfW-Startgeld."
            presets={["Eigenkapital", "Darlehen Hausbank", "KfW-Startgeld"]}
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-48" label="Bezeichnung" value={x.label} onChange={(v) => s({ label: v })} />
                <Pick className="sm:w-36" label="Art" value={x.kind} options={Object.entries(FINANCING_KIND).map(([value, label]) => ({ value, label }))} onChange={(v) => s({ kind: v as Financing["kind"] })} />
                <Num className="sm:w-32" label="Betrag" suffix="€" value={x.amount} onChange={(v) => s({ amount: v })} />
                <Pick className="sm:w-32" label="Im Monat" value={x.month} options={months} onChange={(v) => s({ month: Number(v) })} />
                {x.kind === "darlehen" && (
                  <>
                    <Num className="sm:w-24" label="Zins" suffix="%" value={x.rate} onChange={(v) => s({ rate: v })} />
                    <Num className="sm:w-28" label="Laufzeit" suffix="J." digits={0} value={x.years} onChange={(v) => s({ years: Math.round(v) })} />
                    <Num className="col-span-2 sm:w-36" label="Tilgungsfrei" suffix="Mon." digits={0} value={x.grace} onChange={(v) => s({ grace: Math.round(v) })} />
                  </>
                )}
              </>
            )}
          />
          <Sub title="Laufende Zuschüsse">
            <Rows
              rows={f.grants}
              onChange={(grants) => set({ grants })}
              make={(label = "") => ({ label, monthly: 0, from: 0, months: 6 })}
              addLabel="Zuschuss"
              empty="Zum Beispiel der Gründungszuschuss: Arbeitslosengeld I plus 300 € für 6 Monate."
              presets={["Gründungszuschuss", "Einstiegsgeld"]}
              render={(x, s) => (
                <>
                  <Text className="col-span-2 sm:flex-1 sm:basis-48" label="Bezeichnung" value={x.label} onChange={(v) => s({ label: v })} />
                  <Num className="sm:w-32" label="Im Monat" suffix="€" value={x.monthly} onChange={(v) => s({ monthly: v })} />
                  <Pick className="sm:w-32" label="Ab" value={x.from} options={months} onChange={(v) => s({ from: Number(v) })} />
                  <Num className="col-span-2 sm:w-28" label="Dauer" suffix="Mon." digits={0} value={x.months} onChange={(v) => s({ months: Math.round(v) })} />
                </>
              )}
            />
          </Sub>
        </Block>

        <Block title="Umsatz" intro="Preis mal Menge pro Monat. Die Menge steigt in der Anlaufphase vom Start- zum Zielwert." total={`${eur(r.months[11]?.revenue ?? 0)} im 12. Monat`}>
          <Rows
            rows={f.revenues}
            onChange={(revenues) => set({ revenues })}
            make={(label = "") => ({ label, price: 0, unit: "Stunde", qtyStart: 0, qtyTarget: 0, ramp: 6, growth2: 5, growth3: 5, material: 0 })}
            addLabel="Leistung oder Produkt"
            empty="Noch keine Umsätze. Lege jede Leistung mit Preis und Menge an."
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-52" label="Leistung" value={x.label} onChange={(v) => s({ label: v })} />
                <Num className="sm:w-28" label="Preis" suffix="€" value={x.price} onChange={(v) => s({ price: v })} />
                <Text className="sm:w-28" label="je" value={x.unit} onChange={(v) => s({ unit: v })} placeholder="Stunde" />
                <Num className="sm:w-28" label="Menge Start" digits={1} value={x.qtyStart} onChange={(v) => s({ qtyStart: v })} hint="im 1. Monat" />
                <Num className="sm:w-28" label="Menge Ziel" digits={1} value={x.qtyTarget} onChange={(v) => s({ qtyTarget: v })} hint="pro Monat" />
                <Num className="sm:w-28" label="Anlauf" suffix="Mon." digits={0} value={x.ramp} onChange={(v) => s({ ramp: Math.round(v) })} />
                <Num className="sm:w-28" label="Wareneinsatz" suffix="%" digits={1} value={x.material} onChange={(v) => s({ material: v })} />
                <Num className="sm:w-28" label="Wachstum J. 2" suffix="%" digits={1} value={x.growth2} onChange={(v) => s({ growth2: v })} />
                <Num className="sm:w-28" label="Wachstum J. 3" suffix="%" digits={1} value={x.growth3} onChange={(v) => s({ growth3: v })} />
                <p className="col-span-2 self-end pb-2 text-xs text-muted sm:basis-full">Nach dem Anlauf: {eur(x.price * x.qtyTarget)} im Monat</p>
              </>
            )}
          />
        </Block>

        <Block title="Laufende Kosten" intro="Was jeden Monat für den Betrieb anfällt (ohne privaten Bedarf)." total={`${eur(r.months[11]?.fixed ?? 0)} im Monat`}>
          <Rows
            rows={f.fixed}
            onChange={(fixed) => set({ fixed })}
            make={(label = "") => ({ label, monthly: 0, from: 0 })}
            addLabel="Kostenposition"
            empty="Noch keine laufenden Kosten."
            presets={FIXED_PRESETS}
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-52" label="Bezeichnung" value={x.label} onChange={(v) => s({ label: v })} />
                <Num className="sm:w-32" label="Im Monat" suffix="€" value={x.monthly} onChange={(v) => s({ monthly: v })} />
                <Pick className="sm:w-32" label="Ab" value={x.from} options={months} onChange={(v) => s({ from: Number(v) })} />
              </>
            )}
          />
        </Block>
      </div>

      <Results f={f} r={r} />
      {p.zahlenHref && <p className="text-sm text-muted">Die einzelnen Zahlen aus den Gesprächen stehen weiter im Reiter <Link className="link" href={p.zahlenHref}>Zahlen</Link>.</p>}
    </div>
  );
}

function Block({ title, intro, total, warn, children }: { title: string; intro: string; total?: string; warn?: string; children: ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="h2">{title}</h2>
          <p className="text-sm text-muted">{intro}</p>
        </div>
        {total && (
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{total}</p>
            {warn && <p className="text-xs font-semibold text-danger">{warn}</p>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

const Sub = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </div>
);

function Summary({ f, r }: { f: FinanceInput; r: FinanceResult }) {
  const surplus = (i: number) => {
    const y = r.years[i];
    return y.profit - y.tax - y.privateDraw + y.grants;
  };
  const tiles = [
    { label: "Kapitalbedarf", value: eur(r.capitalNeed.total), sub: r.gap < 0 ? `Es fehlen ${eur(-r.gap)}` : `finanziert: ${eur(r.financingTotal)}`, warn: r.gap < 0 },
    ...[0, 1, 2].map((i) => ({ label: `Gewinn Jahr ${i + 1}`, value: eur(r.years[i].profit), sub: `nach Lebensunterhalt ${eur(surplus(i))}`, warn: surplus(i) < 0 })),
    { label: "Niedrigster Kontostand", value: eur(r.minBalance.value), sub: monthLabel(f.start, r.minBalance.month), warn: r.minBalance.value < 0 },
    { label: "Nötiger Monatsumsatz", value: eur(r.breakEvenRevenue), sub: `geplant im 12. Monat: ${eur(r.months[11].revenue)}`, warn: r.months[11].revenue < r.breakEvenRevenue },
  ];
  const hints = financeHints(f, r);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="card !p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className={`text-lg font-bold tabular-nums ${t.warn ? "text-danger" : ""}`}>{t.value}</p>
            <p className={`text-xs ${t.warn ? "text-danger" : "text-muted"}`}>{t.sub}</p>
          </div>
        ))}
      </div>
      {hints.length > 0 && (
        <ul className="space-y-1 text-sm">
          {hints.map((h) => <li key={h.text} className={h.tone === "warn" ? "text-danger" : "text-ok"}>{h.tone === "warn" ? "⚠ " : "✓ "}{h.text}</li>)}
        </ul>
      )}
    </div>
  );
}

function Results({ f, r }: { f: FinanceInput; r: FinanceResult }) {
  const [year, setYear] = useState(0);
  const months = r.months.slice(year * 12, year * 12 + 12);
  const max = Math.max(1, ...r.months.map((m) => Math.abs(m.balance)));
  // Nulllinie in der Mitte nur, wenn der Kontostand irgendwann negativ wird
  const neg = r.months.some((m) => m.balance < 0);
  const pos = r.months.some((m) => m.balance > 0);
  const half = neg && pos ? 50 : 100;
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="h2">Rentabilität</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead><tr className="border-b border-line-soft text-left text-xs text-muted"><th className="py-2 pr-3 font-medium" />{[1, 2, 3].map((y) => <th key={y} className="py-2 pl-3 text-right font-medium">Jahr {y}</th>)}</tr></thead>
            <tbody>
              {RENTA_ROWS.map((row) => (
                <tr key={row.label} className={row.strong ? "border-t border-line-soft font-semibold" : ""}>
                  <td className="py-1.5 pr-3"><span className="inline-block w-4 text-muted">{row.sign}</span>{row.label}</td>
                  {r.years.map((y, i) => {
                    const v = row.value(y);
                    return <td key={i} className={`py-1.5 pl-3 text-right ${row.strong && v < 0 ? "text-danger" : ""}`}>{eur(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Liquidität</h2>
          <div className="flex gap-1 rounded-xl bg-bg p-1 text-sm" role="tablist">
            {[0, 1, 2].map((y) => (
              <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => setYear(y)} className={`rounded-lg px-3 py-1 ${year === y ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>Jahr {y + 1}</button>
            ))}
          </div>
        </div>
        <div className="flex h-24 items-center gap-[3px]" aria-label="Kontostand über 36 Monate">
          {r.months.map((m, i) => (
            <div key={i} className={`relative h-full flex-1 ${Math.floor(i / 12) === year ? "" : "opacity-40"}`} title={`${monthLabel(f.start, i)}: ${eur(m.balance)}`}>
              <div
                className={`absolute inset-x-0 ${m.balance >= 0 ? "rounded-t-sm bg-ok" : "rounded-b-sm bg-danger"}`}
                style={{ height: `${(Math.abs(m.balance) / max) * half}%`, ...(m.balance >= 0 ? { bottom: `${100 - half === 0 ? 0 : 50}%` } : { top: `${half === 100 ? 0 : 50}%` }) }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Kontostand am Monatsende über 36 Monate. Grün über null, rot darunter.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-xs tabular-nums">
            <thead>
              <tr className="border-b border-line-soft text-left text-muted">
                <th className="sticky left-0 bg-surface py-2 pr-3 font-medium" />
                {months.map((_, i) => <th key={i} className="py-2 pl-2 text-right font-medium">{monthLabel(f.start, year * 12 + i)}</th>)}
              </tr>
            </thead>
            <tbody>
              {LIQ_ROWS.map((row) => (
                <tr key={row.label} className={`${row.strong ? "border-t border-line-soft font-semibold" : ""} ${row.group ? "border-t border-line-soft" : ""}`}>
                  <td className="sticky left-0 max-w-48 bg-surface py-1.5 pr-3">
                    {row.group && <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{row.group}</span>}
                    <span className="inline-block w-3 text-muted">{row.sign}</span>{row.label}
                  </td>
                  {months.map((m, i) => {
                    const v = row.value(m);
                    return <td key={i} className={`whitespace-nowrap py-1.5 pl-2 text-right align-bottom ${v < 0 && row.strong ? "text-danger" : v === 0 ? "text-line" : ""}`}>{eur(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
