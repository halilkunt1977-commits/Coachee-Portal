"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FB_KATEGORIEN,
  FB_STEPS,
  UNTERLAGEN,
  fbSichtbar,
  fehlend,
  fortschritt,
  fragebogenText,
  neueInvestition,
  neueKosten,
  neueZeile,
  neuerWettbewerber,
  neuesProdukt,
  type FbField,
  type FbListe,
  type FragebogenData,
} from "@/lib/bp/fragebogen";
import type { FragebogenStand } from "@/lib/bp/fragebogen-store";
import { SaveBadge, useAutosave } from "./useAutosave";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Gründungsfragebogen: Der Coachee füllt ihn Schritt für Schritt aus (speichert von selbst) und schickt ihn an den Coach.
 * Der Coach sieht die Antworten, kann ergänzen und die Zahlen mit einem Klick in den Finanzplan übernehmen.
 */

type Res = Partial<FragebogenStand> & { error?: string; uebernommen?: string[] };
const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ error: "Keine Verbindung." })) as Promise<Res>;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");

export function Fragebogen({ href, coach, vorname, financeHref, onBack }: { href: string; coach: boolean; vorname: string; financeHref: string; onBack: () => void }) {
  const t = useT();
  const router = useRouter();
  const [stand, setStand] = useState<FragebogenStand | null>(null);
  const [d, setD] = useState<FragebogenData | null>(null);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"form" | "summary">("form");
  const latest = useRef(d);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    latest.current = d;
  }, [d]);

  useEffect(() => {
    let live = true;
    fetch(href)
      .then((r) => r.json())
      .then((res: Res) => {
        if (!live) return;
        if (res.data) {
          setStand(res as FragebogenStand);
          setD(res.data);
          if (coach && res.submitted_at) setView("summary");
        } else setMsg({ ok: false, text: res.error ?? "Keine Verbindung." });
      })
      .catch(() => live && setMsg({ ok: false, text: "Keine Verbindung." }));
    return () => {
      live = false;
    };
  }, [href, coach]);

  const { state, schedule, save } = useAutosave(async () => {
    const res = await post(href, { data: latest.current });
    return res.data ? { ok: true } : { ok: false, error: res.error };
  });

  function change(fn: (x: FragebogenData) => FragebogenData) {
    setD((x) => (x ? fn(structuredClone(x)) : x));
    schedule();
  }
  const setText = (k: string, v: string) => change((x) => ({ ...x, text: { ...x.text, [k]: v } }));

  function go(i: number) {
    setStep(Math.max(0, Math.min(FB_STEPS.length, i)));
    setMsg(null);
    requestAnimationFrame(() => {
      const y = (top.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, y) });
    });
  }

  async function submit() {
    setBusy(true);
    await save();
    const res = await post(href, { data: latest.current, submit: true });
    setBusy(false);
    if (res.data) setStand(res as FragebogenStand);
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: t("Danke! Dein Fragebogen ist bei deinem Coach.") });
  }

  /** Zahlen in den Finanzplan übernehmen; mit schreiben = true danach gleich den ganzen Businessplan schreiben lassen */
  async function uebernehmen(schreiben = false) {
    if (!window.confirm(schreiben ? t("Die Zahlen aus dem Fragebogen ersetzen im Finanzplan die passenden Bereiche, danach wird der ganze Businessplan neu geschrieben. Der bisherige Stand wird als Fassung gesichert. Weiter?") : t("Die Zahlen aus dem Fragebogen ersetzen im Finanzplan die passenden Bereiche (Umsatz, Kosten, Anschaffungen, Finanzierung, Lebenshaltung). Der bisherige Stand wird als Fassung gesichert. Übernehmen?"))) return;
    setBusy(true);
    await save();
    const res = await post(href, { uebernehmen: true });
    setBusy(false);
    if (res.data) setStand(res as FragebogenStand);
    // ohne Zahlen im Fragebogen trotzdem schreiben: Die Texte kommen aus den übrigen Antworten
    if (schreiben && (!res.error || res.data)) {
      router.push("?tab=businessplan&schreiben=1", { scroll: false });
      return;
    }
    if (res.error) setMsg({ ok: false, text: res.error });
    else {
      setMsg({ ok: true, text: t("In den Finanzplan übernommen: {was}.", { was: (res.uebernommen ?? []).join(", ") }) });
      router.refresh();
    }
  }

  const head = (
    <section className="card overflow-hidden !p-0">
      <div className="space-y-2 bg-accent px-4 py-4 text-white sm:px-6">
        <button type="button" className="text-sm text-white/80 hover:text-white" onClick={onBack}>← {coach ? t("Zum Businessplan") : t("Zur Übersicht")}</button>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{coach ? t("Gründungsfragebogen von {name}", { name: vorname }) : t("Gründungsfragebogen")}</h2>
        <p className="text-sm text-white/75">
          {coach
            ? t("Was {name} über das Vorhaben, Preise, Kosten und Finanzierung angegeben hat. Die Zahlen kannst du in den Finanzplan übernehmen.", { name: vorname })
            : t("Mit deinen Antworten schreibt dein Coach deinen Businessplan und den Finanzplan. Stichworte genügen. Alle Beträge netto, also ohne Umsatzsteuer. Wenn du etwas nicht weißt, schreib „unklar“.")}
        </p>
      </div>
    </section>
  );

  if (!d || !stand)
    return (
      <div className="space-y-4" ref={top}>
        {head}
        <p className={`card text-sm ${msg ? "text-danger" : "text-muted"}`}>{msg ? t(msg.text) : t("Wird geladen …")}</p>
      </div>
    );

  const p = fortschritt(d);
  const status = stand.submitted_at ? t("Geschickt am {tag}", { tag: day(stand.submitted_at) }) : stand.gestartet ? t("Noch nicht geschickt") : t("Noch nicht begonnen");

  return (
    <div className="space-y-4" ref={top}>
      {head}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{t("{a} von {b} Schritten ausgefüllt", { a: p.done, b: p.total })} · {status}{stand.uebernommen_at ? ` · ${t("In den Finanzplan übernommen am {tag}", { tag: day(stand.uebernommen_at) })}` : ""}</span>
          <SaveBadge state={state} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.round((100 * p.done) / p.total)}%` }} /></div>
        {coach && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={view === "summary" ? "btn btn-sm" : "btn-ghost btn-sm"} onClick={() => setView("summary")}>{t("Antworten lesen")}</button>
            <button type="button" className={view === "form" ? "btn btn-sm" : "btn-ghost btn-sm"} onClick={() => setView("form")}>{t("Bearbeiten")}</button>
            <button type="button" className="btn-gold btn-sm" disabled={busy} onClick={() => void uebernehmen(true)}>{t("Übernehmen und Businessplan schreiben")}</button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void uebernehmen()}>{t("Nur Zahlen in den Finanzplan übernehmen")}</button>
            <a className="btn-ghost btn-sm" href={financeHref}>{t("Zum Finanzplan")}</a>
          </div>
        )}
      </section>
      {msg && <p className={`card text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{t(msg.text)}</p>}

      {coach && view === "summary" ? (
        <Zusammenfassung d={d} />
      ) : (
        <>
          <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label={t("Schritte")}>
            {[...FB_STEPS.map((s) => s.title), "Prüfen und absenden"].map((title, i) => (
              <button key={title} type="button" onClick={() => go(i)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${i === step ? "border-accent bg-accent text-white" : i < FB_STEPS.length && !fehlend(FB_STEPS[i], d).length ? "border-gold text-ink" : "border-line text-muted"}`}>
                {i + 1}. {t(title)}
              </button>
            ))}
          </nav>
          {step < FB_STEPS.length ? (
            <Schritt i={step} d={d} setText={setText} change={change} />
          ) : (
            <section className="card space-y-4">
              <h3 className="h3">{t("Prüfen und absenden")}</h3>
              {FB_STEPS.some((s) => fehlend(s, d).length) && (
                <div className="rounded-xl bg-gold-soft p-3 text-sm">
                  <p className="font-semibold">{t("Noch offen:")}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {FB_STEPS.flatMap((s, i) => fehlend(s, d).map((f) => (
                      <li key={`${s.key}-${f}`}><button type="button" className="underline" onClick={() => go(i)}>{t(s.title)}</button>: {t(f)}</li>
                    )))}
                  </ul>
                </div>
              )}
              <fieldset className="space-y-1.5">
                <legend className="label">{t("Welche Unterlagen kannst du deinem Coach geben?")}</legend>
                {UNTERLAGEN.map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={d.unterlagen.includes(u)} onChange={(e) => change((x) => ({ ...x, unterlagen: e.target.checked ? [...x.unterlagen, u] : x.unterlagen.filter((y) => y !== u) }))} />
                    {t(u)}
                  </label>
                ))}
              </fieldset>
              <Zusammenfassung d={d} />
              {!coach && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
                  <span className="text-xs text-muted">{stand.submitted_at ? t("Du kannst ihn jederzeit ändern und noch einmal schicken.") : t("Du kannst ihn auch unvollständig schicken und später ergänzen.")}</span>
                  <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>{stand.submitted_at ? t("Noch einmal an Coach schicken") : t("An Coach schicken")}</button>
                </div>
              )}
            </section>
          )}
          <div className="flex justify-between gap-3">
            {step > 0 ? <button type="button" className="btn-ghost" onClick={() => go(step - 1)}>← {t("Zurück")}</button> : <span />}
            {step < FB_STEPS.length && <button type="button" className="btn" onClick={() => go(step + 1)}>{t("Weiter")} →</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- ein Schritt ---------- */

function Schritt({ i, d, setText, change }: { i: number; d: FragebogenData; setText: (k: string, v: string) => void; change: (fn: (x: FragebogenData) => FragebogenData) => void }) {
  const t = useT();
  const s = FB_STEPS[i];
  const felder = s.fields.filter((f) => fbSichtbar(f, d)).map((f) => <Feld key={f.k} id={`fb-${f.k}`} f={f} value={d.text[f.k] ?? ""} onChange={(v) => setText(f.k, v)} />);
  return (
    <section className="card space-y-4">
      <div>
        <h3 className="h3">{i + 1}. {t(s.title)}</h3>
        {s.hilfe && <p className="mt-1 text-sm text-muted">{t(s.hilfe)}</p>}
      </div>
      {!s.nachListe && felder}
      {s.liste && <Liste liste={s.liste} d={d} change={change} />}
      {s.nachListe && felder}
    </section>
  );
}

function Feld({ id, f, value, onChange }: { id: string; f: FbField; value: string; onChange: (v: string) => void }) {
  const t = useT();
  const label = (
    <label htmlFor={id} className="label">
      {t(f.label)}{f.pflicht ? " *" : ""}
      {f.hilfe && <span className="block text-xs font-normal text-muted">{t(f.hilfe)}</span>}
    </label>
  );
  let input: ReactNode;
  if (f.typ === "area") input = <textarea id={id} className="input min-h-20 resize-y [field-sizing:content]" value={value} onChange={(e) => onChange(e.target.value)} />;
  else if (f.typ === "wahl")
    input = (
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("– bitte wählen –")}</option>
        {f.optionen?.map((o) => <option key={o} value={o}>{t(o)}</option>)}
      </select>
    );
  else
    input = (
      <div className="relative">
        <input id={id} className={`input ${f.typ === "eur" ? "pr-8" : ""}`} type={f.typ === "datum" ? "date" : "text"} inputMode={f.typ === "zahl" || f.typ === "eur" ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
        {f.typ === "eur" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>}
      </div>
    );
  return <div>{label}{input}</div>;
}

/* ---------- Listen (Leistungen, Kosten, …) ---------- */

type Col = { k: string; label: string; typ?: "eur" | "zahl" | "wahl" | "check"; optionen?: { v: string; l: string }[]; hilfe?: string; breit?: boolean };
const LISTEN: Record<FbListe, { titel: string; neu: string; cols: Col[]; leer: () => object }> = {
  produkte: { titel: "Leistung", neu: "Leistung oder Produkt hinzufügen", leer: neuesProdukt, cols: [
    { k: "name", label: "Bezeichnung", breit: true, hilfe: "z. B. Haarschnitt, Website, Beratungsstunde, Reinigung" },
    { k: "einheit", label: "Abgerechnet pro …", hilfe: "z. B. Auftrag, Stunde, Stück, Termin" },
    { k: "preis", label: "Preis netto je Einheit", typ: "eur" },
    { k: "monatspreis", label: "Monatlicher Preis (Abo, Wartung)", typ: "eur", hilfe: "nur wenn Kunden jeden Monat zahlen" },
    { k: "material", label: "Material / Wareneinsatz in %", typ: "zahl", hilfe: "Anteil vom Preis, den du selbst einkaufst" },
    { k: "j1", label: "Menge im 1. Jahr", typ: "zahl", hilfe: "Einheiten bzw. neue Abo-Kunden" },
    { k: "j2", label: "Menge im 2. Jahr", typ: "zahl" },
    { k: "j3", label: "Menge im 3. Jahr", typ: "zahl" },
    { k: "ab", label: "Erste Umsätze ab Monat Nr.", typ: "zahl", hilfe: "1 = Gründungsmonat" },
    { k: "zahlung", label: "Zahlungsweise", typ: "wahl", optionen: ["sofort / bar / Vorkasse", "auf Rechnung (14 bis 30 Tage)", "Anzahlung und Rest bei Abnahme"].map((v) => ({ v, l: v })) },
  ] },
  wettbewerber: { titel: "Wettbewerber", neu: "Wettbewerber hinzufügen", leer: neuerWettbewerber, cols: [
    { k: "name", label: "Name und Ort", breit: true }, { k: "preise", label: "Preise" }, { k: "staerken", label: "Stärken" }, { k: "vorteil", label: "Dein Vorteil" },
  ] },
  kosten: { titel: "Kostenart", neu: "Weitere Kostenart hinzufügen", leer: neueKosten, cols: [
    { k: "name", label: "Kostenart", breit: true },
    { k: "betrag", label: "Betrag netto", typ: "eur" },
    { k: "rhythmus", label: "Wie oft?", typ: "wahl", optionen: [{ v: "monatlich", l: "monatlich" }, { v: "jaehrlich", l: "jährlich" }, { v: "einmalig", l: "einmalig" }] },
    { k: "monat", label: "Monat", hilfe: "jährlich: z. B. Dezember; einmalig: Monat Nr." },
    { k: "kategorie", label: "Bereich", typ: "wahl", optionen: FB_KATEGORIEN.map((v) => ({ v, l: v })) },
  ] },
  investitionen: { titel: "Anschaffung", neu: "Anschaffung hinzufügen", leer: neueInvestition, cols: [
    { k: "name", label: "Was?", breit: true }, { k: "betrag", label: "Betrag netto", typ: "eur" }, { k: "monat", label: "Wann? (Monat Nr.)", typ: "zahl" },
    { k: "zweck", label: "Wofür im Betrieb?", breit: true }, { k: "sachgut", label: "über Sachgüterförderung beantragen", typ: "check" },
  ] },
  privat: { titel: "Position", neu: "Weitere Position hinzufügen", leer: neueZeile, cols: [
    { k: "name", label: "Position", breit: true }, { k: "betrag", label: "Betrag pro Monat", typ: "eur" },
  ] },
};

function Liste({ liste, d, change }: { liste: FbListe; d: FragebogenData; change: (fn: (x: FragebogenData) => FragebogenData) => void }) {
  const t = useT();
  const def = LISTEN[liste];
  const rows = d[liste] as unknown as Record<string, string | boolean>[];
  const kompakt = liste === "kosten" || liste === "privat";
  const set = (i: number, k: string, v: string | boolean) =>
    change((x) => {
      (x[liste] as unknown as Record<string, string | boolean>[])[i][k] = v;
      return x;
    });
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className={`relative rounded-2xl border border-line-soft bg-surface-2/40 p-3 sm:p-4 ${kompakt ? "" : "border-l-4 border-l-accent"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t(def.titel)} {i + 1}</span>
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => change((x) => ({ ...x, [liste]: (x[liste] as unknown[]).filter((_, j) => j !== i) }))}>{t("Entfernen")}</button>
          </div>
          <div className={`grid gap-3 ${kompakt ? "sm:grid-cols-[2fr_1fr_1fr_1fr_1.4fr]" : "sm:grid-cols-2"}`}>
            {def.cols.map((c) => {
              const id = `fb-${liste}-${i}-${c.k}`;
              if (c.typ === "check")
                return (
                  <label key={c.k} className="flex items-center gap-2 self-end text-sm">
                    <input type="checkbox" checked={Boolean(r[c.k])} onChange={(e) => set(i, c.k, e.target.checked)} /> {t(c.label)}
                  </label>
                );
              return (
                <div key={c.k} className={!kompakt && c.breit ? "sm:col-span-2" : ""}>
                  <label htmlFor={id} className="mb-1 block text-xs font-semibold">
                    {t(c.label)}
                    {c.hilfe && !kompakt && <span className="block font-normal text-muted">{t(c.hilfe)}</span>}
                  </label>
                  {c.typ === "wahl" ? (
                    <select id={id} className="input" value={String(r[c.k] ?? "")} onChange={(e) => set(i, c.k, e.target.value)}>
                      {c.k === "zahlung" && <option value="">{t("– bitte wählen –")}</option>}
                      {c.optionen?.map((o) => <option key={o.v} value={o.v}>{t(o.l)}</option>)}
                    </select>
                  ) : (
                    <div className="relative">
                      <input id={id} className={`input ${c.typ === "eur" ? "pr-8" : ""}`} inputMode={c.typ ? "decimal" : undefined} value={String(r[c.k] ?? "")} placeholder={kompakt && c.hilfe ? t(c.hilfe) : undefined} onChange={(e) => set(i, c.k, e.target.value)} />
                      {c.typ === "eur" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => change((x) => ({ ...x, [liste]: [...(x[liste] as unknown[]), def.leer()] }))}>+ {t(def.neu)}</button>
    </div>
  );
}

/* ---------- Zusammenfassung ---------- */

function Zusammenfassung({ d }: { d: FragebogenData }) {
  const t = useT();
  const text = fragebogenText(d);
  if (!text) return <p className="card text-sm text-muted">{t("Noch keine Antworten.")}</p>;
  return (
    <section className="card space-y-4">
      {text.split("\n\n").map((block) => {
        const [title, ...lines] = block.split("\n");
        return (
          <div key={title}>
            <h4 className="h3 mb-1.5">{t(title.replace(/^## /, ""))}</h4>
            <ul className="space-y-1 text-sm">
              {lines.map((l, i) => {
                const raw = l.replace(/^- /, "");
                const cut = raw.indexOf(": ");
                return <li key={i}>{cut > 0 ? <><span className="text-muted">{raw.slice(0, cut)}:</span> {raw.slice(cut + 2)}</> : raw}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
