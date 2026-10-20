"use client";
import { useId, useState } from "react";
import { ANRECHNUNGSFAKTOR, FREIBETRAG, gewerbesteuer, MESSZAHL } from "@/lib/tax/hebesaetze";

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
const pct = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %";

/** Beispielrechnung Gewerbesteuer mit eigenem Gewinn, rechnet sofort im Browser */
export function GewerbesteuerRechner({ hebesatz, ort }: { hebesatz: number; ort: string }) {
  const id = useId();
  const [ertrag, setErtrag] = useState("60.000");
  const [person, setPerson] = useState(true);
  const value = Number(ertrag.replace(/\./g, "").replace(",", ".")) || 0;
  const g = gewerbesteuer(value, hebesatz, person);
  const rows: [string, string, boolean?][] = [
    ["Gewerbeertrag (vereinfacht: Gewinn)", eur(g.ertrag)],
    ...(person ? [["− Freibetrag", eur(g.freibetrag)] as [string, string]] : []),
    ["= Grundlage, auf volle 100 € abgerundet", eur(g.gerundet)],
    [`× Steuermesszahl ${pct(MESSZAHL * 100)} = Messbetrag`, eur(g.messbetrag)],
    [`× Hebesatz ${ort} ${hebesatz} %`, eur(g.steuer), true],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-40">
          <label className="label" htmlFor={`${id}-e`}>Gewinn im Jahr</label>
          <input id={`${id}-e`} className="input font-semibold tabular-nums" inputMode="decimal" value={ertrag} onChange={(e) => setErtrag(e.target.value)} />
        </div>
        <div className="flex rounded-xl border border-line p-0.5 text-sm" role="group" aria-label="Rechtsform">
          {[["Einzelunternehmen / GbR", true], ["UG / GmbH", false]].map(([l, v]) => (
            <button key={String(l)} type="button" onClick={() => setPerson(v as boolean)} aria-pressed={person === v} className={`rounded-lg px-3 py-1.5 font-medium ${person === v ? "bg-accent text-white" : "text-muted"}`}>
              {l as string}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm tabular-nums">
        <tbody className="divide-y divide-line-soft">
          {rows.map(([l, v, strong]) => (
            <tr key={l} className={strong ? "font-semibold" : ""}><td className="py-1.5 pr-2">{strong ? "= Gewerbesteuer im Jahr" : l}</td><td className="text-right whitespace-nowrap">{v}</td></tr>
          ))}
          {person && (
            <>
              <tr><td className="py-1.5 pr-2 text-muted">− Anrechnung auf die Einkommensteuer ({ANRECHNUNGSFAKTOR} × Messbetrag)</td><td className="text-right whitespace-nowrap text-muted">{eur(g.anrechnung)}</td></tr>
              <tr className="font-semibold"><td className="py-1.5 pr-2">= echte Mehrbelastung</td><td className="text-right whitespace-nowrap">{eur(g.belastung)}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        {person
          ? `Einzelunternehmen und Personengesellschaften haben ${eur(FREIBETRAG)} Freibetrag. Bis zu einem Hebesatz von rund 400 % gleicht die Anrechnung die Gewerbesteuer meist ganz aus, darüber bleibt ein Rest. Die Anrechnung klappt nur, soweit auch Einkommensteuer anfällt.`
          : "UG und GmbH haben keinen Freibetrag und keine Anrechnung. Dazu kommen 15 % Körperschaftsteuer plus Solidaritätszuschlag, zusammen meist rund 30 %."}{" "}
        Der echte Gewerbeertrag kann vom Gewinn abweichen (z. B. Hinzurechnung von Zinsen und Mieten). Richtwert, ohne Gewähr.
      </p>
    </div>
  );
}
