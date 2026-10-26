"use server";
import { getT } from "@/lib/i18n-server";
import { audit, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { notify } from "@/lib/push";

type Sub = { endpoint: string; keys?: { p256dh?: string; auth?: string } };

/** Dieses Gerät für Sofort-Meldungen anmelden */
export async function savePushSubscription(sub: Sub, device: string) {
  const user = await requireUser();
  const ok = typeof sub?.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 && sub.keys?.p256dh && sub.keys?.auth;
  if (!ok) return { error: "Das Gerät hat keine gültige Anmeldung geliefert." };
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device = EXCLUDED.device`,
    [user.id, sub.endpoint, String(sub.keys!.p256dh).slice(0, 200), String(sub.keys!.auth).slice(0, 100), String(device ?? "").slice(0, 120)],
  );
  await audit(user.id, "push_on", null, { device: String(device ?? "").slice(0, 120) });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [String(endpoint ?? ""), user.id]);
  return { ok: true };
}

export async function sendTestPush() {
  const user = await requireUser();
  const t = await getT();
  const n = await notify([user.id], { title: "Gründarium Portal", body: t("So sehen deine Meldungen aus. Alles eingerichtet!"), url: user.role === "coach" ? "/coach" : "/mein-bereich", tag: "test" });
  return n ? { ok: true } : { error: "Die Meldung kam nicht an. Bitte Meldungen erneut einschalten." };
}
