import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { applicationsWorkbook } from "@/lib/jobs/export";
import { listApplications } from "@/lib/jobs/store";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/bewerbungen/[id]/excel">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "job") return new NextResponse("Nicht gefunden", { status: 404 });
  const [apps, coach] = await Promise.all([listApplications(c.id), one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id])]);
  const file = await applicationsWorkbook(apps, { name: fullName(c), coach: coach?.name ?? "Coach", date: new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) });
  await audit(session.user.id, "applications_excel", c.id);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Bewerbungen ${fullName(c)}.xlsx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
