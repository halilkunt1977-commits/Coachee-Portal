"use client";
import { useEffect } from "react";

/** Läuft das Portal als App vom Home-Bildschirm (ohne Zurück-Knopf des Browsers)? */
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

/**
 * Meldet den Service Worker an (nur für Sofort-Meldungen und die App auf dem Home-Bildschirm).
 * In der App öffnen Dateien (PDF, Word, Excel) in einem eigenen Fenster mit „Fertig“, sonst käme man nicht mehr ins Portal zurück.
 */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    if (!isStandalone()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && !a.target && new URL(a.href, location.href).pathname.startsWith("/api/")) a.target = "_blank";
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
