"use server";
import { audit } from "@/lib/auth";
import { one } from "@/lib/db";
import { isEmail, text, type FormState } from "@/lib/forms";
import { createInvite } from "@/lib/invites";
import { resetMail, sendMail } from "@/lib/mail";

export async function requestReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = text(fd, "email", 200).toLowerCase();
  if (!isEmail(email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const user = await one<{ id: string; name: string }>("SELECT id, name FROM users WHERE email = $1 AND active", [email]);
  if (user) {
    const recent = await one("SELECT 1 FROM invitations WHERE user_id = $1 AND purpose = 'reset' AND created_at > now() - interval '2 minutes'", [user.id]);
    if (!recent) {
      const link = await createInvite(user.id, "reset");
      await sendMail({ to: email, ...resetMail(user.name.split(" ")[0], link) }).catch((e) => console.error("[mail] reset", e));
      await audit(user.id, "reset_requested");
    }
  }
  // Immer dieselbe Antwort, damit niemand ausprobieren kann, welche Adressen ein Konto haben
  return { ok: "Wenn es ein Konto mit dieser Adresse gibt, ist jetzt eine E-Mail mit einem Link unterwegs." };
}
