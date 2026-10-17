"use client";
import { useEffect } from "react";

/** Meldet den Service Worker an (nur für Sofort-Meldungen und die App auf dem Home-Bildschirm) */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
