import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed, pseudonymize, streamText } from "@/lib/ai";
import { assistantInstructions, chatFor } from "@/lib/assistant";
import { audit, getSession } from "@/lib/auth";
import { one, query } from "@/lib/db";

/*
 * Chat mit dem KI-Assistenten. Die Antwort kommt als Textstrom, damit man sie beim Entstehen lesen kann.
 * Gespeichert wird die Frage sofort und die Antwort, sobald sie fertig (oder abgebrochen) ist.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return NextResponse.json({ error: "Bitte neu anmelden." }, { status: 401 });
  const { user } = session;
  if (user.role === "coach" && !user.totp_enabled) return NextResponse.json({ error: "Bitte zuerst die Zwei-Faktor-Anmeldung einrichten." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { chatId?: string; coacheeId?: string; text?: string };
  const text = String(body.text ?? "").trim().slice(0, 20_000);
  if (!text) return NextResponse.json({ error: "Die Nachricht ist leer." }, { status: 400 });

  // Akte und Unterhaltung prüfen (notFound() aus den Prüfungen wird hier zu 404)
  let chatId: string;
  let coachee;
  try {
    if (body.chatId) {
      const found = await chatFor(user, body.chatId);
      chatId = found.chat.id;
      coachee = found.coachee;
    } else {
      coachee = await coacheeFor(user, String(body.coacheeId ?? ""));
      const title = text.replace(/\s+/g, " ").slice(0, 70);
      chatId = (await one<{ id: string }>("INSERT INTO ai_chats (coachee_id, user_id, title) VALUES ($1,$2,$3) RETURNING id", [coachee.id, user.id, title]))!.id;
    }
  } catch {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  try {
    await assertAiAllowed(user);
  } catch (e) {
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Der Assistent ist gerade nicht erreichbar." }, { status: 429 });
  }

  await query("INSERT INTO ai_messages (chat_id, role, content) VALUES ($1, 'user', $2)", [chatId, text]);
  const history = (await query<{ role: "user" | "assistant"; content: string }>("SELECT role, content FROM (SELECT id, role, content FROM ai_messages WHERE chat_id = $1 ORDER BY id DESC LIMIT 24) m ORDER BY id", [chatId]))
    .map((m) => ({ role: m.role, content: pseudonymize(m.content, [coachee.first_name, coachee.last_name]) }));
  const instructions = await assistantInstructions(user, coachee);
  await audit(user.id, "assistant_used", coachee.id, { chat: chatId });

  const restore = (s: string) => s.replaceAll("[Name]", coachee.first_name);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        for await (const delta of streamText({ coacheeId: coachee.id, userId: user.id, purpose: "assistant", instructions, messages: history, signal: abort.signal })) {
          answer += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          if (!(e instanceof AiError)) console.error("KI-Assistent", e);
          const msg = e instanceof AiError ? e.message : "Gerade kam keine Antwort. Bitte noch einmal senden.";
          try {
            controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
          } catch {}
        }
      } finally {
        if (answer.trim()) {
          const final = restore(answer) + (abort.signal.aborted ? "\n\n_(abgebrochen)_" : "");
          await query("INSERT INTO ai_messages (chat_id, role, content) VALUES ($1, 'assistant', $2)", [chatId, final]).catch(() => {});
        }
        await query("UPDATE ai_chats SET updated_at = now() WHERE id = $1", [chatId]).catch(() => {});
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Chat-Id": chatId, "X-Accel-Buffering": "no" },
  });
}
