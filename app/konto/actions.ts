"use server";
import { redirect } from "next/navigation";
import { audit, getSession } from "@/lib/auth";
import { decrypt, verifyTotp } from "@/lib/crypto";
import { one, query } from "@/lib/db";
import { text, type FormState } from "@/lib/forms";

export async function enableTotp(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.totp_enabled) redirect("/");
  const row = await one<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = $1", [session.user.id]);
  if (!row?.totp_secret || !verifyTotp(decrypt(row.totp_secret), text(fd, "code", 10))) {
    return { error: "Der Code stimmt nicht. Prüfe, ob du den QR-Code gescannt hast, und gib den aktuellen Code ein." };
  }
  await query("UPDATE users SET totp_enabled = true WHERE id = $1", [session.user.id]);
  await query("UPDATE auth_sessions SET mfa_passed = true WHERE id = $1", [session.sessionId]);
  // Andere offene Sitzungen ohne zweiten Faktor beenden
  await query("DELETE FROM auth_sessions WHERE user_id = $1 AND id <> $2", [session.user.id, session.sessionId]);
  await audit(session.user.id, "mfa_enabled");
  redirect("/");
}
