import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed, readImage } from "@/lib/ai";
import { audit, getSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { DOC_TYPES, MAX_DOC_BYTES, extOf } from "@/lib/documents";
import { PARSER_VERSION, extractDocumentText } from "@/lib/documents-text";
import { storeFile } from "@/lib/files";

/*
 * Datei oder Foto für die KI im Businessplan (nur Coach). Wird unter Dokumente (Businessplan) abgelegt und gelesen:
 * PDF, Word, Excel und Text direkt, Fotos über die KI. Zurück kommt die Dokument-ID für die nächste Frage oder Anpassung.
 */
const READABLE = ["pdf", "docx", "xlsx", "txt"];
const IMAGES = ["jpg", "jpeg", "png", "webp"];

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/gesamt/datei">) {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return NextResponse.json({ error: "Businessplan gibt es nur im Gründungscoaching." }, { status: 404 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Keine Datei ausgewählt." }, { status: 400 });
  const ext = extOf(file.name) || (file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "");
  if (![...READABLE, ...IMAGES].includes(ext)) return NextResponse.json({ error: "Bitte PDF, Word, Excel, Text oder ein Foto (JPG, PNG) wählen." }, { status: 400 });
  if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: "Die Datei ist größer als 25 MB." }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const name = extOf(file.name) ? file.name : `Foto.${ext}`;
  try {
    let text: string;
    if (IMAGES.includes(ext)) {
      await assertAiAllowed(session.user, { coachOnly: true });
      text = await readImage(data, DOC_TYPES[ext], { coacheeId: c.id, userId: session.user.id, purpose: "businessplan_foto" });
    } else text = await extractDocumentText(name, data);
    if (!text.trim()) return NextResponse.json({ error: "In der Datei war kein lesbarer Text. Bitte als PDF, Word oder Foto versuchen." }, { status: 400 });
    const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name, mime: DOC_TYPES[ext], data, userId: session.user.id });
    const title = name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim().slice(0, 200) || name;
    const doc = await one<{ id: string }>(
      "INSERT INTO documents (coachee_id, file_id, category, title, extracted_text, created_by, parser_version) VALUES ($1,$2,'businessplan',$3,$4,$5,$6) RETURNING id",
      [c.id, fileId, title, text, session.user.id, PARSER_VERSION],
    );
    await audit(session.user.id, "bp_ai_file", c.id, { name: name.slice(0, 120) });
    return NextResponse.json({ id: doc!.id, name, image: IMAGES.includes(ext) });
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-KI Datei", e);
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Die Datei ließ sich nicht lesen." }, { status: 400 });
  }
}
