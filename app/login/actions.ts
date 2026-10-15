"use server";
import { redirect } from "next/navigation";
import { audit, createSession, destroySession, getSession } from "@/lib/auth";
import { decrypt, verifyPassword, verifyTotp } from "@/lib/crypto";
import { one, query } from "@/lib/db";
import { text, type FormState } from "@/lib/forms";

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = text(fd, "email", 200).toLowerCase();
  const password = text(fd, "password", 500);
  const user = await one<{ id: string; role: "coach" | "coachee"; password_hash: string | null; totp_enabled: boolean; locked_until: string | null; failed_logins: number; active: boolean }>(
    "SELECT id, role, password_hash, totp_enabled, locked_until, failed_logins, active FROM users WHERE email = $1",
    [email],
  );
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    return { error: `Zu viele Fehlversuche. Bitte in ${LOCK_MINUTES} Minuten erneut versuchen oder das Passwort zurücksetzen.` };
  }
  const ok = user?.active && (await verifyPassword(password, user.password_hash ?? null));
  if (!user || !ok) {
    if (user) {
      const tries = user.failed_logins + 1;
      await query("UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $2 >= $3 THEN now() + make_interval(mins => $4) END WHERE id = $1", [user.id, tries, MAX_TRIES, LOCK_MINUTES]);
      await audit(user.id, "login_failed");
    }
    return { error: "E-Mail oder Passwort stimmt nicht." };
  }
  await query("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [user.id]);
  await createSession(user, !user.totp_enabled);
  await audit(user.id, "login");
  redirect(user.totp_enabled ? "/login/code" : "/");
}

export async function verifyCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");
  const row = await one<{ totp_secret: string | null; failed_logins: number }>("SELECT totp_secret, failed_logins FROM users WHERE id = $1", [session.user.id]);
  if (!row?.totp_secret) redirect("/");
  if (!verifyTotp(decrypt(row.totp_secret), text(fd, "code", 10))) {
    const tries = row.failed_logins + 1;
    await query("UPDATE users SET failed_logins = $2 WHERE id = $1", [session.user.id, tries]);
    await audit(session.user.id, "mfa_failed");
    if (tries >= MAX_TRIES) {
      await query("UPDATE users SET locked_until = now() + make_interval(mins => $2) WHERE id = $1", [session.user.id, LOCK_MINUTES]);
      await destroySession();
      redirect("/login?gesperrt=1");
    }
    return { error: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  }
  await query("UPDATE users SET failed_logins = 0 WHERE id = $1", [session.user.id]);
  await query("UPDATE auth_sessions SET mfa_passed = true WHERE id = $1", [session.sessionId]);
  await audit(session.user.id, "mfa_passed");
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  if (session) await audit(session.user.id, "logout");
  await destroySession();
  redirect("/login");
}
