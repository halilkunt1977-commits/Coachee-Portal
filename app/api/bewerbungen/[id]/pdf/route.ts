import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";
import { one } from "@/lib/db";
import { applicationsHtml } from "@/lib/jobs/export";
import { listApplications } from "@/lib/jobs/store";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/bewerbungen/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "job") return new NextResponse("Nicht gefunden", { status: 404 });
  const [apps, coach] = await Promise.all([listApplications(c.id), one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id])]);
  const html = applicationsHtml(apps, { name: fullName(c), coach: coach?.name ?? "Coach", date: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) }, cvFontCss());
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html);
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(session.user.id, "applications_pdf", c.id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Bewerbungen ${fullName(c)}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
