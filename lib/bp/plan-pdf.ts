import "server-only";
import { htmlToPdf } from "../cv/pdf";
import type { BankInfo } from "./bank";
import { financeIsEmpty, type FinanceInput } from "./finance";
import { renderPlanHtml, tocTargets } from "./render";
import type { GlanceItem, Sections } from "./sections";

type Meta = Parameters<typeof renderPlanHtml>[3];

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Seite jeder Überschrift im fertigen PDF (1 = Deckblatt, wie die Seitenzahl unten rechts) */
async function findPages(pdf: Uint8Array, targets: { key: string; heading: string }[]) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: false });
  const pages = (text as string[]).map(norm);
  const tocPage = pages.findIndex((p) => p.includes("Inhaltsverzeichnis"));
  let from = tocPage >= 0 ? tocPage + 1 : 1;
  const out: Record<string, number> = {};
  for (const t of targets) {
    const i = pages.findIndex((p, k) => k >= from && p.includes(norm(t.heading)));
    if (i < 0) continue;
    out[t.key] = i + 1;
    from = i;
  }
  return out;
}

/**
 * Businessplan als PDF mit Seitenzahlen im Inhaltsverzeichnis: erst ohne Zahlen erzeugen, die Seiten der Überschriften
 * auslesen, dann mit Zahlen noch einmal. Die Zahlen nehmen keinen zusätzlichen Platz ein, die Seiten bleiben gleich.
 */
export async function planPdf(sections: Sections, glance: GlanceItem[], finance: FinanceInput, meta: Meta, fontCss: string, opts: { bank?: BankInfo } = {}) {
  const first = await htmlToPdf(renderPlanHtml(sections, glance, finance, meta, fontCss, {}, opts));
  const pages = await findPages(first, tocTargets(!financeIsEmpty(finance), Boolean(opts.bank))).catch((e) => {
    console.error("Seitenzahlen für das Inhaltsverzeichnis", e);
    return null;
  });
  if (!pages || !Object.keys(pages).length) return first;
  return htmlToPdf(renderPlanHtml(sections, glance, finance, meta, fontCss, pages, opts));
}
