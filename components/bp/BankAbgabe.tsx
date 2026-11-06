"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { BankInfo } from "@/lib/bp/bank";
import {
  AMT_ABLAUF, AMT_UNTERLAGEN, AMT_VORAUSSETZUNGEN, BANK_ABLAUF, BANK_UNTERLAGEN, BANK_VORAUSSETZUNGEN, BUNDESWEIT, FOERDER_STAND, LAENDER, landOf, type Programm,
} from "@/lib/bp/foerderung";
import { Num } from "./fields";
import { useAutosave } from "./useAutosave";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Bausteine für die Bereiche „Businessplan fürs Amt“, „für die Bank“, „Förderungen“ und „Kredite“:
 * Abgabe, Bankangaben, Fragen fürs Bankgespräch und Infos zum Antippen (statt PDF).
 */

export type Kind = "fachstelle" | "bank";
export type Abgabe = { id: string; kind: Kind; created_at: string; by: string | null; files: { id: string; title: string }[] };
/** Eigene Zahlen für die Kredit-Infos, auf dem Server berechnet */
export type Zahlen = { kapitalbedarf: number; eigenmittel: number; loans: { label: string; amount: number; rate: number; years: number; monatsrate: number }[]; jahre: { jahr: number; verfuegbar: number; dienst: number; deckung: number | null }[] } | null;

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const post = (href: string, body: unknown) => fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

/* ---------- Bankangaben: ein Zustand für alle Bereiche ---------- */

export function useBank(href: string, initial: BankInfo, cityLand: string) {
  const [b, setB] = useState<BankInfo>(() => ({ ...initial, land: initial.land || cityLand }));
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(b);
  useEffect(() => {
    latest.current = b;
  }, [b]);
  const { state, schedule, save } = useAutosave(async () => {
    const res = (await post(href, { save: latest.current })) as { bank?: BankInfo; error?: string };
    return res.bank ? { ok: true } : { ok: false, error: res.error };
  });
  // Bundesland aus dem Wohnort einmal speichern
  const once = useRef(false);
  useEffect(() => {
    if (!once.current && !initial.land && cityLand) {
      once.current = true;
      schedule();
    }
  }, [initial.land, cityLand, schedule]);
  const set = (patch: Partial<BankInfo>) => {
    setB((x) => ({ ...x, ...patch }));
    schedule();
  };
  async function draft(all: boolean) {
    setDrafting(true);
    setError(null);
    await save();
    const out = (await post(href, { draft: true, all }).catch(() => ({ error: "Keine Verbindung." }))) as { bank?: BankInfo; error?: string };
    setDrafting(false);
    if (out.bank) setB(out.bank);
    if (out.error) setError(out.error);
  }
  return { b, set, state, draft, drafting, error };
}
export type BankState = ReturnType<typeof useBank>;

/* ---------- Infos zum Antippen ---------- */

export type Info = { key: string; title: string; sub?: string; badge?: string; body: ReactNode };

/** Kacheln; angetippt klappt direkt darunter die Info auf (immer nur eine) */
export function InfoGrid({ items }: { items: Info[] }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <Fragment key={i.key}>
          <button
            type="button"
            aria-expanded={open === i.key}
            onClick={() => setOpen(open === i.key ? null : i.key)}
            className={`flex min-h-16 items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${open === i.key ? "border-accent bg-tint" : "border-line-soft bg-surface hover:border-accent/50"}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug">{i.title}</span>
              {i.sub && <span className="mt-0.5 block text-xs text-muted">{i.sub}</span>}
            </span>
            {i.badge && <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">{i.badge}</span>}
            <span className={`shrink-0 text-muted transition ${open === i.key ? "rotate-90" : ""}`} aria-hidden>›</span>
          </button>
          {open === i.key && (
            <div className="col-span-full rounded-xl border border-accent/30 bg-surface p-4 text-sm leading-relaxed" role="region" aria-label={i.title}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <h4 className="font-semibold">{i.title}</h4>
                <button type="button" className="text-muted hover:text-ink" aria-label={t("Schließen")} onClick={() => setOpen(null)}>✕</button>
              </div>
              {i.body}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

const Steps = ({ list }: { list: { titel: string; text: string }[] }) => (
  <ol className="space-y-2.5">
    {list.map((s, i) => (
      <li key={s.titel} className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
        <span><span className="font-semibold">{s.titel}:</span> {s.text}</span>
      </li>
    ))}
  </ol>
);
const Bullets = ({ list, check }: { list: string[]; check?: boolean }) => (
  <ul className="space-y-1.5">{list.map((x) => <li key={x} className="flex gap-2"><span className="text-accent" aria-hidden>{check ? "☐" : "•"}</span><span>{x}</span></li>)}</ul>
);

function programmInfo(p: Programm): Info {
  return {
    key: p.name,
    title: p.name,
    sub: p.zins ? p.zins.split(";")[0] : p.wo,
    badge: p.art,
    body: (
      <div className="space-y-2">
        <p>{p.text}</p>
        {p.zins && <p className="rounded-lg bg-tint px-3 py-2 font-semibold text-accent">Zins: {p.zins}</p>}
        <p className="text-muted"><span className="font-semibold text-ink">Wo beantragen:</span> {p.wo}</p>
        {p.url && <a className="link" href={p.url} target="_blank" rel="noreferrer">Zur Website ↗</a>}
      </div>
    ),
  };
}

export function LandSelect({ bank }: { bank: BankState }) {
  const t = useT();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{t("Bundesland")}</span>
      <select className="input !w-auto !py-1.5" value={bank.b.land} onChange={(e) => bank.set({ land: e.target.value })}>
        <option value="">{t("Bitte wählen")}</option>
        {LAENDER.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
      </select>
    </label>
  );
}

const Stand = () => {
  const t = useT();
  return <p className="text-xs text-muted">{t("Stand der Zinsen und Programme: {stand}. Verbindlich ist der Zins am Tag der Zusage.", { stand: FOERDER_STAND })}</p>;
};

/** Bereich „Förderungen“: Zuschüsse, Bürgschaften, Beratung, Beteiligungen im Land und bundesweit */
export function FoerderView({ bank }: { bank: BankState }) {
  const t = useT();
  const land = landOf(bank.b.land);
  const notKredit = (p: Programm) => p.art !== "Kredit";
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="h3">{land ? t("Förderung in {land}", { land: land.name }) : t("Förderung im Bundesland")}</h3>
          <LandSelect bank={bank} />
        </div>
        {land ? (
          <>
            <p className="text-sm text-muted">{t("Förderbank")}: <a className="link" href={land.url} target="_blank" rel="noreferrer">{land.bank}</a> · {t("Bürgschaften")}: {land.buergschaft}</p>
            <InfoGrid items={land.programme.filter(notKredit).map(programmInfo)} />
          </>
        ) : (
          <p className="text-sm text-muted">{t("Bundesland wählen, dann erscheinen hier die Programme des Landes.")}</p>
        )}
      </div>
      <div className="card space-y-4">
        <h3 className="h3">{t("Bundesweite Förderung")}</h3>
        <InfoGrid items={BUNDESWEIT.filter(notKredit).map(programmInfo)} />
        <Stand />
      </div>
    </div>
  );
}

/** Bereich „Kredite“: Förderkredite mit Zinsen, Ablauf, Voraussetzungen, Unterlagen, eigene Zahlen */
export function KrediteView({ bank, zahlen }: { bank: BankState; zahlen: Zahlen }) {
  const t = useT();
  const land = landOf(bank.b.land);
  const kredite = [...BUNDESWEIT, ...(land?.programme ?? [])].filter((p) => p.art === "Kredit");
  const weak = zahlen?.jahre.some((k) => k.deckung !== null && k.deckung < 1.2);
  const basics: Info[] = [
    { key: "ablauf", title: t("So läuft der Kreditantrag"), sub: t("6 Schritte von den Unterlagen bis zum Geld"), body: <Steps list={BANK_ABLAUF} /> },
    { key: "voraus", title: t("Voraussetzungen"), sub: t("Was erfüllt sein muss"), body: <Bullets list={BANK_VORAUSSETZUNGEN} /> },
    { key: "unterlagen", title: t("Unterlagen für die Bank"), sub: t("Checkliste zum Mitnehmen"), body: <Bullets list={BANK_UNTERLAGEN} check /> },
    {
      key: "zahlen",
      title: t("Deine Zahlen"),
      sub: zahlen ? t("Kapitalbedarf {betrag}", { betrag: eur(zahlen.kapitalbedarf) }) : t("Noch kein Finanzplan"),
      body: zahlen ? (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            <li className="flex flex-wrap justify-between gap-x-4"><span>{t("Kapitalbedarf")}</span><span className="font-semibold tabular-nums">{eur(zahlen.kapitalbedarf)}</span></li>
            <li className="flex flex-wrap justify-between gap-x-4"><span>{t("Eigenmittel")}</span><span className="font-semibold tabular-nums">{eur(zahlen.eigenmittel)}{zahlen.kapitalbedarf > 0 ? ` (${Math.round((zahlen.eigenmittel / zahlen.kapitalbedarf) * 100)} %)` : ""}</span></li>
            {zahlen.loans.map((l) => (
              <li key={l.label} className="flex flex-wrap justify-between gap-x-4"><span>{l.label}</span><span className="tabular-nums">{eur(l.amount)} · {l.rate.toLocaleString("de-DE")} % · {l.years} J. · {t("Rate ca. {rate}", { rate: eur(l.monatsrate) })}</span></li>
            ))}
          </ul>
          <div>
            <p className="mb-1 font-semibold">{t("Kann der Kredit bezahlt werden?")}</p>
            <ul className="space-y-1">
              {zahlen.jahre.map((k) => (
                <li key={k.jahr} className="flex flex-wrap justify-between gap-2 rounded-lg bg-bg px-3 py-1.5">
                  <span>{t("Jahr {n}", { n: k.jahr })}</span>
                  <span className="tabular-nums">{t("{a} verfügbar für {b} Zins und Tilgung", { a: eur(k.verfuegbar), b: eur(k.dienst) })}{k.deckung !== null && <span className={`ml-2 font-semibold ${k.deckung >= 1.2 ? "text-ok" : "text-danger"}`}>{k.deckung.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</span>}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-xs ${weak ? "text-danger" : "text-muted"}`}>{weak ? t("Banken erwarten einen Deckungsgrad von mindestens 1,2 (20 % Puffer). Entnahme, Kosten, Laufzeit oder tilgungsfreie Zeit prüfen.") : t("Deckungsgrad = verfügbar geteilt durch Zins und Tilgung. Banken erwarten mindestens 1,2.")}</p>
          </div>
        </div>
      ) : <p className="text-muted">{t("Sobald der Finanzplan Zahlen hat, steht hier, ob Zins und Tilgung bezahlt werden können.")}</p>,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h3 className="h3">{t("Was du für einen Kredit wissen musst")}</h3>
        <InfoGrid items={basics} />
      </div>
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="h3">{t("Förderkredite mit aktuellen Zinsen")}</h3>
          <LandSelect bank={bank} />
        </div>
        <InfoGrid items={kredite.map(programmInfo)} />
        <Stand />
      </div>
    </div>
  );
}

/** Infos im Bereich „Businessplan fürs Amt“ */
export function AmtInfos() {
  const t = useT();
  const gz = BUNDESWEIT.filter((p) => /Gründungszuschuss|Einstiegsgeld/.test(p.name));
  return (
    <InfoGrid
      items={[
        { key: "ablauf", title: t("So läuft der Antrag beim Amt"), sub: t("Von der Beratung bis zur Entscheidung"), body: <Steps list={AMT_ABLAUF} /> },
        { key: "voraus", title: t("Voraussetzungen"), sub: t("Was erfüllt sein muss"), body: <Bullets list={AMT_VORAUSSETZUNGEN} /> },
        { key: "unterlagen", title: t("Unterlagen fürs Amt"), sub: t("Checkliste zum Mitnehmen"), body: <Bullets list={AMT_UNTERLAGEN} check /> },
        ...gz.map(programmInfo),
      ]}
    />
  );
}

/* ---------- Bankangaben und Bankgespräch ---------- */

export function BankAngaben({ bank }: { bank: BankState }) {
  const t = useT();
  const { b, set } = bank;
  const rows = <K extends "vermoegen" | "verbindlichkeiten">(k: K, i: number, patch: Partial<BankInfo[K][number]>) => set({ [k]: b[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<BankInfo>);
  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <h3 className="h3">{t("Angaben für die Bank")}</h3>
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
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-2">
          <h3 className="h3">{t("Privates Vermögen")}</h3>
          {b.vermoegen.map((x, i) => (
            <div key={i} className="flex items-end gap-2">
              <label className="block min-w-0 flex-1"><span className="mb-1 block text-xs font-medium text-muted">{t("Was")}</span><input className="input !py-2" value={x.label} onChange={(e) => rows("vermoegen", i, { label: e.target.value })} /></label>
              <Num label="Wert" suffix="€" digits={0} className="w-32" value={x.betrag} onChange={(n) => rows("vermoegen", i, { betrag: n })} />
              <button type="button" className="mb-1.5 text-muted hover:text-danger" aria-label={t("Entfernen")} onClick={() => set({ vermoegen: b.vermoegen.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => set({ vermoegen: [...b.vermoegen, { label: "", betrag: 0 }] })}>+ {t("Vermögen")}</button>
        </div>
        <div className="card space-y-2">
          <h3 className="h3">{t("Private Verbindlichkeiten")}</h3>
          {b.verbindlichkeiten.map((x, i) => (
            <div key={i} className="flex items-end gap-2">
              <label className="block min-w-0 flex-1"><span className="mb-1 block text-xs font-medium text-muted">{t("Was")}</span><input className="input !py-2" value={x.label} onChange={(e) => rows("verbindlichkeiten", i, { label: e.target.value })} /></label>
              <Num label="Restschuld" suffix="€" digits={0} className="w-28" value={x.betrag} onChange={(n) => rows("verbindlichkeiten", i, { betrag: n })} />
              <Num label="Rate/Monat" suffix="€" digits={0} className="w-24" value={x.rate} onChange={(n) => rows("verbindlichkeiten", i, { rate: n })} />
              <button type="button" className="mb-1.5 text-muted hover:text-danger" aria-label={t("Entfernen")} onClick={() => set({ verbindlichkeiten: b.verbindlichkeiten.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => set({ verbindlichkeiten: [...b.verbindlichkeiten, { label: "", betrag: 0, rate: 0 }] })}>+ {t("Verbindlichkeit")}</button>
        </div>
      </div>
    </div>
  );
}

export function BankFragen({ bank, ai }: { bank: BankState; ai: boolean }) {
  const t = useT();
  const { b, set } = bank;
  const open = b.fragen.filter((f) => !f.antwort.trim()).length;
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="h3">{t("Fragen und Antworten fürs Bankgespräch")}</h3>
          <p className="text-sm text-muted">{t("{a} von {b} Fragen beantwortet", { a: b.fragen.length - open, b: b.fragen.length })}</p>
        </div>
        {ai && (
          <span className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={bank.drafting || !open} onClick={() => void bank.draft(false)}>{bank.drafting ? "Entwirft …" : `✦ Offene Antworten entwerfen (${open})`}</button>
            <button type="button" className="btn-ghost btn-sm" disabled={bank.drafting} onClick={() => void bank.draft(true)}>✦ Alle neu entwerfen</button>
          </span>
        )}
      </div>
      {bank.error && <p className="text-sm text-danger" role="alert">{bank.error}</p>}
      <ol className="space-y-3">
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
  );
}

/* ---------- Abgabe ---------- */

export function useAbgaben(href: string, initial: Abgabe[]) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(kind: Kind) {
    setBusy(kind);
    setError(null);
    const res = (await post(href, { kind }).catch(() => ({ error: "Keine Verbindung." }))) as { abgaben?: Abgabe[]; error?: string };
    setBusy(null);
    if (res.abgaben) setList(res.abgaben);
    if (res.error) setError(res.error);
  }
  return { list, busy, error, submit };
}
export type AbgabenState = ReturnType<typeof useAbgaben>;

export const fileLabel = (title: string) => (/Leitfaden/.test(title) ? "Leitfaden" : /Finanzplan/.test(title) ? "Finanzplan (Excel)" : "Businessplan (PDF)");
export const fileHref = (f: { id: string; title: string }) => `/api/dateien/${f.id}${/Finanzplan/.test(f.title) ? "?download" : ""}`;
