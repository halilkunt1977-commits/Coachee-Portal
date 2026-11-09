import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { MappeError, buildMappe, checkUpload, quellen, type Teil, type Upload } from "@/lib/mappe";

/*
 * PDF-Mappe für Coach und Coachee.
 * GET liefert, was zur Auswahl steht (Anschreiben je Stelle, Lebensläufe, Dokumente).
 * POST (multipart): teile = JSON [{art, id} | {art: "datei", index}], stelle = Bewerbung, datei = hochgeladene Dateien.
 * Die fertige PDF liegt danach bei den Dokumenten; zurück kommt die Datei-ID zum Ansehen und Herunterladen.
 */

async function who(ctx: RouteContext<"/api/mappe/[id]">) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return null;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = await coacheeFor(session.user, id).catch(() => null);
  return c ? { user: session.user, c } : null;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/mappe/[id]">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await quellen(w.user, w.c));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/mappe/[id]">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const fd = await request.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Die Auswahl ist nicht angekommen. Bitte noch einmal versuchen." }, { status: 400 });
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("teile") ?? "[]"));
  } catch {
    raw = [];
  }
  const teile: Teil[] = (Array.isArray(raw) ? raw : [])
    .slice(0, 40)
    .flatMap((t: { art?: unknown; id?: unknown; index?: unknown }): Teil[] =>
      t?.art === "datei" && typeof t.index === "number" ? [{ art: "datei", index: t.index }]
      : (t?.art === "anschreiben" || t?.art === "lebenslauf" || t?.art === "dokument") && typeof t.id === "string" ? [{ art: t.art, id: t.id }]
      : []);
  const uploads: Upload[] = [];
  for (const f of fd.getAll("datei").slice(0, 20)) {
    if (!(f instanceof File) || !f.size) continue;
    const u = { name: f.name.slice(0, 200), data: Buffer.from(await f.arrayBuffer()) };
    const err = checkUpload(u);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    uploads.push(u);
  }
  const stelle = typeof fd.get("stelle") === "string" ? String(fd.get("stelle")) : null;
  try {
    const r = await buildMappe(w.user, w.c, teile, uploads, stelle);
    await audit(w.user.id, "mappe_erstellt", w.c.id, { teile: teile.length, seiten: r.pages });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof MappeError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PDF-Mappe", e);
    return NextResponse.json({ error: "Die PDF konnte gerade nicht erstellt werden. Bitte gleich noch einmal versuchen." }, { status: 500 });
  }
}
