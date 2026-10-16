import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { vaultRead } from "@/lib/vault";

/** Anhang einer Mail aus dem Posteingang, nur für den Coach, dem das Postfach gehört */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/postfach/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || session.user.role !== "coach" || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const a = await one<{ id: string; name: string; mime: string }>(
    "SELECT a.id, a.name, a.mime FROM inbox_attachments a JOIN inbox_mails m ON m.id = a.mail_id WHERE a.id = $1 AND m.coach_id = $2",
    [id, session.user.id],
  );
  if (!a) return new NextResponse("Nicht gefunden", { status: 404 });
  const data = await vaultRead("postfach", a.id).catch(() => null);
  if (!data) return new NextResponse("Datei fehlt", { status: 404 });
  const inline = /^(application\/pdf|image\/)/.test(a.mime);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
