"use client";
import { useId, useMemo, useState } from "react";
import { BUNDESLAENDER, bruttoNetto, KV_ZUSATZ_SCHNITT, JAHR, kirchensteuerSatz, type Bundesland, type Steuerklasse } from "@/lib/tax/lohnsteuer";
import { useT } from "@/components/i18n/LangProvider";

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const KLASSEN = ["I", "II", "III", "IV", "V", "VI"];
const KLASSE_HINT: Record<number, string> = {
  1: "ledig",
  2: "alleinerziehend",
  3: "verheiratet, mehr Lohn",
  4: "verheiratet, gleich viel",
  5: "verheiratet, weniger Lohn",
  6: "Zweitjob",
};
const FREIBETRAEGE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

/** Brutto-Netto-Rechner 2026 für die Startseite im Jobcoaching. Rechnet sofort im Browser, nichts wird gespeichert. */
export function BruttoNetto({ defaultLand = "BY" }: { defaultLand?: Bundesland }) {
  const t = useT();
  const id = useId();
  const [brutto, setBrutto] = useState("3.500");
  const [jaehrlich, setJaehrlich] = useState(false);
  const [klasse, setKlasse] = useState<Steuerklasse>(1);
  const [kfb, setKfb] = useState(0);
  const [kinder, setKinder] = useState(0);
  const [ab23, setAb23] = useState(true);
  const [land, setLand] = useState<Bundesland>(defaultLand);
  const [kirche, setKirche] = useState(false);
  const [gesetzlich, setGesetzlich] = useState(true);
  const [zusatz, setZusatz] = useState(String(KV_ZUSATZ_SCHNITT).replace(".", ","));
  const [pkv, setPkv] = useState("450");

  const r = useMemo(() => {
    const b = num(brutto);
    return bruttoNetto({
      bruttoJahr: jaehrlich ? b : b * 12,
      steuerklasse: klasse,
      kinderfreibetraege: kfb,
      kinder,
      ab23,
      bundesland: land,
      kirche,
      gesetzlich,
      kvZusatz: num(zusatz),
      pkvBeitrag: num(pkv),
    });
  }, [brutto, jaehrlich, klasse, kfb, kinder, ab23, land, kirche, gesetzlich, zusatz, pkv]);

  const rows: [string, number, number][] = [
    ["Lohnsteuer", r.monat.lohnsteuer, r.jahr.lohnsteuer],
    ["Solidaritätszuschlag", r.monat.soli, r.jahr.soli],
    ...(kirche ? [[`Kirchensteuer (${kirchensteuerSatz(land) * 100} %)`, r.monat.kirchensteuer, r.jahr.kirchensteuer] as [string, number, number]] : []),
    [gesetzlich ? t("Krankenversicherung") : t("Private KV/PV (dein Anteil)"), r.monat.kv, r.jahr.kv],
    ["Rentenversicherung", r.monat.rv, r.jahr.rv],
    ["Arbeitslosenversicherung", r.monat.av, r.jahr.av],
    ...(gesetzlich ? [["Pflegeversicherung", r.monat.pv, r.jahr.pv] as [string, number, number]] : []),
  ];
  const abzug = r.brutto.monat - r.monat.netto;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">Brutto-Netto-Rechner {JAHR}</h2>
        <p className="text-sm text-muted">{t("Was bleibt vom Gehalt übrig? Rechne ein Stellenangebot einfach selbst durch.")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${id}-b`}>{t("Bruttogehalt")}</label>
          <div className="flex gap-2">
            <input id={`${id}-b`} className="input min-w-0 flex-1 text-lg font-semibold tabular-nums" inputMode="decimal" value={brutto} onChange={(e) => setBrutto(e.target.value)} />
            <div className="flex shrink-0 rounded-xl border border-line p-0.5 text-sm" role="group" aria-label={t("Zeitraum")}>
              {[["Monat", false], ["Jahr", true]].map(([l, v]) => (
                <button key={String(l)} type="button" onClick={() => setJaehrlich(v as boolean)} className={`rounded-lg px-3 py-1.5 font-medium ${jaehrlich === v ? "bg-accent text-white" : "text-muted"}`} aria-pressed={jaehrlich === v}>
                  {t(l as string)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-k`}>{t("Steuerklasse")}</label>
          <select id={`${id}-k`} className="input" value={klasse} onChange={(e) => setKlasse(Number(e.target.value) as Steuerklasse)}>
            {KLASSEN.map((k, i) => <option key={k} value={i + 1}>{k} – {t(KLASSE_HINT[i + 1])}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-l`}>{t("Bundesland")}</label>
          <select id={`${id}-l`} className="input" value={land} onChange={(e) => setLand(e.target.value as Bundesland)}>
            {BUNDESLAENDER.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-f`}>{t("Kinderfreibeträge")}</label>
          <select id={`${id}-f`} className="input" value={kfb} disabled={klasse >= 5} onChange={(e) => setKfb(Number(e.target.value))}>
            {FREIBETRAEGE.map((f) => <option key={f} value={f}>{f.toLocaleString("de-DE")}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-c`}>{t("Kinder unter 25")}</label>
          <input id={`${id}-c`} className="input" type="number" min={0} max={10} value={kinder} onChange={(e) => setKinder(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={kirche} onChange={(e) => setKirche(e.target.checked)} />
          {t("Kirchensteuer zahlen")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={ab23} onChange={(e) => setAb23(e.target.checked)} />
          {t("23 Jahre oder älter")}
        </label>
        <div className="sm:col-span-2">
          <p className="label">{t("Krankenversicherung")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-xl border border-line p-0.5 text-sm" role="group" aria-label={t("Krankenversicherung")}>
              {[["gesetzlich", true], ["privat", false]].map(([l, v]) => (
                <button key={String(l)} type="button" onClick={() => setGesetzlich(v as boolean)} className={`rounded-lg px-3 py-1.5 font-medium ${gesetzlich === v ? "bg-accent text-white" : "text-muted"}`} aria-pressed={gesetzlich === v}>
                  {t(l as string)}
                </button>
              ))}
            </div>
            {gesetzlich ? (
              <label className="flex items-center gap-2 text-sm">
                {t("Zusatzbeitrag")}
                <input className="input w-20 py-1.5 tabular-nums" inputMode="decimal" value={zusatz} onChange={(e) => setZusatz(e.target.value)} aria-label={t("Zusatzbeitrag in Prozent")} />
                %
              </label>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                {t("Beitrag im Monat")}
                <input className="input w-24 py-1.5 tabular-nums" inputMode="decimal" value={pkv} onChange={(e) => setPkv(e.target.value)} aria-label={t("Monatsbeitrag private Krankenversicherung")} />
                €
              </label>
            )}
          </div>
          {gesetzlich && <p className="hint mt-1">{t("Durchschnitt {jahr}: {p} %. Den Wert deiner Kasse findest du auf ihrer Website.", { jahr: JAHR, p: String(KV_ZUSATZ_SCHNITT).replace(".", ",") })}</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-tint p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("Netto im Monat")}</p>
            <p className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums">{eur(r.monat.netto)}</p>
          </div>
          <p className="text-sm text-muted tabular-nums">{t("im Jahr {betrag}", { betrag: eur(r.jahr.netto) })}</p>
        </div>
        {r.brutto.monat > 0 && (
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white" aria-hidden>
            <div className="bg-accent" style={{ width: `${Math.max(0, (r.monat.netto / r.brutto.monat) * 100)}%` }} />
            <div className="bg-gold/70" style={{ width: `${Math.max(0, (abzug / r.brutto.monat) * 100)}%` }} />
          </div>
        )}
      </div>

      <table className="w-full text-[13px] tabular-nums sm:text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1 text-left font-medium">{t("Abzüge")}</th>
            <th className="py-1 text-right font-medium">{t("Monat")}</th>
            <th className="py-1 text-right font-medium">{t("Jahr")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          <tr><td className="py-1.5">{t("Brutto")}</td><td className="pl-2 text-right whitespace-nowrap">{eur(r.brutto.monat)}</td><td className="pl-2 text-right whitespace-nowrap">{eur(r.brutto.jahr)}</td></tr>
          {rows.map(([l, m, j]) => (
            <tr key={l}><td className="py-1.5 text-muted">{t(l)}</td><td className="pl-2 text-right whitespace-nowrap">− {eur(m)}</td><td className="pl-2 text-right whitespace-nowrap">− {eur(j)}</td></tr>
          ))}
          <tr className="font-semibold"><td className="py-1.5">{t("Netto")}</td><td className="pl-2 text-right whitespace-nowrap">{eur(r.monat.netto)}</td><td className="pl-2 text-right whitespace-nowrap">{eur(r.jahr.netto)}</td></tr>
        </tbody>
      </table>

      {r.hinweise.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {r.hinweise.map((h) => <li key={h.text}>• {t(h.text, h.vars)}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted">
        {t("Richtwert ohne Gewähr, nach dem amtlichen Berechnungsweg für die Lohnsteuer {jahr}. Nicht berücksichtigt: Freibeträge vom Finanzamt, Sachbezüge, Einmalzahlungen wie Weihnachtsgeld und Besonderheiten bei Rente, Beamten oder Minijob. Die genaue Zahl steht auf deiner Gehaltsabrechnung.", { jahr: JAHR })}
      </p>
    </section>
  );
}
