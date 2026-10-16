import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { COACH_STARTERS, STARTERS, chatFor, chatMessages, chatsFor } from "@/lib/assistant";
import type { User } from "@/lib/auth";
import { one } from "@/lib/db";
import { Assistant } from "./Assistant";

/** Lädt Unterhaltungen und die geöffnete Unterhaltung, für Coach (Akte) und Coachee (Mein Bereich). */
export async function AssistantPanel({ user, coachee, chatId, base }: { user: User; coachee: Coachee; chatId: string | null; base: { chat: string; fresh: string } }) {
  const coach = user.role === "coach";
  const [chats, active] = await Promise.all([chatsFor(user, coachee.id), chatId ? chatFor(user, chatId).then((r) => (r.coachee.id === coachee.id ? r.chat : null)) : null]);
  const messages = active ? await chatMessages(active.id) : [];
  const used = await one<{ n: number }>(
    coach
      ? "SELECT count(*)::int AS n FROM ai_usage WHERE coachee_id = $1 AND created_at >= date_trunc('month', now())"
      : "SELECT count(*)::int AS n FROM ai_usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())",
    [coach ? coachee.id : user.id],
  );
  const limit = Number(process.env.AI_COACHEE_MONTHLY_LIMIT || 40);
  const usage = coach
    ? `KI-Anfragen zu dieser Akte im laufenden Monat: ${used?.n ?? 0}. Namen werden vor dem Senden ersetzt.`
    : `Diesen Monat ${used?.n ?? 0} von ${limit} Anfragen genutzt. Dein Coach kann deine Unterhaltungen sehen.`;
  return (
    <Assistant
      key={`${active?.id ?? "neu"}-${messages.length}`}
      coacheeId={coachee.id}
      firstName={coachee.first_name}
      coach={coach}
      chats={chats.map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at, author_name: c.author_name, mine: c.user_id === user.id }))}
      activeId={active?.id ?? null}
      messages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
      starters={(coach ? COACH_STARTERS : STARTERS)[coachee.coaching_type]}
      chatHref={base.chat}
      newHref={base.fresh}
      ai={aiEnabled()}
      usage={usage}
      shareLabel={coach ? `An ${coachee.first_name} senden` : "An meinen Coach senden"}
    />
  );
}
