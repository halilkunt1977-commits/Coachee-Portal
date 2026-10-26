import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/auth";
import { cvFontCss } from "@/lib/cv/fonts";
import { measureLetterFit } from "@/lib/cv/pdf";
import { letterDocx } from "@/lib/letter/docx";
import { letterFileName, letterForDownload } from "@/lib/letter/export";
import { renderLetterHtml } from "@/lib/letter/render";
import { signatureDataUri } from "@/lib/signature";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/anschreiben/[id]/word">) {
  const { id } = await ctx.params;
  const l = await letterForDownload(id);
  if ("error" in l) return l.error;
  // Word misst nicht selbst: die Stufe für „eine Seite“ kommt aus demselben Chromium wie beim PDF
  const html = renderLetterHtml(l.view, { color: l.color, signature: signatureDataUri(l.signature), fontCss: cvFontCss(), forWord: true });
  const fit = await measureLetterFit(html).catch((e) => {
    console.error("Anschreiben ausmessen fehlgeschlagen", e);
    return { level: 0, overflow: false };
  });
  const docx = await letterDocx(l.view, { color: l.color, signature: l.signature, fit: fit.level, tight: fit.overflow });
  await audit(l.user.id, "letter_word", l.coachee.id, { application: l.app.id });
  return new NextResponse(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(letterFileName(l.view.senderName, l.app.title, "docx"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
