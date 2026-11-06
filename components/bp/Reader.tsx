"use client";
import { Fragment } from "react";
import type { SectionDef, GlanceItem, Sections } from "@/lib/bp/sections";
import { Markdown } from "../assistant/Markdown";
import { FiguresTable } from "./PlanEditor";
import { openFile } from "./openFile";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Ansicht für den Coachee: der Businessplan (fürs Amt oder für die Bank) und der Finanzplan nur zum Lesen.
 * Bearbeiten kann nur der Coach.
 */

export function PlanReader({ heading, title, name, defs, sections, glance, figures, pdfHref, onBack }: { heading: string; title: string; name: string; defs: SectionDef[]; sections: Sections; glance: GlanceItem[]; figures: string[][] | null; pdfHref: string; onBack: () => void }) {
  const t = useT();
  const written = defs.filter((d) => sections[d.key]?.text.trim());
  const items = glance.filter((g) => g.label.trim() && g.value.trim());
  return (
    <div className="space-y-4">
      <section className="card overflow-hidden !p-0">
        <div className="space-y-3 bg-accent px-4 py-4 text-white sm:px-6">
          <button type="button" className="text-sm text-white/80 hover:text-white" onClick={onBack}>← {t("Zur Übersicht")}</button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-soft">{heading}</p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight text-balance">{title || name}</h2>
            {title && <p className="text-sm text-white/75">{name}</p>}
          </div>
          <p className="text-sm text-white/80">{t("{a} von {b} Kapiteln geschrieben. Dein Coach bearbeitet den Plan, du kannst ihn hier lesen.", { a: written.length, b: defs.length })}</p>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-6">
          <button type="button" className="btn" disabled={!written.length} onClick={() => void openFile(pdfHref, undefined, true)}>{t("PDF ansehen")}</button>
        </div>
      </section>

      {!written.length ? (
        <p className="card text-sm text-muted">{t("Dein Coach schreibt diesen Plan gerade. Sobald es etwas zu lesen gibt, steht es hier.")}</p>
      ) : (
        <>
          <nav className="card !p-4" aria-label={t("Inhalt")}>
            <p className="eyebrow mb-2">{t("Inhalt")}</p>
            <ol className="grid gap-1 text-sm sm:grid-cols-2">
              {defs.map((d, i) => (
                <li key={d.key}>
                  <a href={`#k-${d.key}`} className={sections[d.key]?.text.trim() ? "link" : "text-muted"}>{i + 1}. {t(d.title)}</a>
                </li>
              ))}
            </ol>
          </nav>
          {items.length > 0 && (
            <section className="card space-y-2">
              <h3 className="h3">{t("Auf einen Blick")}</h3>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
                {items.map((g, i) => <Fragment key={i}><dt className="font-semibold">{g.label}</dt><dd className="whitespace-pre-wrap text-muted">{g.value}</dd></Fragment>)}
              </dl>
            </section>
          )}
          {defs.map((d, i) => {
            const text = sections[d.key]?.text.trim();
            return (
              <section key={d.key} id={`k-${d.key}`} className="card scroll-mt-24 space-y-3">
                <h3 className="h2">{i + 1}. {t(d.title)}</h3>
                {text ? <div className="bp-text text-[15px] leading-relaxed"><Markdown text={text} /></div> : <p className="text-sm italic text-muted">{t("Dein Coach schreibt diesen Teil noch.")}</p>}
                {(d.key === "finanzen" || d.key === "rentabilitaet") && figures && <FiguresTable rows={figures} />}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export function FinanceReader({ figures, pdfHref, excelHref }: { figures: string[][] | null; pdfHref: string; excelHref: string }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={!figures} onClick={() => void openFile(`${pdfHref}?ansehen`, undefined, true)}>{t("Businessplan mit Finanzplan ansehen")}</button>
          <button type="button" className="btn-ghost" disabled={!figures} onClick={() => void openFile(excelHref)}>{t("Finanzplan (Excel)")}</button>
        </div>
      </section>
      <section className="card">
        <h3 className="h3">{t("Die wichtigsten Zahlen")}</h3>
        {figures ? <FiguresTable rows={figures} /> : <p className="mt-2 text-sm text-muted">{t("Dein Coach trägt die Zahlen gerade ein. Sobald es etwas zu sehen gibt, steht es hier.")}</p>}
      </section>
    </div>
  );
}
