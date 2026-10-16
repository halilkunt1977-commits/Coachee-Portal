import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { loadFile } from "@/lib/files";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/dateien/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const { user } = session;
  const file = await one<{ name: string; mime: string }>(
    `SELECT f.name, f.mime FROM files f JOIN coachees c ON c.id = f.coachee_id
      WHERE f.id = $1 AND (c.coach_id = $2 OR (c.user_id = $2
        -- Dokumente sieht der Coachee nur, wenn der Coach sie freigegeben hat
        AND (f.kind <> 'dokument' OR EXISTS (SELECT 1 FROM documents d WHERE d.file_id = f.id AND d.shared))))`,
    [id, user.id],
  );
  if (!file) return new NextResponse("Nicht gefunden", { status: 404 });
  const data = await loadFile(id).catch(() => null);
  if (!data) return new NextResponse("Datei fehlt", { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
