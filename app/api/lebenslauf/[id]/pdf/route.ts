import { NextResponse, type NextRequest } from "next/server";
import { audit, getSession } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { htmlToPdf } from "@/lib/cv/pdf";
import { renderCvHtml } from "@/lib/cv/render";
import { cvFor, photoDataUri } from "@/lib/cv/store";
import { loadSignature, signatureDataUri } from "@/lib/signature";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/lebenslauf/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  const { cv } = await cvFor(session.user, id);
  const html = renderCvHtml(cv.data, { template: cv.template, color: cv.color, photo: await photoDataUri(cv.photo_file_id), signature: signatureDataUri(await loadSignature(cv.coachee_id)), fontCss: cvFontCss() });
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html, { paginate: true });
  } catch (e) {
    console.error("PDF-Erzeugung fehlgeschlagen", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
  await audit(session.user.id, "cv_pdf", cv.coachee_id, { cv: cv.id });
  const p = cv.data.personal;
  const file = `Lebenslauf ${[p.firstName, p.lastName].filter(Boolean).join(" ") || cv.name}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
