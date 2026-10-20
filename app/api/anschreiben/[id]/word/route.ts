import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/auth";
import { letterDocx } from "@/lib/letter/docx";
import { letterFileName, letterForDownload } from "@/lib/letter/export";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/anschreiben/[id]/word">) {
  const { id } = await ctx.params;
  const l = await letterForDownload(id);
  if ("error" in l) return l.error;
  const docx = await letterDocx(l.view, { color: l.color, signature: l.signature });
  await audit(l.user.id, "letter_word", l.coachee.id, { application: l.app.id });
  return new NextResponse(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(letterFileName(l.view.senderName, l.app.title, "docx"))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
