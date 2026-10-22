import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { isVideoLanguage } from "@/lib/erklaervideo";
import { greetingAudio } from "@/lib/greeting-audio";

/**
 * Gesprochene Begrüßung vor dem Erklärvideo. Hören dürfen sie nur der Coachee selbst und sein Coach.
 * 204 heißt: keine Sprachausgabe (nicht eingerichtet oder gerade nicht erreichbar), der Player zeigt dann Text.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/begruessung/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const c = await one<{ id: string; first_name: string; language: string }>(
    "SELECT id, first_name, language FROM coachees WHERE id = $1 AND (coach_id = $2 OR user_id = $2)",
    [id, session.user.id],
  );
  if (!c) return new NextResponse("Nicht gefunden", { status: 404 });
  const wanted = request.nextUrl.searchParams.get("sprache");
  const lang = isVideoLanguage(wanted) ? wanted : isVideoLanguage(c.language) ? c.language : "de";
  const audio = await greetingAudio(c.id, c.first_name, lang);
  if (!audio) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.length), "Cache-Control": "private, no-cache" },
  });
}
