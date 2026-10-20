import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { dokuPdf } from "@/lib/doku/store";

/** Beratungsdokumentation (AVOCONS-Formular) aus allen Gesprächen mit UE, nur für den Coach; ?blatt=n bei Original-Formular */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/dokumentation/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (session.user.role !== "coach") return new NextResponse("Nicht gefunden", { status: 404 });
  const c = await coacheeFor(session.user, id);
  const made = await dokuPdf(c.id, Number(request.nextUrl.searchParams.get("blatt")) || undefined);
  if (!made) return new NextResponse("Nicht gefunden", { status: 404 });
  await audit(session.user.id, "doku_pdf", c.id);
  return new NextResponse(new Uint8Array(made.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`Beratungsdokumentation ${fullName(c)}${made.sheet ? ` Blatt ${made.sheet}` : ""}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
