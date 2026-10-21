"use client";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { importFinanceItems, saveFinance } from "@/app/actions/businessplan";
import {
  COST_CATEGORIES, FINANCING_KIND, MONTHS, calculate, eur, financeHints, investmentDepreciation, liquidityRows, monthLabel, overviewRows, pct, rentaRows, staffCost, yearRange,
  type FinanceInput, type FinanceResult, type Financing, type NoteKey, type Revenue, type Year3,
} from "@/lib/bp/finance";
import { Num, Pick, QtyInput, Rows, Text } from "./fields";
import { ImportFileButton } from "./ImportButtons";
import { SaveBadge, useAutosave } from "./useAutosave";

type Props = {
  coacheeId: string;
  coach: boolean;
  initial: FinanceInput;
  version: number;
  prefilled: boolean;
  itemCount: number;
  /** „An … senden“ */
  share?: React.ReactNode;
  excelHref: string;
  pdfHref: string;
  planHref: string;
  zahlenHref: string | null;
  imported: { name: string; at: string } | null;
  filled: boolean;
};

// Die Reiter entsprechen den Arbeitsblättern der Excel-Vorlage
const TABS = [
  { key: "annahmen", label: "Annahmen" },
  { key: "umsatz", label: "Umsatz" },
  { key: "kosten", label: "Kosten" },
  { key: "invest", label: "Investitionen" },
  { key: "personal", label: "Personal" },
  { key: "finanzierung", label: "Finanzierung" },
  { key: "rentabilitaet", label: "Rentabilität" },
  { key: "liquiditaet", label: "Liquidität" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const LIFE_OPTIONS = [0, 12, 24, 36, 48, 60, 72, 84, 96, 120, 180];
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const qtyYear = (r: Revenue, y: number) => sum(r.qty.slice(y * 12, y * 12 + 12));
const num = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

export function FinanceEditor(p: Props) {
  const [f, setF] = useState<FinanceInput>(p.initial);
  const [tab, setTab] = useState<TabKey>("annahmen");
  const version = useRef(p.version);
  const theirs = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(p.prefilled ? `Die ${p.itemCount} Zahlen aus den Gesprächen sind schon eingetragen. Bitte Mengen, Kosten und Laufzeiten prüfen.` : null);
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
    <div className="space-y-5">
      <div className="card space-y-3 !p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <SaveBadge state={state} />
            <span className="text-muted">Alle Beträge netto in Euro, 36 Monate ab {monthLabel(f.start, 0)}.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={p.planHref} className="btn-ghost btn-sm">Businessplan</Link>
            {p.share}
            <button type="button" className="btn-ghost btn-sm" onClick={() => void download(p.excelHref)}>Excel</button>
            <button type="button" className="btn btn-sm" onClick={() => void download(p.pdfHref)}>PDF mit Businessplan</button>
          </div>
        </div>
        {p.coach && (
          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line-soft pt-3">
            <p className="text-xs text-muted">{p.imported ? `Übernommen aus „${p.imported.name}“ am ${new Date(p.imported.at).toLocaleDateString("de-DE")}.` : "Einen Finanzplan nach der Excel-Vorlage (acht Arbeitsblätter) hochladen und übernehmen."}</p>
            <ImportFileButton coacheeId={p.coacheeId} accept=".xlsx" filled={p.filled} label="Aus Excel übernehmen" />
          </div>
        )}
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

      <nav className="no-scrollbar sticky top-14 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line-soft lg:top-16" role="tablist" aria-label="Arbeitsblätter">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab === t.key ? "bg-accent font-semibold text-white" : "text-muted hover:text-ink"}`}>{t.label}</button>
        ))}
      </nav>

      {tab === "annahmen" && (
        <Block title="Annahmen" intro="Planungszeitraum, Materialquote, Anfangsliquidität und private Entnahmen. Die Hinweise stehen in der Excel-Datei mit dabei.">
          <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">Erster Planmonat (Gründungsstart)</span>
              <input type="month" className="input !py-2" value={f.start} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && set({ start: e.target.value })} />
            </label>
            <div className="min-w-0 space-y-1 text-sm">
              <span className="block text-xs font-medium text-muted">Planungszeitraum</span>
              <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5">{[0, 1, 2].map((y) => <span key={y}><b>Jahr {y + 1}:</b> {yearRange(f.start, y)}</span>)}</p>
            </div>
          </div>
          <NoteField f={f} k="period" set={set} />
          <Assumption title="Materialquote" hint="Material und Wareneinsatz in % vom Netto-Umsatz" values={f.materialPct} suffix="%" digits={1} onChange={(materialPct) => set({ materialPct })} note={<NoteField f={f} k="material" set={set} />} />
          <Assumption title="Private Entnahmen im Monat" hint="Was für den Lebensunterhalt aus dem Unternehmen entnommen wird" values={f.privateDraw} suffix="€" onChange={(privateDraw) => set({ privateDraw })} note={<NoteField f={f} k="private" set={set} />} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Num label="Anfangsliquidität" suffix="€" value={f.openingCash} onChange={(v) => set({ openingCash: v })} hint="Kontostand bzw. Eigenmittel zum Start" />
              <NoteField f={f} k="opening" set={set} />
            </div>
            <div className="space-y-2">
              <Num label="Steuerrücklage" suffix="%" digits={1} value={f.taxPct} onChange={(v) => set({ taxPct: v })} hint="vom positiven Ergebnis, vereinfacht; 0 = ohne" />
              <NoteField f={f} k="tax" set={set} />
            </div>
            <div className="space-y-2">
              <Num label="Liquiditätsreserve" suffix="€" value={f.reserve} onChange={(v) => set({ reserve: v })} hint="Teil des Kapitalbedarfs, keine Zahlung" />
              <NoteField f={f} k="reserve" set={set} />
            </div>
          </div>
          {p.itemCount > 0 && (
            <div className="border-t border-line-soft pt-3">
              {confirmImport ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Ersetzt alle Eingaben des Finanzplans.</span>
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
                <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmImport(true)}>Zahlen aus den Gesprächen neu übernehmen</button>
              )}
            </div>
          )}
        </Block>
      )}

      {tab === "umsatz" && (
        <Block title="Umsatzherleitung" intro="Jede Leistungsart mit Ø Netto-Preis und der geplanten Anzahl je Monat. Preis mal Menge ergibt den Umsatz." total={r.years.map((y) => eur(y.revenue)).join(" · ")} totalHint="Jahresumsatz Jahr 1 · 2 · 3">
          {f.revenues.length === 0 && <p className="text-sm text-muted">Noch keine Leistungsarten. Lege jede Leistung mit Preis an und trage die Mengen je Monat ein.</p>}
          {f.revenues.map((x, i) => (
            <RevenueCard
              key={i}
              rev={x}
              start={f.start}
              months={months}
              onChange={(patch) => set({ revenues: f.revenues.map((y, j) => (j === i ? { ...y, ...patch } : y)) })}
              onRemove={() => set({ revenues: f.revenues.filter((_, j) => j !== i) })}
            />
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => set({ revenues: [...f.revenues, { label: "", description: "", price: 0, note: "", qty: Array(MONTHS).fill(0) }] })}>+ Leistungsart</button>
        </Block>
      )}

      {tab === "kosten" && (
        <Block title="Kostenherleitung" intro="Laufende Betriebskosten im Monat, je Planjahr. Die Zuordnung bestimmt die Zeile in der Rentabilitätsvorschau." total={[0, 1, 2].map((y) => eur(sum(f.costs.map((c) => c.monthly[y])))).join(" · ")} totalHint="im Monat, Jahr 1 · 2 · 3">
          <datalist id="cost-categories">{COST_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          <Rows
            rows={f.costs}
            onChange={(costs) => set({ costs })}
            make={(label = "") => ({ label, monthly: [0, 0, 0] as Year3, category: presetCategory(label), note: "", from: 0 })}
            addLabel="Kostenart"
            empty="Noch keine laufenden Kosten, z. B. Telefon, Versicherung, Fahrzeug, Steuerberatung."
            presets={["Telefon / Internet", "Betriebshaftpflicht / Beiträge", "Kraftstoff", "Marketing", "Steuerberater / Buchhaltung", "Miete"]}
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-56" label="Kostenart" value={x.label} onChange={(v) => s({ label: v })} />
                <Text className="col-span-2 sm:w-56" label="Zuordnung" value={x.category} list="cost-categories" max={60} onChange={(v) => s({ category: v })} />
                {[0, 1, 2].map((y) => (
                  <Num key={y} className="sm:w-32" label={`Jahr ${y + 1} €/Monat`} suffix="€" value={x.monthly[y]} onChange={(v) => {
                    const monthly = [...x.monthly] as Year3;
                    // Jahr 1 eintragen füllt leere Folgejahre gleich mit
                    if (y === 0) [1, 2].forEach((k) => monthly[k] === x.monthly[0] && (monthly[k] = v));
                    monthly[y] = v;
                    s({ monthly });
                  }} />
                ))}
                <Pick className="sm:w-32" label="ab Monat" value={x.from} options={months} onChange={(v) => s({ from: Number(v) })} />
                <Text className="col-span-2 sm:basis-full" label="Herleitung" max={300} value={x.note} onChange={(v) => s({ note: v })} />
              </>
            )}
          />
        </Block>
      )}

      {tab === "invest" && (
        <Block title="Investitionsplan" intro="Anschaffungen mit Nutzungsdauer: daraus entsteht die monatliche Abschreibung. Ohne Nutzungsdauer zählt der Betrag im Zahlungsmonat sofort als Aufwand." total={eur(r.capitalNeed.investments)} totalHint={`Abschreibung ${eur(sum(f.investments.map(investmentDepreciation)), 2)} im Monat`}>
          <Rows
            rows={f.investments}
            onChange={(investments) => set({ investments })}
            make={(label = "") => ({ label, amount: 0, life: 60, month: 0, reason: "", note: "" })}
            addLabel="Investition"
            empty="Noch keine Investitionen, z. B. Werkzeug, Messgeräte, Computer, Einrichtung, Website."
            presets={["Werkzeug", "Computer und Software", "Einrichtung", "Website / Erstausstattung"]}
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-56" label="Investition" value={x.label} onChange={(v) => s({ label: v })} />
                <Num className="sm:w-32" label="Betrag" suffix="€" value={x.amount} onChange={(v) => s({ amount: v })} />
                <Pick className="sm:w-40" label="Nutzungsdauer" value={x.life} options={[...new Set([...LIFE_OPTIONS, x.life])].sort((a, b) => a - b).map((m) => ({ value: m, label: m ? `${m} Monate` : "sofort Aufwand" }))} onChange={(v) => s({ life: Number(v) })} />
                <Pick className="sm:w-32" label="Zahlung" value={x.month} options={months} onChange={(v) => s({ month: Number(v) })} />
                <p className="self-end pb-2 text-xs text-muted sm:w-36">{x.life ? `${eur(investmentDepreciation(x), 2)} AfA im Monat` : "im Zahlungsmonat Aufwand"}</p>
                <Text className="col-span-2 sm:flex-1 sm:basis-64" label="Begründung" max={300} value={x.reason} onChange={(v) => s({ reason: v })} />
                <Text className="col-span-2 sm:flex-1 sm:basis-64" label="Hinweis" max={300} value={x.note} onChange={(v) => s({ note: v })} />
              </>
            )}
          />
        </Block>
      )}

      {tab === "personal" && (
        <Block title="Personalplan" intro="Inhaber und Mitarbeitende mit Startmonat, Bruttolohn und Arbeitgeberanteil. Bei Einzelunternehmen ist der Inhaber ohne Lohn eingetragen." total={r.years.map((y) => eur(y.personnel)).join(" · ")} totalHint="Personalkosten Jahr 1 · 2 · 3">
          <Rows
            rows={f.staff}
            onChange={(staff) => set({ staff })}
            make={(label = "") => ({ label, start: 0, gross: label.startsWith("Inhaber") ? 0 : 2500, surcharge: label.startsWith("Inhaber") ? 0 : 22, note: "" })}
            addLabel="Position"
            empty="Noch kein Personal geplant."
            presets={["Inhaber", "Mitarbeiter 1", "Aushilfe"]}
            render={(x, s) => (
              <>
                <Text className="col-span-2 sm:flex-1 sm:basis-52" label="Position" value={x.label} onChange={(v) => s({ label: v })} />
                <Pick className="sm:w-32" label="Start" value={x.start} options={months} onChange={(v) => s({ start: Number(v) })} />
                <Num className="sm:w-32" label="Brutto im Monat" suffix="€" value={x.gross} onChange={(v) => s({ gross: v })} />
                <Num className="sm:w-28" label="AG-Anteil" suffix="%" digits={1} value={x.surcharge} onChange={(v) => s({ surcharge: v })} />
                <p className="col-span-2 self-end pb-2 text-xs text-muted sm:w-40">Kosten {eur(staffCost(x))} im Monat</p>
                <Text className="col-span-2 sm:basis-full" label="Herleitung" max={300} value={x.note} onChange={(v) => s({ note: v })} />
              </>
            )}
          />
        </Block>
      )}

      {tab === "finanzierung" && (
        <Block title="Finanzierung" intro="Eigenkapital, Darlehen und Zuschüsse, die zusätzlich zur Anfangsliquidität ins Unternehmen fließen." total={eur(r.financingTotal)} totalHint={`mit Anfangsliquidität · Kapitalbedarf ${eur(r.capitalNeed.total)}`}>
          <Rows
            rows={f.financing}
            onChange={(financing) => set({ financing })}
            make={(label = ""): Financing => ({ label, kind: /darlehen|kredit|kfw/i.test(label) ? "darlehen" : "eigen", amount: 0, month: 0, rate: /darlehen|kredit|kfw/i.test(label) ? 5 : 0, years: 5, grace: /darlehen|kredit|kfw/i.test(label) ? 6 : 0 })}
            addLabel="Finanzierung"
            empty="Noch keine Finanzierung, z. B. Mikrokredit, KfW-Startgeld."
            presets={["Darlehen Hausbank", "KfW-Startgeld"]}
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
          <Sub title="Laufende Zuschüsse zum Lebensunterhalt">
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
      )}

      {tab === "rentabilitaet" && <Rentability f={f} r={r} />}
      {tab === "liquiditaet" && <Liquidity f={f} r={r} />}

      {p.zahlenHref && <p className="text-sm text-muted">Die einzelnen Zahlen aus den Gesprächen stehen weiter im Reiter <Link className="link" href={p.zahlenHref}>Zahlen</Link>.</p>}
    </div>
  );
}

/** Zuordnung für eine Vorschlags-Kostenart */
function presetCategory(label: string) {
  if (/versicher|beitr/i.test(label)) return "Versicherungen/Beiträge";
  if (/kraftstoff|fahrzeug|kfz|transporter/i.test(label)) return "KFZ-Kosten";
  if (/marketing|werbung/i.test(label)) return "Werbe-/Reisekosten";
  if (/steuerber|buchhalt/i.test(label)) return "Steuerberater/Buchhaltung";
  if (/miete|raum/i.test(label)) return "Raumkosten";
  return "Betriebskosten";
}

function NoteField({ f, k, set }: { f: FinanceInput; k: NoteKey; set: (p: Partial<FinanceInput>) => void }) {
  return <Text label="Herleitung / Hinweis" max={500} value={f.notes[k]} onChange={(v) => set({ notes: { ...f.notes, [k]: v } })} />;
}

function Assumption({ title, hint, values, suffix, digits, onChange, note }: { title: string; hint: string; values: Year3; suffix: string; digits?: number; onChange: (v: Year3) => void; note: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-line-soft bg-bg/50 p-3">
      <p className="text-sm font-semibold">{title} <span className="font-normal text-muted">· {hint}</span></p>
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
        {[0, 1, 2].map((y) => (
          <Num key={y} label={`Jahr ${y + 1}`} suffix={suffix} digits={digits} value={values[y]} onChange={(v) => {
            const next = [...values] as Year3;
            // Jahr 1 eintragen füllt gleiche Folgejahre mit
            if (y === 0) [1, 2].forEach((k) => next[k] === values[0] && (next[k] = v));
            next[y] = v;
            onChange(next);
          }} />
        ))}
      </div>
      {note}
    </div>
  );
}

/** Eine Leistungsart: Angaben und die Mengen je Monat, Jahr für Jahr, mit Schnelleingabe */
function RevenueCard({ rev, start, months, onChange, onRemove }: { rev: Revenue; start: string; months: { value: number; label: string }[]; onChange: (p: Partial<Revenue>) => void; onRemove: () => void }) {
  const [year, setYear] = useState(0);
  const [from, setFrom] = useState(0);
  const [qty, setQty] = useState(1);
  const [until, setUntil] = useState<"jahr" | "ende">("ende");
  const setMonth = (m: number, v: number) => onChange({ qty: rev.qty.map((q, i) => (i === m ? v : q)) });
  const fill = () => {
    const end = until === "ende" ? MONTHS : (Math.floor(from / 12) + 1) * 12;
    onChange({ qty: rev.qty.map((q, i) => (i >= from && i < end ? qty : q)) });
  };
  return (
    <div className="space-y-3 rounded-xl border border-line-soft bg-bg/50 p-3">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-wrap">
          <Text className="col-span-2 sm:flex-1 sm:basis-64" label="Leistungsart" value={rev.label} onChange={(v) => onChange({ label: v })} />
          <Num className="col-span-2 sm:w-40" label="Ø Netto-Preis" suffix="€" value={rev.price} onChange={(v) => onChange({ price: v })} />
          <Text className="col-span-2 sm:basis-full" label="Typischer Leistungsumfang" max={500} value={rev.description} onChange={(v) => onChange({ description: v })} />
          <Text className="col-span-2 sm:basis-full" label="Herleitung / Hinweis" max={300} value={rev.note} onChange={(v) => onChange({ note: v })} />
        </div>
        <button type="button" aria-label="Leistungsart löschen" title="Löschen" className="mt-6 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" onClick={onRemove}>✕</button>
      </div>

      <div className="space-y-2 rounded-lg bg-surface p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-bg p-1 text-sm" role="tablist" aria-label="Planjahr">
            {[0, 1, 2].map((y) => (
              <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => setYear(y)} className={`rounded-md px-2.5 py-1 ${year === y ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>Jahr {y + 1}</button>
            ))}
          </div>
          <p className="text-xs text-muted tabular-nums">Menge {[0, 1, 2].map((y) => num(qtyYear(rev, y))).join(" · ")} · Umsatz {[0, 1, 2].map((y) => eur(qtyYear(rev, y) * rev.price)).join(" · ")}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 xl:grid-cols-12">
          {Array.from({ length: 12 }, (_, k) => {
            const m = year * 12 + k;
            return (
              <label key={m} className="block min-w-0">
                <span className="block text-center text-[10px] text-muted">{monthLabel(start, m)}</span>
                <QtyInput label={`Menge ${rev.label || "Leistung"} ${monthLabel(start, m)}`} value={rev.qty[m]} onChange={(v) => setMonth(m, v)} />
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-line-soft pt-2 text-sm">
          <span className="pb-2 text-xs font-medium text-muted">Schnell eintragen:</span>
          <Pick className="w-32" label="ab Monat" value={from} options={months} onChange={(v) => setFrom(Number(v))} />
          <Num className="w-24" label="jeweils" digits={2} value={qty} onChange={setQty} />
          <Pick className="w-36" label="bis" value={until} options={[{ value: "ende", label: "Planende" }, { value: "jahr", label: "Ende dieses Jahres" }]} onChange={(v) => setUntil(v as "jahr" | "ende")} />
          <button type="button" className="btn-ghost btn-sm mb-0.5" onClick={fill}>Eintragen</button>
        </div>
      </div>
    </div>
  );
}

function Block({ title, intro, total, totalHint, children }: { title: string; intro: string; total?: string; totalHint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="h2">{title}</h2>
          <p className="text-sm text-muted">{intro}</p>
        </div>
        {total && (
          <div className="text-right">
            <p className="font-bold tabular-nums">{total}</p>
            {totalHint && <p className="text-xs text-muted">{totalHint}</p>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

const Sub = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-2 border-t border-line-soft pt-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </div>
);

function Summary({ f, r }: { f: FinanceInput; r: FinanceResult }) {
  const tiles = [
    ...[0, 1, 2].map((i) => ({ label: `Jahr ${i + 1}`, value: eur(r.years[i].profit), sub: `Umsatz ${eur(r.years[i].revenue)}`, warn: r.years[i].profit < 0, hint: "Ergebnis vor Steuern" })),
    { label: "Kontostand Ende Jahr 3", value: eur(r.years[2].balance), sub: `Anfang ${eur(f.openingCash)}`, warn: r.years[2].balance < 0, hint: "" },
    { label: "Niedrigster Kontostand", value: eur(r.minBalance.value), sub: monthLabel(f.start, r.minBalance.month), warn: r.minBalance.value < 0, hint: "" },
    { label: "Investitionen", value: eur(r.capitalNeed.investments), sub: `Personal ab ${f.staff.filter((s) => s.gross > 0).map((s) => monthLabel(f.start, s.start)).join(", ") || "–"}`, warn: false, hint: "" },
  ];
  const hints = financeHints(f, r);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="card !p-4">
            <p className="text-xs text-muted">{t.label}{t.hint && <span className="block">{t.hint}</span>}</p>
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

const rowTone = (tone?: string) => (tone === "sum" ? "bg-[#e2f0d9]/60 font-semibold" : tone === "sub" ? "bg-bg font-semibold" : "");

function YearTabs({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-bg p-1 text-sm" role="tablist">
      {[0, 1, 2].map((y) => (
        <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => setYear(y)} className={`rounded-lg px-3 py-1 ${year === y ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>Jahr {y + 1}</button>
      ))}
    </div>
  );
}

function MonthTable({ f, rows, ms, offset }: { f: FinanceInput; rows: { key: string; label: string; value: (m: FinanceResult["months"][number]) => number; tone?: string; group?: string }[]; ms: FinanceResult["months"]; offset: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[62rem] text-xs tabular-nums">
        <thead>
          <tr className="border-b border-line-soft text-left text-muted">
            <th className="sticky left-0 bg-surface py-2 pr-3 font-medium">Position</th>
            {ms.map((_, i) => <th key={i} className="py-2 pl-2 text-right font-medium">{monthLabel(f.start, offset + i)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`${rowTone(row.tone)} ${row.group ? "border-t border-line-soft" : ""}`}>
              <td className="sticky left-0 max-w-52 bg-surface py-1.5 pr-3">
                {row.group && <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{row.group}</span>}
                {row.label}
              </td>
              {ms.map((m, i) => {
                const v = row.value(m);
                return <td key={i} className={`whitespace-nowrap py-1.5 pl-2 text-right align-bottom ${v < -0.005 ? "text-danger" : Math.abs(v) < 0.005 ? "text-line" : ""}`}>{eur(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rentability({ f, r }: { f: FinanceInput; r: FinanceResult }) {
  const [year, setYear] = useState(0);
  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <h2 className="h2">Rentabilität Übersicht</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead><tr className="border-b border-line-soft text-left text-xs text-muted"><th className="py-2 pr-3 font-medium">Position</th>{[1, 2, 3].map((y) => <th key={y} className="py-2 pl-3 text-right font-medium">Jahr {y}</th>)}</tr></thead>
            <tbody>
              {overviewRows(f).map((row) => (
                <tr key={row.key} className={rowTone(row.tone)}>
                  <td className="px-1 py-1.5 pr-3">{row.label}</td>
                  {r.years.map((y, i) => {
                    const v = row.value(y);
                    return <td key={i} className={`py-1.5 pl-3 pr-1 text-right ${v < 0 ? "text-danger" : ""}`}>{eur(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Materialquote {f.materialPct.map(pct).join(" · ")}. Gesamtkosten enthalten Personal, laufende Kosten und Abschreibungen.</p>
      </section>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Rentabilitätsvorschau</h2>
          <YearTabs year={year} setYear={setYear} />
        </div>
        <MonthTable f={f} rows={rentaRows(r, f)} ms={r.months.slice(year * 12, year * 12 + 12)} offset={year * 12} />
      </section>
    </div>
  );
}

function Liquidity({ f, r }: { f: FinanceInput; r: FinanceResult }) {
  const [year, setYear] = useState(0);
  const max = Math.max(1, ...r.months.map((m) => Math.abs(m.balance)));
  // Nulllinie in der Mitte nur, wenn der Kontostand irgendwann negativ wird
  const neg = r.months.some((m) => m.balance < 0);
  const pos = r.months.some((m) => m.balance > 0);
  const half = neg && pos ? 50 : 100;
  const ms = r.months.slice(year * 12, year * 12 + 12);
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Liquiditätsplanung</h2>
        <YearTabs year={year} setYear={setYear} />
      </div>
      <div className="flex h-24 items-center gap-[3px]" aria-label="Kontostand über 36 Monate">
        {r.months.map((m, i) => (
          <button key={i} type="button" onClick={() => setYear(Math.floor(i / 12))} className={`relative h-full flex-1 ${Math.floor(i / 12) === year ? "" : "opacity-40"}`} title={`${monthLabel(f.start, i)}: ${eur(m.balance)}`}>
            <span
              className={`absolute inset-x-0 ${m.balance >= 0 ? "rounded-t-sm bg-ok" : "rounded-b-sm bg-danger"}`}
              style={{ height: `${(Math.abs(m.balance) / max) * half}%`, ...(m.balance >= 0 ? { bottom: `${100 - half === 0 ? 0 : 50}%` } : { top: `${half === 100 ? 0 : 50}%` }) }}
            />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Kontostand am Monatsende über 36 Monate. Anfangsbestand Jahr {year + 1}: <b>{eur(ms[0].opening)}</b>, Ende: <b>{eur(ms[11].balance)}</b>.</p>
      <MonthTable f={f} rows={liquidityRows(f)} ms={ms} offset={year * 12} />
    </section>
  );
}
