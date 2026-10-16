import "server-only";
import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
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

/** paginate: Lebenslauf-Seitenaufteilung wie in der Vorschau (siehe paginate.ts) */
export async function htmlToPdf(html: string, opts: { paginate?: boolean } = {}) {
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
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}
