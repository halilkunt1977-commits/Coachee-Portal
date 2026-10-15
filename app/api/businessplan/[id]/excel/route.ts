import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { financeWorkbook } from "@/lib/bp/excel";
import { planFor } from "@/lib/bp/store";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/excel">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return new NextResponse("Nicht gefunden", { status: 404 });
  const plan = await planFor(c);
  const file = await financeWorkbook(plan.finance, { name: fullName(c), title: plan.title });
  await audit(session.user.id, "finance_excel", c.id);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Finanzplan ${fullName(c)}.xlsx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
