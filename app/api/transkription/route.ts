import { NextResponse, type NextRequest } from "next/server";
import { AiError, transcribe } from "@/lib/ai";
import { getSession } from "@/lib/auth";

const MAX_BYTES = 24 * 1024 * 1024;

// Sprachaufnahme zu Text. Die Aufnahme wird nicht gespeichert, nur der Text geht zurück ins Formular.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Keine Aufnahme erhalten." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Die Aufnahme ist zu lang. Bitte in Abschnitten von höchstens etwa 20 Minuten aufnehmen." }, { status: 413 });
  const coacheeId = String(form?.get("coacheeId") ?? "") || null;
  try {
    const text = await transcribe(file, { coacheeId: coacheeId && /^[0-9a-f-]{36}$/i.test(coacheeId) ? coacheeId : null, userId: session.user.id, purpose: "transcription" });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("[ai] transcribe", error);
    return NextResponse.json({ error: error instanceof AiError ? error.message : "Die Umwandlung in Text hat nicht geklappt. Bitte noch einmal versuchen." }, { status: 502 });
  }
}
