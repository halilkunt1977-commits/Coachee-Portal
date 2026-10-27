"use client";
import { useState } from "react";
import { financeVersions, keepCurrentFinance, loadFinanceVersion } from "@/app/actions/businessplan";
import type { FinanceGist, Version } from "@/lib/bp/fassungen";
import { eur, monthsBetween, shiftMonths, type FinanceInput } from "@/lib/bp/finance";

/*
 * Frühere Fassungen des Finanzplans (nur Coach): Stände vor einer Übernahme und aus der nächtlichen Datensicherung.
 * Zurückholen geht ganz oder nur für die laufenden Kosten; der jetzige Stand wird vorher selbst als Fassung abgelegt.
 * Gespeichert wird über das normale automatische Speichern im Editor.
 */

const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const describe = (g: FinanceGist) =>
  [`Umsatz Jahr 1 ${eur(g.revenue)}`, `${g.costs} ${g.costs === 1 ? "Kostenart" : "Kostenarten"}${g.costs ? ` (${eur(g.costsMonthly)} im Monat)` : ""}`, g.investments ? `${g.investments} Investitionen` : "", g.staff ? `${g.staff} im Personalplan` : ""].filter(Boolean).join(", ");

type Open = { v: Version; finance: FinanceInput; gist: FinanceGist };

export function FinanzFassungen({ coacheeId, finance, onApply, blocked }: { coacheeId: string; finance: FinanceInput; onApply: (f: FinanceInput) => void; blocked: boolean }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Version[] | null>(null);
  const [shown, setShown] = useState<Open | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function toggle() {
    setOpen((o) => !o);
    if (!open) setList(await financeVersions(coacheeId).catch(() => []));
  }

  async function show(v: Version) {
    setBusy(v.id);
    setError(null);
    setDone(null);
    const res = await loadFinanceVersion(coacheeId, v.source, v.id).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setShown({ v, finance: res.finance, gist: res.gist });
  }

  async function restore(costsOnly: boolean) {
    if (!shown || blocked) return;
    setBusy("restore");
    const label = `${shown.v.source === "sicherung" ? "Datensicherung" : "Fassung"} vom ${when(shown.v.at)}`;
    await keepCurrentFinance(coacheeId, `Vor dem Zurückholen (${costsOnly ? "laufende Kosten" : "ganzer Stand"}) aus ${label}`).catch(() => undefined);
    const old = shiftMonths(shown.finance, monthsBetween(shown.finance.start, finance.start));
    onApply(costsOnly ? { ...finance, costs: old.costs } : shown.finance);
    setBusy(null);
    setDone(costsOnly ? `${old.costs.length} Kostenarten aus der ${label} sind wieder eingetragen.` : `Der Stand aus der ${label} ist wieder eingetragen.`);
    setShown(null);
    setList(await financeVersions(coacheeId).catch(() => list));
  }

  return (
    <div className="space-y-3 rounded-xl border border-line-soft bg-surface p-3 sm:p-4" aria-label="Frühere Fassungen">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => void toggle()} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Frühere Fassungen</span>
          <span className="block text-xs text-muted">Stände vor einer Übernahme aus Excel und aus der nächtlichen Datensicherung. Ganz oder nur die laufenden Kosten zurückholen.</span>
        </span>
        <span className="shrink-0 text-sm text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3">
          {done && <p className="rounded-lg bg-[#e6f2ea] px-3 py-2 text-sm text-ok" role="status">✓ {done}</p>}
          {error && <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          {!list && <p className="text-sm text-muted">Wird geladen …</p>}
          {list?.length === 0 && <p className="text-sm text-muted">Noch keine früheren Fassungen.</p>}

          {shown && (
            <div className="space-y-2 rounded-lg border border-accent/40 bg-tint p-3 text-sm">
              <p className="font-semibold">{shown.v.reason} · {when(shown.v.at)}</p>
              <p className="text-muted">{describe(shown.gist)}</p>
              {shown.finance.costs.length > 0 && (
                <ul className="space-y-0.5">
                  {shown.finance.costs.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3"><span className="min-w-0 break-words">{c.label}</span><span className="shrink-0 tabular-nums">{c.monthly.map((m) => eur(m)).join(" / ")}</span></li>
                  ))}
                </ul>
              )}
              {shown.finance.revenues.length > 0 && <p className="text-muted">Umsätze: {shown.finance.revenues.map((r) => r.label).join(", ")}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {shown.finance.costs.length > 0 && <button type="button" className="btn btn-sm" disabled={!!busy || blocked} onClick={() => void restore(true)}>Nur laufende Kosten zurückholen</button>}
                <button type="button" className="btn-ghost btn-sm" disabled={!!busy || blocked} onClick={() => void restore(false)}>Ganzen Stand zurückholen</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setShown(null)}>Schließen</button>
              </div>
              <p className="text-xs text-muted">Der jetzige Stand wird vorher hier abgelegt, du kannst also jederzeit zurück.</p>
            </div>
          )}

          {list && list.length > 0 && (
            <ul className="divide-y divide-line-soft text-sm">
              {list.map((v) => (
                <li key={`${v.source}-${v.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block">{when(v.at)} · {v.reason}{v.by ? ` (${v.by})` : ""}</span>
                    {v.gist && <span className="block text-xs text-muted">{describe(v.gist)}</span>}
                  </span>
                  <button type="button" className="btn-ghost btn-sm shrink-0" disabled={!!busy} onClick={() => void show(v)}>{busy === v.id ? "Wird geöffnet …" : "Ansehen"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
