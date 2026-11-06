"use client";
import { isStandalone } from "../app/RegisterSW";

/** Adresse der Ansicht im Portal (mit „Zurück“-Knopf) */
export const viewerHref = (href: string, name = "") => `/ansehen?src=${encodeURIComponent(href)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;

/**
 * Datei öffnen, nachdem vorher gespeichert wurde. PDFs zum Ansehen und in der App vom Home-Bildschirm alle Dateien
 * öffnen in der Ansicht im Portal (mit „Zurück“); Word und Excel am Rechner laden direkt herunter.
 */
export async function openFile(href: string, before?: () => Promise<unknown>, view = false) {
  if (before) await before().catch(() => undefined);
  if (view || isStandalone()) {
    window.location.href = viewerHref(href);
    return;
  }
  const a = document.createElement("a");
  a.href = href;
  a.click();
}
