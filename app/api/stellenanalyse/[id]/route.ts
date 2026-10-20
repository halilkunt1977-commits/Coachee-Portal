import { NextResponse, type NextRequest } from "next/server";
import { jobReportPdf } from "@/app/actions/stellenanalyse";
import { getSession } from "@/lib/auth";

/** Einschätzung zur Stelle als PDF (nur Coach); id = Coachee, ?stelle= Bewerbung */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stellenanalyse/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed) || session.user.role !== "coach") return new NextResponse("Nicht angemeldet", { status: 401 });
  const app = request.nextUrl.searchParams.get("stelle") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(app)) return new NextResponse("Nicht gefunden", { status: 404 });
  const made = await jobReportPdf(id, app);
  if (!made) return new NextResponse("Noch keine Analyse", { status: 404 });
  return new NextResponse(new Uint8Array(made.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${made.name}.pdf`)}`, "Cache-Control": "private, no-store" },
  });
}
