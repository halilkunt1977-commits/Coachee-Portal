import { NextResponse, type NextRequest } from "next/server";
import { ownCoachee } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { loadTraining } from "@/lib/jobs/training";
import { speech } from "@/lib/tts";

// Frage N des Trainings als MP3. 204 = keine Stimme verfügbar, dann liest der Browser vor.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/training/[id]/stimme">) {
  const session = await getSession();
  if (!session || session.user.role !== "coachee" || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse(null, { status: 401 });
  const c = await ownCoachee(session.user);
  if (!c || !hasFeature(c, "interview_training")) return new NextResponse(null, { status: 403 });
  const { id } = await ctx.params;
  const t = await loadTraining(c, id);
  const i = Number(request.nextUrl.searchParams.get("i"));
  const q = t && Number.isInteger(i) ? t.questions[i] : undefined;
  if (!t || q === undefined) return new NextResponse(null, { status: 404 });
  const audio = await speech(q, t.interview_lang);
  if (!audio) return new NextResponse(null, { status: 204 });
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
}
