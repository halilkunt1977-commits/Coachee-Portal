"use server";
import { redirect } from "next/navigation";
import { audit, createSession } from "@/lib/auth";
import { hashPassword, sha256 } from "@/lib/crypto";
import { transaction } from "@/lib/db";
import { text, type FormState } from "@/lib/forms";
import { translator } from "@/lib/i18n";
import { findInvite } from "@/lib/invites";

export async function acceptInvite(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const invite = await findInvite(token);
  if (!invite) return { error: "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte frag nach einem neuen Link." };
  const t = translator(invite.language);
  const password = text(fd, "password", 500);
  if (password.length < 10) return { error: t("Das Passwort muss mindestens 10 Zeichen lang sein.") };
  if (password !== text(fd, "password2", 500)) return { error: t("Die beiden Passwörter stimmen nicht überein.") };
  const needsConsent = invite.purpose === "invite" && invite.role === "coachee";
  if (needsConsent && fd.get("consent") !== "on") return { error: t("Bitte stimme der Datenschutzerklärung zu, damit wir deine Daten im Portal speichern dürfen.") };

  const hash = await hashPassword(password);
  await transaction(async (db) => {
    await db.query("UPDATE invitations SET used_at = now() WHERE token_hash = $1", [sha256(token)]);
    await db.query("UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1", [invite.user_id, hash]);
    await db.query("DELETE FROM auth_sessions WHERE user_id = $1", [invite.user_id]);
    if (needsConsent) {
      await db.query(
        "UPDATE coachees SET consent_at = now(), consent_special_at = CASE WHEN $2 THEN now() END WHERE user_id = $1",
        [invite.user_id, fd.get("consent_special") === "on"],
      );
    }
  });
  await audit(invite.user_id, invite.purpose === "invite" ? "invite_accepted" : "password_reset");
  if (invite.role === "coach") redirect("/login?passwort=1");
  await createSession({ id: invite.user_id, role: invite.role }, true);
  redirect("/");
}
