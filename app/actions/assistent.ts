"use server";
import { revalidatePath } from "next/cache";
import { chatFor } from "@/lib/assistant";
import { audit, requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { noticeMail, sendMail } from "@/lib/mail";
import { notifyCoachee } from "@/lib/coachee-inbox";

const refresh = (coacheeId: string) => {
  revalidatePath(`/coach/coachees/${coacheeId}`);
  revalidatePath("/mein-bereich", "layout");
};

export async function deleteChat(chatId: string) {
  const user = await requireUser();
  const { chat, coachee } = await chatFor(user, chatId);
  await query("DELETE FROM ai_chats WHERE id = $1", [chat.id]);
  await audit(user.id, "assistant_deleted", coachee.id);
  refresh(coachee.id);
}

/** Eine Antwort des Assistenten als Nachricht an den Coach bzw. an den Coachee schicken. */
export async function shareAnswer(chatId: string, messageId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const { chat, coachee } = await chatFor(user, chatId);
  const msg = await one<{ content: string }>("SELECT content FROM ai_messages WHERE id = $1 AND chat_id = $2 AND role = 'assistant'", [messageId, chat.id]);
  if (!msg) return { ok: false, error: "Antwort nicht gefunden." };
  if (user.role === "coach" && !coachee.user_id) return { ok: false, error: "Der Coachee hat noch keinen Zugang." };
  await query("INSERT INTO messages (coachee_id, author_id, body) VALUES ($1,$2,$3)", [coachee.id, user.id, msg.content.slice(0, 10000)]);
  await audit(user.id, "message_sent", coachee.id, { from: "assistant" });
  if (user.role === "coach") {
    await sendMail({ to: coachee.email, ...noticeMail(coachee.first_name, "Du hast eine neue Nachricht von deinem Coach.") }).catch(() => false);
    await notifyCoachee(coachee.user_id, { title: "Neue Nachricht", body: "Von deinem Coach. Öffnen zum Lesen.", url: "/mein-bereich/posteingang?offen=nachrichten", tag: "nachricht" });
  } else {
    const coach = await one<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = $1", [coachee.coach_id]);
    if (coach) await sendMail({ to: coach.email, ...noticeMail(coach.name.split(" ")[0], `${coachee.first_name} ${coachee.last_name} hat dir eine Nachricht geschrieben.`) }).catch(() => false);
  }
  refresh(coachee.id);
  return { ok: true };
}
