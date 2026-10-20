import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { planFor } from "@/lib/bp/store";
import { planDocx } from "@/lib/bp/word";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/word">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return new NextResponse("Nicht gefunden", { status: 404 });
  const plan = await planFor(c);
  const file = await planDocx(plan.sections, plan.glance, plan.finance, {
    title: plan.title,
    name: fullName(c),
    date: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
  });
  await audit(session.user.id, "bp_word", c.id);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Businessplan ${fullName(c)}.docx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
