import { NextResponse } from "next/server";
import { ownCoachee } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { loadTraining } from "@/lib/jobs/training";

/*
 * Echt wirkendes Gegenüber (Simli): Der Server holt mit dem geheimen Schlüssel eine Sitzungsmarke, nur die geht an
 * den Browser. Zu Simli geht nur die gesprochene Frage (ohne Namen), nie das Kamerabild des Coachees.
 * 404 = kein Schlüssel gesetzt, dann bleibt die gezeichnete Person.
 */
const FACES = {
  f: process.env.SIMLI_FACE_F || "bf13113a-355a-4d97-8b90-4edccd1da7b2",
  m: process.env.SIMLI_FACE_M || "a36d66df-a23d-4569-996b-d0e990019857",
};

export async function POST(_req: Request, ctx: RouteContext<"/api/training/[id]/avatar">) {
  const key = process.env.SIMLI_API_KEY;
  if (!key) return new NextResponse(null, { status: 404 });
  const session = await getSession();
  if (!session || session.user.role !== "coachee" || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse(null, { status: 401 });
  const c = await ownCoachee(session.user);
  if (!c || !hasFeature(c, "interview_training")) return new NextResponse(null, { status: 403 });
  const { id } = await ctx.params;
  const t = await loadTraining(c, id);
  if (!t || t.report) return new NextResponse(null, { status: 404 });
  try {
    const res = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-simli-api-key": key },
      // eine Sitzung je Gespräch; nach 3 Minuten ohne Ton beendet Simli sie selbst (spart Minuten)
      body: JSON.stringify({ faceId: FACES[t.voice], handleSilence: true, maxSessionLength: 2400, maxIdleTime: 180 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error("Simli-Sitzung abgelehnt", res.status, (await res.text()).slice(0, 300));
      return new NextResponse(null, { status: 502 });
    }
    const data = (await res.json()) as { session_token?: string };
    if (!data.session_token) return new NextResponse(null, { status: 502 });
    return NextResponse.json({ token: data.session_token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Simli nicht erreichbar", (e as Error).message);
    return new NextResponse(null, { status: 502 });
  }
}
