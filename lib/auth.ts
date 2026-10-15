import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { one, query } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "portal_session";
const HOURS = 3600_000;
// Coach: kurze Sitzung (sieht alle Daten). Coachee: länger, damit das Arbeiten bequem bleibt.
const LIFETIME = { coach: 12 * HOURS, coachee: 14 * 24 * HOURS } as const;

export type Role = "coach" | "coachee";
export type User = { id: string; email: string; name: string; role: Role; totp_enabled: boolean };
export type Session = { user: User; mfaPassed: boolean; sessionId: string };

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(user: { id: string; role: Role }, mfaPassed: boolean) {
  const token = randomToken();
  const expires = new Date(Date.now() + LIFETIME[user.role]);
  const { ip, userAgent } = await clientInfo();
  await query("INSERT INTO auth_sessions (id, user_id, mfa_passed, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)", [sha256(token), user.id, mfaPassed, expires, ip, userAgent]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM auth_sessions WHERE id = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await one<User & { session_id: string; mfa_passed: boolean }>(
    `SELECT u.id, u.email, u.name, u.role, u.totp_enabled, s.id AS session_id, s.mfa_passed
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.active`,
    [sha256(token)],
  );
  if (!row) return null;
  const { session_id, mfa_passed, ...user } = row;
  return { user, mfaPassed: mfa_passed, sessionId: session_id };
});

/** Voll angemeldet: Passwort und, wo nötig, zweiter Faktor. Der Coach muss 2FA eingerichtet haben. */
export async function requireUser(role?: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { user } = session;
  if (user.totp_enabled && !session.mfaPassed) redirect("/login/code");
  if (user.role === "coach" && !user.totp_enabled) redirect("/konto/zwei-faktor");
  if (role && user.role !== role) redirect(user.role === "coach" ? "/coach" : "/mein-bereich");
  return user;
}

export const requireCoach = () => requireUser("coach");

export async function audit(userId: string | null, action: string, coacheeId: string | null = null, detail: Record<string, unknown> | null = null) {
  const { ip } = await clientInfo().catch(() => ({ ip: null }));
  await query("INSERT INTO audit_log (user_id, coachee_id, action, detail, ip) VALUES ($1,$2,$3,$4,$5)", [userId, coacheeId, action, detail, ip]);
}
