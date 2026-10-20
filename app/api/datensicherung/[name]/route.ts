import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { audit, getSession } from "@/lib/auth";
import { isBackupName } from "@/lib/backup/format.mjs";
import { backupDir } from "@/lib/backup/run";

/** Download einer Sicherung, nur für den Coach (mit Zwei-Faktor), gestreamt */
export async function GET(_request: Request, ctx: RouteContext<"/api/datensicherung/[name]">) {
  const { name } = await ctx.params;
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.user.totp_enabled || !session.mfaPassed) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (!isBackupName(name)) return new NextResponse("Nicht gefunden", { status: 404 });
  const file = path.join(backupDir(), name);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new NextResponse("Nicht gefunden", { status: 404 });
  await audit(session.user.id, "backup_downloaded", null, { name });
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
