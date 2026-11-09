import { NextResponse } from "next/server";
import { ownCoachee } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { loadTraining } from "@/lib/jobs/training";
import { SIMLI_FACES, simliKey, simliToken } from "@/lib/simli";

/*
 * Echt wirkendes Gegenüber (Simli): Der Server holt mit dem geheimen Schlüssel eine Sitzungsmarke, nur die geht an
 * den Browser. Zu Simli geht nur die gesprochene Frage (ohne Namen), nie das Kamerabild des Coachees.
 * 404 = kein Schlüssel gesetzt, dann bleibt die gezeichnete Person.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/training/[id]/avatar">) {
  const session = await getSession();
  if (!session || session.user.role !== "coachee" || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse(null, { status: 401 });
  const c = await ownCoachee(session.user);
  if (!c || !hasFeature(c, "interview_training")) return new NextResponse(null, { status: 403 });
  const { id } = await ctx.params;
  const t = await loadTraining(c, id);
  if (!t || t.report) return new NextResponse(null, { status: 404 });
  const key = await simliKey();
  if (!key) return new NextResponse(null, { status: 404 });
  try {
    const token = await simliToken(key, SIMLI_FACES[t.voice]);
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Simli-Sitzung fehlgeschlagen", (e as Error).message);
    return new NextResponse(null, { status: 502 });
  }
}
