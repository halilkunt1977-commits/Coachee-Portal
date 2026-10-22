import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { areaFor } from "@/lib/presence";
import { presenceFor, touchPresence } from "@/lib/presence-store";

const noStore = { "Cache-Control": "private, no-store" };

/** Coachee meldet sich: „bin da, gerade in diesem Bereich“. Aus der Adresse wird nur der grobe Bereich gespeichert. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "coachee" || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  await touchPresence(session.user.id, areaFor(typeof body?.path === "string" ? body.path.slice(0, 300) : ""));
  return new NextResponse(null, { status: 204, headers: noStore });
}

/** Für den Coach: Online-Stand seiner Coachees. Coachees sehen nie, wer online ist. */
export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json({ now: new Date().toISOString(), list: await presenceFor(session.user.id) }, { headers: noStore });
}
