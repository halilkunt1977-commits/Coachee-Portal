import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";
import { letterFileName, letterForDownload } from "@/lib/letter/export";
import { renderLetterHtml } from "@/lib/letter/render";
import { signatureDataUri } from "@/lib/signature";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/anschreiben/[id]/pdf">) {
  const { id } = await ctx.params;
  const l = await letterForDownload(id);
  if ("error" in l) return l.error;
  const html = renderLetterHtml(l.view, { color: l.color, signature: signatureDataUri(l.signature), fontCss: cvFontCss() });
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html, { fitOnePage: true });
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(l.user.id, "letter_pdf", l.coachee.id, { application: l.app.id });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(letterFileName(l.view.senderName, l.app.title, "pdf"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
