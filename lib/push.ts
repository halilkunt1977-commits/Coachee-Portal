import webpush from "web-push";
import { decrypt, encrypt } from "./crypto";
import { one, query } from "./db";

/*
 * Sofort-Meldungen aufs Handy (Web Push). Die Schlüssel erzeugt das Portal beim ersten Mal selbst und legt den
 * privaten verschlüsselt in der Datenbank ab; VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in Coolify gehen vor.
 * Ohne "server-only", weil der Postfach-Abruf im Hintergrund (instrumentation.ts) auch Meldungen schickt.
 * Meldungen enthalten nur Namen und Anlass, keine Inhalte von Nachrichten.
 */

type Keys = { publicKey: string; privateKey: string };
let keys: Promise<Keys> | null = null;

async function loadKeys(): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const stored = await one<{ value: string }>("SELECT value FROM app_settings WHERE key = 'vapid'");
  if (stored) return JSON.parse(decrypt(stored.value)) as Keys;
  const fresh = webpush.generateVAPIDKeys();
  await query("INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [encrypt(JSON.stringify(fresh))]);
  // Falls gleichzeitig ein anderer Prozess Schlüssel angelegt hat, gelten dessen
  const saved = await one<{ value: string }>("SELECT value FROM app_settings WHERE key = 'vapid'");
  return JSON.parse(decrypt(saved!.value)) as Keys;
}

const vapid = () => (keys ??= loadKeys().catch((e) => ((keys = null), Promise.reject(e))));
export const pushPublicKey = async () => (await vapid()).publicKey;

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** An alle Geräte dieser Personen; abgelaufene Abos (404/410) werden entfernt. Fehler stören nie den Ablauf. */
export async function notify(userIds: (string | null | undefined)[], msg: PushMessage) {
  const ids = [...new Set(userIds.filter(Boolean))] as string[];
  if (!ids.length) return 0;
  try {
    const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)", [ids]);
    if (!subs.length) return 0;
    const k = await vapid();
    const options = { vapidDetails: { subject: process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM || "info@gruendarium.de"}`, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 60 * 60 * 24, urgency: "high" as const };
    const payload = JSON.stringify(msg);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
          sent++;
          await query("UPDATE push_subscriptions SET last_ok_at = now() WHERE id = $1", [s.id]);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          else console.error("[push]", code, (e as Error).message);
        }
      }),
    );
    return sent;
  } catch (e) {
    console.error("[push]", e);
    return 0;
  }
}
