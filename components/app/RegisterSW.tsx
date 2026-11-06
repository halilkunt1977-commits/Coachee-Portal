"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Läuft das Portal als App vom Home-Bildschirm (ohne Zurück-Knopf des Browsers)? */
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

/**
 * Meldet den Service Worker an (nur für Sofort-Meldungen und die App auf dem Home-Bildschirm).
 * In der App öffnen Dateien (PDF, Word, Excel) in der Ansicht im Portal mit „Zurück“-Knopf, sonst käme man nicht mehr zurück.
 */
export function RegisterSW() {
  const router = useRouter();
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    if (!isStandalone()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return;
      e.preventDefault();
      router.push(`/ansehen?src=${encodeURIComponent(url.pathname + url.search)}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
  return null;
}
