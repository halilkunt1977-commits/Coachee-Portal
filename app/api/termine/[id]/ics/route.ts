import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ics } from "@/lib/calendar/ics";
import { icsEvent } from "@/lib/calendar/notify";
import { appointmentFor } from "@/lib/calendar/store";

/** Einzelner Termin als .ics zum Übernehmen in den eigenen Kalender */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/termine/[id]/ics">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const a = await appointmentFor(session.user, id);
  if (!a) return new NextResponse("Nicht gefunden", { status: 404 });
  const body = ics([{ ...icsEvent(a, a.status === "abgesagt"), organizer: null, attendees: [] }], { method: "PUBLISH" });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${a.title}.ics`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
