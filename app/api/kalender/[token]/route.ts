import { NextResponse, type NextRequest } from "next/server";
import { ics } from "@/lib/calendar/ics";
import { icsEvent } from "@/lib/calendar/notify";
import { appointmentsBetween } from "@/lib/calendar/store";
import { addDays, todayBerlin } from "@/lib/calendar/dates";
import type { User } from "@/lib/auth";
import { one } from "@/lib/db";

/**
 * Kalender-Abo: Outlook, Google oder das Handy holen sich hier regelmäßig alle Termine.
 * Geschützt nur durch den langen geheimen Link; deshalb ohne Hinweise/Notizen und mit „Link erneuern“ im Portal.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/kalender/[token]">) {
  const token = (await ctx.params).token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return new NextResponse("Nicht gefunden", { status: 404 });
  const user = await one<User>("SELECT id, email, name, role, totp_enabled FROM users WHERE calendar_token = $1 AND active", [token]);
  if (!user) return new NextResponse("Nicht gefunden", { status: 404 });
  const today = todayBerlin();
  const appts = await appointmentsBetween(user, addDays(today, -60), addDays(today, 400));
  const body = ics(
    appts.map((a) => ({ ...icsEvent(a, a.status === "abgesagt"), organizer: null, attendees: [] })),
    { method: "PUBLISH", name: user.role === "coach" ? "Gründarium Coaching" : "Mein Coaching" },
  );
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
