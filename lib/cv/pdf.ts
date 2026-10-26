import "server-only";
import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
import { fitScript } from "../letter/fit";
import { paginateScript } from "./paginate";

/*
 * PDF über ein Chromium im Container (Dockerfile: apk add chromium; Pfad über CHROMIUM_PATH oder die üblichen Orte).
 * Der Browser läuft ohne JavaScript und ohne Netzzugriff: Schriften und Foto stecken schon im HTML.
 */
const globalForBrowser = globalThis as unknown as { cvBrowser?: Promise<Browser> };

async function browser() {
  const existing = globalForBrowser.cvBrowser;
  if (existing) {
    const b = await existing.catch(() => null);
    if (b?.isConnected()) return b;
  }
  const { chromium } = await import("playwright-core");
  const launching = chromium.launch({
    executablePath: [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && existsSync(p)),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
  globalForBrowser.cvBrowser = launching;
  return launching;
}

/**
 * paginate: Lebenslauf-Seitenaufteilung wie in der Vorschau (siehe paginate.ts).
 * fitOnePage: Anschreiben so setzen, dass es auf eine Seite passt (siehe lib/letter/fit.ts).
 */
export async function htmlToPdf(html: string, opts: { paginate?: boolean; fitOnePage?: boolean } = {}) {
  const b = await browser();
  const context = await b.newContext({ javaScriptEnabled: false, viewport: { width: 794, height: 1123 } });
  try {
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready").catch(() => {});
    if (opts.paginate) {
      await page.emulateMedia({ media: "print" });
      await page.evaluate(paginateScript(true));
    }
    // Ausmessen in der Bildschirmansicht: dort hat die Seite schon die Breite von A4 mit Rändern, beim Drucken bleibt die Stufe
    if (opts.fitOnePage) await page.evaluate(fitScript());
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}

/** Stufe, mit der das Anschreiben auf eine Seite passt (für die Word-Datei, die selbst nicht messen kann) */
export async function measureLetterFit(html: string): Promise<{ level: number; overflow: boolean }> {
  const b = await browser();
  const context = await b.newContext({ javaScriptEnabled: false, viewport: { width: 794, height: 1123 } });
  try {
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready").catch(() => {});
    return (await page.evaluate(fitScript())) as { level: number; overflow: boolean };
  } finally {
    await context.close();
  }
}
