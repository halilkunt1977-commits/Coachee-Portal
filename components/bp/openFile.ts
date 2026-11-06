"use client";
import { isStandalone } from "../app/RegisterSW";

/**
 * Datei öffnen, nachdem vorher gespeichert wurde. PDFs zum Ansehen und alles in der App vom Home-Bildschirm
 * öffnen in einem eigenen Fenster (dort gibt es „Fertig“ zurück ins Portal); Word und Excel am Rechner laden direkt herunter.
 */
export async function openFile(href: string, before?: () => Promise<unknown>, view = false) {
  const win = view || isStandalone() ? window.open("", "_blank") : null;
  if (before) await before().catch(() => undefined);
  if (win) win.location.href = href;
  else {
    const a = document.createElement("a");
    a.href = href;
    a.click();
  }
}
