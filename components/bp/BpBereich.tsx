"use client";
import { useSearchParams } from "next/navigation";
import { useRef, type ComponentProps, type ReactNode } from "react";
import type { BankInfo } from "@/lib/bp/bank";
import type { Sections } from "@/lib/bp/sections";
import { BUNDESWEIT, FOERDER_STAND, landOf } from "@/lib/bp/foerderung";
import { FoerderView, KrediteView, useAbgaben, useBank, type Abgabe, type Zahlen } from "./BankAbgabe";
import { PlanEditor } from "./PlanEditor";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Einstieg in den Businessplan: vier große Kacheln (fürs Amt, für die Bank, Förderungen, Kredite).
 * Angetippt geht es in den Bereich, „Zur Übersicht“ führt zurück. Der Bereich steht in der Adresse (?bereich=…).
 */

type Area = "amt" | "bank" | "foerderung" | "kredite";
const AREAS: Area[] = ["amt", "bank", "foerderung", "kredite"];

type EditorProps = Omit<ComponentProps<typeof PlanEditor>, "mode" | "onBack" | "bankState" | "abgaben">;

export function BpBereich(p: EditorProps & { bank: BankInfo; cityLand: string; bankHref: string; abgabeHref: string; abgaben: Abgabe[]; zahlen: Zahlen; doneCount: number; chapterCount: number; bankSections: Sections; bankDone: number; bankCount: number }) {
  const t = useT();
  const sp = useSearchParams();
  const raw = sp.get("bereich");
  const area = AREAS.includes(raw as Area) ? (raw as Area) : null;
  const bank = useBank(p.bankHref, p.bank, p.cityLand);
  const abgaben = useAbgaben(p.abgabeHref, p.abgaben);
  const top = useRef<HTMLDivElement>(null);

  function go(next: Area | null) {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("bereich", next);
    else url.searchParams.delete("bereich");
    window.history.pushState(null, "", url);
    // an den Anfang des Bereichs springen (die Akte darüber ist lang)
    requestAnimationFrame(() => {
      const y = (top.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, y) });
    });
  }

  const { bank: _b, cityLand: _c, bankHref: _h, abgabeHref: _a, abgaben: _l, zahlen: _z, doneCount: _d, chapterCount: _n, bankSections, bankDone: _bd, bankCount: _bc, ...editor } = p;
  void [_b, _c, _h, _a, _l, _z, _d, _n, _bd, _bc];

  const anchor = <div ref={top} className="h-0" aria-hidden />;
  if (area === "amt" || area === "bank") return <>{anchor}<PlanEditor {...editor} sections={area === "bank" ? bankSections : editor.sections} key={area} mode={area} onBack={() => go(null)} bankState={bank} abgaben={abgaben} /></>;

  if (area === "foerderung" || area === "kredite") {
    return (
      <div className="space-y-4">
        {anchor}
        <section className="card overflow-hidden !p-0">
          <div className="space-y-2 bg-accent px-4 py-4 text-white sm:px-6">
            <button type="button" className="text-sm text-white/80 hover:text-white" onClick={() => go(null)}>← {t("Zur Übersicht")}</button>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-soft">{p.name}</p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{area === "kredite" ? t("Kredite") : t("Förderungen")}</h2>
            <p className="text-sm text-white/75">{area === "kredite" ? t("Förderkredite mit aktuellen Zinsen, Ablauf und Unterlagen. Zum Lesen einfach antippen.") : t("Zuschüsse, Bürgschaften und Beratung im Bundesland und bundesweit. Zum Lesen einfach antippen.")}</p>
          </div>
        </section>
        {area === "kredite" ? <KrediteView bank={bank} zahlen={p.zahlen} /> : <FoerderView bank={bank} />}
      </div>
    );
  }

  const land = landOf(bank.b.land);
  const lastOf = (k: Abgabe["kind"]) => abgaben.list.find((a) => a.kind === k);
  const when = (a?: Abgabe) => (a ? t("Abgegeben am {zeit}", { zeit: new Date(a.created_at).toLocaleDateString("de-DE") }) : t("Noch nicht abgegeben"));
  const answered = bank.b.fragen.filter((f) => f.antwort.trim()).length;
  const foerderCount = [...BUNDESWEIT, ...(land?.programme ?? [])].filter((x) => x.art !== "Kredit").length;
  const kreditCount = [...BUNDESWEIT, ...(land?.programme ?? [])].filter((x) => x.art === "Kredit").length;

  return (
    <>
    {anchor}
    <div className="grid gap-4 sm:grid-cols-2">
      <Tile icon={<IconAmt />} title={t("Businessplan fürs Amt")} text={t("Für Jobcenter und Agentur für Arbeit: Gründungszuschuss, Einstiegsgeld")} onClick={() => go("amt")}
        foot={<><span>{t("{a} von {b} Kapiteln fertig", { a: p.doneCount, b: p.chapterCount })}</span><span className={lastOf("fachstelle") ? "text-ok" : ""}>{when(lastOf("fachstelle"))}</span></>} />
      <Tile icon={<IconBank />} title={t("Businessplan für die Bank")} text={t("Für Kreditantrag und KfW: mit Kapitaldienst, Tilgungsplan und Fragen fürs Bankgespräch")} onClick={() => go("bank")}
        foot={<><span>{t("{a} von {b} Kapiteln fertig", { a: p.bankDone, b: p.bankCount })} · {t("{a} von {b} Bankfragen beantwortet", { a: answered, b: bank.b.fragen.length })}</span><span className={lastOf("bank") ? "text-ok" : ""}>{when(lastOf("bank"))}</span></>} />
      <Tile icon={<IconFoerder />} title={t("Förderungen")} text={land ? t("Zuschüsse und Programme in {land} und bundesweit", { land: land.name }) : t("Zuschüsse und Programme im Bundesland und bundesweit")} onClick={() => go("foerderung")}
        foot={<span>{t("{n} Programme", { n: foerderCount })}</span>} />
      <Tile icon={<IconKredit />} title={t("Kredite")} text={t("Förderkredite mit aktuellen Zinsen, Ablauf und Unterlagen für die Bank")} onClick={() => go("kredite")}
        foot={<><span>{t("{n} Kredite", { n: kreditCount })}</span><span>{t("Stand {stand}", { stand: FOERDER_STAND })}</span></>} />
    </div>
    </>
  );
}

function Tile({ icon, title, text, foot, onClick }: { icon: ReactNode; title: string; text: string; foot: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card card-hover group flex flex-col gap-3 text-left">
      <span className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-gold-soft shadow-sm">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-[family-name:var(--font-display)] text-lg font-bold leading-tight">{title}</span>
          <span className="mt-1 block text-sm text-muted">{text}</span>
        </span>
        <span className="mt-1 text-xl text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden>→</span>
      </span>
      <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-xs font-medium text-muted">{foot}</span>
    </button>
  );
}

const svg = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const IconAmt = () => <svg {...svg}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>;
const IconBank = () => <svg {...svg}><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>;
const IconFoerder = () => <svg {...svg}><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" /></svg>;
const IconKredit = () => <svg {...svg}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></svg>;
