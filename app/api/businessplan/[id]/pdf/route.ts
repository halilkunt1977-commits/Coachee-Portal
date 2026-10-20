import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { renderPlanHtml } from "@/lib/bp/render";
import { planFor } from "@/lib/bp/store";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return new NextResponse("Nicht gefunden", { status: 404 });
  const plan = await planFor(c);
  const coach = await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]);
  const html = renderPlanHtml(plan.sections, plan.glance, plan.finance, {
    title: plan.title,
    name: fullName(c),
    email: c.email,
    phone: c.phone,
    coach: coach?.name ?? "Coach",
    date: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
  }, cvFontCss());
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html);
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(session.user.id, "bp_pdf", c.id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Businessplan ${fullName(c)}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
