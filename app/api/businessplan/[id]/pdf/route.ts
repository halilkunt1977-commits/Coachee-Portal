import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { planPdf } from "@/lib/bp/plan-pdf";
import { planFor } from "@/lib/bp/store";
import { cvFontCss } from "@/lib/cv/fonts";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return new NextResponse("Nicht gefunden", { status: 404 });
  const plan = await planFor(c);
  const bank = request.nextUrl.searchParams.get("fassung") === "bank";
  const coach = await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]);
  const meta = {
    title: plan.title,
    name: fullName(c),
    email: c.email,
    phone: c.phone,
    coach: coach?.name ?? "Coach",
    date: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
  };
  let pdf: Uint8Array;
  try {
    pdf = await planPdf(bank ? plan.bankSections : plan.sections, plan.glance, plan.finance, meta, cvFontCss(), bank ? { bank: plan.bank } : {});
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(session.user.id, "bp_pdf", c.id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${request.nextUrl.searchParams.has("ansehen") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(`Businessplan ${bank ? "Bank " : ""}${fullName(c)}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
