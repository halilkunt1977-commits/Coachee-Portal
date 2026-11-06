"use client";
import { useEffect, useRef, useState } from "react";
import type { BankInfo } from "@/lib/bp/bank";
import { BUNDESWEIT, FOERDER_STAND, LAENDER, landOf, type Programm } from "@/lib/bp/foerderung";
import { Num } from "./fields";
import { SaveBadge, useAutosave } from "./useAutosave";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Abgabe des Businessplans (Coach und Coachee): Fassung für Jobcenter/Agentur oder für Bank und Förderung.
 * Dazu die Angaben für die Bank (Bundesland, Hausbank, Sicherheiten, Vermögen, Fragen und Antworten fürs Bankgespräch)
 * und die Förderprogramme im Bundesland. Entwürfe für die Antworten schreibt die KI nur für den Coach.
 */

type Abgabe = { id: string; kind: "fachstelle" | "bank"; created_at: string; by: string | null; files: { id: string; title: string }[] };

export function AbgabeCard({ href, coach }: { href: string; coach: boolean }) {
  const t = useT();
  const [list, setList] = useState<Abgabe[] | null>(null);
  const [busy, setBusy] = useState<Abgabe["kind"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetch(href).then((r) => r.json()).then((r: { abgaben?: Abgabe[] }) => setList(r.abgaben ?? [])).catch(() => setList([]));
  }, [href]);

  async function submit(kind: Abgabe["kind"]) {
    setBusy(kind);
    setError(null);
    const res = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).then((r) => r.json()).catch(() => ({ error: t("Keine Verbindung.") }))) as { abgaben?: Abgabe[]; error?: string };
    setBusy(null);
    if (res.abgaben) setList(res.abgaben);
    if (res.error) setError(res.error);
  }

  return (
    <section className="card space-y-3 !p-4" aria-label={t("Businessplan abgeben")}>
      <div>
        <h2 className="text-sm font-semibold">{t("Businessplan abgeben")}</h2>
        <p className="text-xs text-muted">
          {coach
            ? t("Erstellt die fertige Fassung als PDF und Excel und legt sie in die Dokumente (für den Coachee freigegeben).")
            : t("Erstellt die fertige Fassung als PDF und Excel. Du findest sie danach hier und bei deinen Dokumenten, dein Coach bekommt Bescheid.")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn-ghost flex-col !items-start !py-3 text-left" disabled={busy !== null} onClick={() => void submit("fachstelle")}>
          <span className="font-semibold">{busy === "fachstelle" ? t("Wird erstellt …") : t("Für Jobcenter / Agentur abgeben")}</span>
          <span className="block text-xs font-normal text-muted">{t("Fassung für die fachkundige Stelle (Gründungszuschuss, Einstiegsgeld)")}</span>
        </button>
        <button type="button" className="btn-ghost flex-col !items-start !py-3 text-left" disabled={busy !== null} onClick={() => void submit("bank")}>
          <span className="font-semibold">{busy === "bank" ? t("Wird erstellt …") : t("Für Bank und Förderung abgeben")}</span>
          <span className="block text-xs font-normal text-muted">{t("Bankfassung mit Kapitaldienst, Tilgungsplan und Vermögensübersicht, dazu der Leitfaden")}</span>
        </button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-xl border border-line-soft text-sm">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0">
                <span className="font-semibold">{a.kind === "bank" ? t("Bank und Förderung") : t("Jobcenter / Agentur")}</span>
                <span className="ml-2 text-xs text-muted">{new Date(a.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}{a.by ? ` · ${a.by}` : ""}</span>
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs">
                {a.files.map((f) => (
                  <a key={f.id} className="text-accent underline-offset-2 hover:underline" href={`/api/dateien/${f.id}?download`}>
                    {/Leitfaden/.test(f.title) ? t("Leitfaden") : /Finanzplan/.test(f.title) ? t("Finanzplan (Excel)") : t("Businessplan (PDF)")}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProgrammList({ list }: { list: Programm[] }) {
  const t = useT();
  return (
    <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
      {list.map((p) => (
        <li key={p.name} className="space-y-0.5 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-semibold">{p.name}</span>
            <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">{p.art}</span>
          </div>
          <p className="text-xs text-muted">{p.text}</p>
          {p.zins && <p className="text-xs font-semibold text-accent">{t("Zins")}: {p.zins}</p>}
          <p className="text-xs text-muted">{t("Wo")}: {p.wo}{p.url && <> · <a className="underline" href={p.url} target="_blank" rel="noreferrer">{t("Website")}</a></>}</p>
        </li>
      ))}
    </ul>
  );
}

export function BankCard({ href, coacheeId, initial, cityLand, ai, pdfHref, excelHref }: { href: string; coacheeId: string; initial: BankInfo; cityLand: string; ai: boolean; pdfHref: string; excelHref: string }) {
  const t = useT();
  const [b, setB] = useState<BankInfo>(() => ({ ...initial, land: initial.land || cityLand }));
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(b);
  useEffect(() => {
    latest.current = b;
  }, [b]);
  const { state, schedule } = useAutosave(async () => {
    const res = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: latest.current }) }).then((r) => r.json())) as { bank?: BankInfo; error?: string };
    return res.bank ? { ok: true } : { ok: false, error: res.error };
  });
  const set = (patch: Partial<BankInfo>) => {
    setB((x) => ({ ...x, ...patch }));
    schedule();
  };
  // Bundesland aus dem Wohnort einmal speichern
  const saved = useRef(false);
  useEffect(() => {
    if (!saved.current && !initial.land && cityLand) {
      saved.current = true;
      schedule();
    }
  }, [initial.land, cityLand, schedule]);

  async function draft(all: boolean) {
    setDrafting(true);
    setError(null);
    const res = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: latest.current }) }).then((r) => r.json()).catch(() => null)) as { bank?: BankInfo } | null;
    if (!res?.bank) {
      setDrafting(false);
      setError(t("Keine Verbindung."));
      return;
    }
    const out = (await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: true, all }) }).then((r) => r.json()).catch(() => ({ error: t("Keine Verbindung.") }))) as { bank?: BankInfo; error?: string };
    setDrafting(false);
    if (out.bank) setB(out.bank);
    if (out.error) setError(out.error);
  }

  const land = landOf(b.land);
  const open = b.fragen.filter((f) => !f.antwort.trim()).length;
  const rows = <K extends "vermoegen" | "verbindlichkeiten">(k: K, i: number, patch: Partial<BankInfo[K][number]>) => set({ [k]: b[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<BankInfo>);

  return (
    <details className="card !p-4" aria-label={t("Bank und Förderung")} id={`bank-${coacheeId}`}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t("Bank und Förderung")}{land ? ` · ${land.name}` : ""}</span>
        <span className="flex items-center gap-3 text-xs text-muted">
          {t("{a} von {b} Fragen beantwortet", { a: b.fragen.length - open, b: b.fragen.length })}
          <SaveBadge state={state} />
        </span>
      </summary>
      <div className="mt-3 space-y-5">
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost btn-sm" href={`${href}?pdf=1`}>{t("Leitfaden Bank und Förderung (PDF)")}</a>
          <a className="btn-ghost btn-sm" href={`${pdfHref}?fassung=bank`}>{t("Businessplan Bankfassung (PDF)")}</a>
          <a className="btn-ghost btn-sm" href={`${excelHref}?fassung=bank`}>{t("Finanzplan Bankfassung (Excel)")}</a>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="label">{t("Bundesland")}</span>
            <select className="input" value={b.land} onChange={(e) => set({ land: e.target.value })}>
              <option value="">{t("Bitte wählen")}</option>
              {LAENDER.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">{t("Hausbank")}</span>
            <input className="input" value={b.hausbank} maxLength={120} placeholder={t("z. B. Sparkasse, Volksbank")} onChange={(e) => set({ hausbank: e.target.value })} />
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className="label">{t("Sicherheiten")}</span>
            <textarea className="input min-h-16" value={b.sicherheiten} maxLength={1500} placeholder={t("z. B. Fahrzeug, Maschinen, Lebensversicherung, Bürgschaft; oder: keine, Haftungsfreistellung gewünscht")} onChange={(e) => set({ sicherheiten: e.target.value })} />
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className="label">{t("Woher stammen die Eigenmittel?")}</span>
            <input className="input" value={b.eigenmittel} maxLength={800} placeholder={t("z. B. Ersparnisse, Abfindung, Sacheinlage Werkzeug")} onChange={(e) => set({ eigenmittel: e.target.value })} />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("Privates Vermögen")}</h3>
            {b.vermoegen.map((x, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="block min-w-0 flex-1"><span className="mb-1 block text-xs font-medium text-muted">{t("Was")}</span><input className="input !py-2" value={x.label} onChange={(e) => rows("vermoegen", i, { label: e.target.value })} /></label>
                <Num label="Wert" suffix="€" digits={0} className="w-32" value={x.betrag} onChange={(n) => rows("vermoegen", i, { betrag: n })} />
                <button type="button" className="btn-ghost btn-sm" aria-label={t("Entfernen")} onClick={() => set({ vermoegen: b.vermoegen.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={() => set({ vermoegen: [...b.vermoegen, { label: "", betrag: 0 }] })}>+ {t("Vermögen")}</button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("Private Verbindlichkeiten")}</h3>
            {b.verbindlichkeiten.map((x, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="block min-w-0 flex-1"><span className="mb-1 block text-xs font-medium text-muted">{t("Was")}</span><input className="input !py-2" value={x.label} onChange={(e) => rows("verbindlichkeiten", i, { label: e.target.value })} /></label>
                <Num label="Restschuld" suffix="€" digits={0} className="w-28" value={x.betrag} onChange={(n) => rows("verbindlichkeiten", i, { betrag: n })} />
                <Num label="Rate/Monat" suffix="€" digits={0} className="w-24" value={x.rate} onChange={(n) => rows("verbindlichkeiten", i, { rate: n })} />
                <button type="button" className="btn-ghost btn-sm" aria-label={t("Entfernen")} onClick={() => set({ verbindlichkeiten: b.verbindlichkeiten.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={() => set({ verbindlichkeiten: [...b.verbindlichkeiten, { label: "", betrag: 0, rate: 0 }] })}>+ {t("Verbindlichkeit")}</button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("Fragen und Antworten fürs Bankgespräch")}</h3>
            {ai && (
              <span className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm" disabled={drafting || !open} onClick={() => void draft(false)}>{drafting ? "Entwirft …" : `✦ Offene Antworten entwerfen (${open})`}</button>
                <button type="button" className="btn-ghost btn-sm" disabled={drafting} onClick={() => void draft(true)}>✦ Alle neu entwerfen</button>
              </span>
            )}
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <ol className="space-y-2">
            {b.fragen.map((f, i) => (
              <li key={i} className="rounded-xl border border-line-soft p-3">
                <p className="text-sm font-semibold">{i + 1}. {f.frage}</p>
                <textarea
                  className="input mt-1.5 min-h-20 text-sm"
                  value={f.antwort}
                  maxLength={3000}
                  placeholder={t("Antwort für das Gespräch")}
                  onChange={(e) => set({ fragen: b.fragen.map((x, j) => (j === i ? { ...x, antwort: e.target.value } : x)) })}
                />
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{land ? t("Förderung in {land}", { land: land.name }) : t("Förderung im Bundesland")}</h3>
          {land ? (
            <>
              <p className="text-xs text-muted">{t("Förderbank")}: <a className="underline" href={land.url} target="_blank" rel="noreferrer">{land.bank}</a> · {t("Bürgschaften")}: {land.buergschaft}</p>
              <ProgrammList list={land.programme} />
            </>
          ) : (
            <p className="text-xs text-muted">{t("Bundesland wählen, dann erscheinen hier die Programme des Landes.")}</p>
          )}
          <h3 className="pt-2 text-sm font-semibold">{t("Bundesweite Förderung")}</h3>
          <ProgrammList list={BUNDESWEIT} />
          <p className="text-xs text-muted">{t("Stand der Zinsen und Programme: {stand}. Verbindlich ist der Zins am Tag der Zusage.", { stand: FOERDER_STAND })}</p>
        </div>
      </div>
    </details>
  );
}
