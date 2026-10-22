"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 60_000;

/**
 * Meldet dem Portal, dass der Coachee gerade da ist: beim Öffnen, bei jedem Seitenwechsel und jede Minute,
 * solange der Tab sichtbar ist. Der Server merkt sich nur Zeit und groben Bereich (für die Online-Anzeige beim Coach).
 */
export function Heartbeat() {
  const pathname = usePathname();
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/praesenz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: location.pathname }), keepalive: true }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, EVERY_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [pathname]);
  return null;
}
