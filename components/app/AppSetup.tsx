"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { Icon } from "@/components/shell/icons";

const toKey = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type Env = { standalone: boolean; ios: boolean; android: boolean; push: boolean };
const noEnv: Env = { standalone: false, ios: false, android: false, push: false };
let cached: Env | null = null;
const readEnv = (): Env =>
  (cached ??= {
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    android: /android/i.test(navigator.userAgent),
    push: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  });
const subscribe = () => () => {};

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/mac/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  return "Gerät";
};

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * „Als App nutzen“: auf dem Handy installieren und Sofort-Meldungen einschalten.
 * Zeigt sich nicht mehr, sobald beides erledigt ist (dann nur noch klein unter compact=false).
 */
export function AppSetup({ publicKey, what, compact = false }: { publicKey: string; what: string; compact?: boolean }) {
  const env = useSyncExternalStore(subscribe, readEnv, () => noEnv);
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [install, setInstall] = useState<BeforeInstall | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // getRegistration statt ready: ready wartet ewig, wenn der Service Worker nicht startet
    const reg = "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration("/") : Promise.resolve(undefined);
    reg.then((r) => r?.pushManager?.getSubscription() ?? null).then((s) => setSub(s)).catch(() => setSub(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNote(env.ios ? "Meldungen sind blockiert. Einstellungen > Mitteilungen > Gründarium erlauben." : "Meldungen sind im Browser blockiert. Bitte in den Website-Einstellungen erlauben.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const r = await savePushSubscription(JSON.parse(JSON.stringify(s)), deviceName());
      if ("error" in r && r.error) setNote(r.error);
      else {
        setSub(s);
        await sendTestPush();
      }
    } catch {
      setNote("Das hat nicht geklappt. Bitte die Seite neu laden und noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!sub) return;
    setBusy(true);
    await removePushSubscription(sub.endpoint);
    await sub.unsubscribe().catch(() => {});
    setSub(null);
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPush();
    setNote("error" in r && r.error ? r.error : "Testmeldung ist unterwegs.");
    setBusy(false);
  }

  if (sub === undefined) return null;
  const done = sub && (env.standalone || !(env.ios || env.android));
  if (compact && done) return null;
  // iPhone: Meldungen gibt es nur in der installierten App
  const needsInstall = !env.standalone && (env.ios || env.android);

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#e9c88c] to-gold font-[family-name:var(--font-display)] text-lg font-extrabold text-night">G</span>
        <div className="min-w-0">
          <h2 className="h2">Portal als App</h2>
          <p className="text-xs text-muted">{done ? `Eingerichtet: Meldungen kommen auf dieses Gerät.` : `Auf dem Handy wie eine App, mit Sofort-Meldung ${what}.`}</p>
        </div>
      </div>

      {needsInstall && (
        <div className="space-y-2 rounded-xl bg-bg p-3 text-sm">
          <p className="font-semibold">1. Auf den Home-Bildschirm legen</p>
          {install ? (
            <button className="btn btn-sm" onClick={() => install.prompt().then(() => setInstall(null))}>App installieren</button>
          ) : env.ios ? (
            <p>In Safari unten auf <b>Teilen</b> <span aria-hidden>(□↑)</span> tippen, dann <b>„Zum Home-Bildschirm“</b>. Danach das Portal über das neue Symbol öffnen und hier die Meldungen einschalten.</p>
          ) : (
            <p>Im Browser-Menü <b>⋮</b> auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> tippen.</p>
          )}
        </div>
      )}

      {env.push && !(env.ios && !env.standalone) ? (
        sub ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" onClick={test} disabled={busy}><Icon name="check" className="size-4" /> Testmeldung</button>
            <button className="btn-ghost btn-sm text-muted" onClick={turnOff} disabled={busy}>Meldungen ausschalten</button>
          </div>
        ) : (
          <button className="btn w-full" onClick={turnOn} disabled={busy}>{needsInstall ? "2. " : ""}Meldungen einschalten</button>
        )
      ) : !env.push && !env.ios ? (
        <p className="text-xs text-muted">Dieser Browser kann keine Meldungen empfangen.</p>
      ) : null}
      {note && <p className="text-xs text-muted">{note}</p>}
    </section>
  );
}
