import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";
import { renderHandbookHtml } from "@/lib/handbuch/render";
import { handbookFor } from "@/lib/handbuch/store";

/** Das Handbuch als Büchlein (A5) zum Herunterladen, für den Coachee selbst und für seinen Coach */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/handbuch/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const c = await coacheeFor(session.user, id);
  const { book, ctx: hb, done } = await handbookFor(c);
  const html = renderHandbookHtml(book, {
    name: fullName(c),
    coach: hb.coachName,
    portal: hb.portal,
    done,
    date: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Berlin" }),
  }, cvFontCss());
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html);
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(session.user.id, "handbook_pdf", c.id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Mein Handbuch ${fullName(c)}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
