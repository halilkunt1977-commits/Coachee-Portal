import { NextResponse, type NextRequest } from "next/server";
import { ownCoachee } from "@/lib/access";
import { AiError } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { loadTraining, normalizeMetrics, saveAnswer } from "@/lib/jobs/training";
import { notify } from "@/lib/push";

const MAX_BYTES = 12 * 1024 * 1024;

// Eine Antwort im Interview-Training: Ton zu Text (wird nicht gespeichert), dazu die Messwerte aus dem Browser.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/training/[id]">) {
  const session = await getSession();
  if (!session || session.user.role !== "coachee" || (session.user.totp_enabled && !session.mfaPassed)) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const c = await ownCoachee(session.user);
  if (!c || !hasFeature(c, "interview_training")) return NextResponse.json({ error: "Diese Funktion hat dein Coach für dich noch nicht freigeschaltet." }, { status: 403 });
  const { id } = await ctx.params;
  const t = await loadTraining(c, id);
  if (!t || t.report) return NextResponse.json({ error: "Dieses Training gibt es nicht mehr." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const index = Number(form?.get("index"));
  if (!Number.isInteger(index) || index < 0 || index >= t.questions.length) return NextResponse.json({ error: "Diese Frage gibt es nicht." }, { status: 400 });
  const audio = form?.get("audio");
  const file = audio instanceof File ? audio : null;
  if (file && file.size > MAX_BYTES) return NextResponse.json({ error: "Die Antwort ist zu lang." }, { status: 413 });
  let metrics = null;
  try {
    metrics = normalizeMetrics(JSON.parse(String(form?.get("metrics") ?? "null")));
  } catch {
    metrics = null;
  }
  try {
    const text = await saveAnswer(c, t, index, file, Number(form?.get("seconds")) || 0, metrics, session.user.id);
    // erste Antwort: Coach sofort melden, dass geübt wird (die Auswertung kommt am Ende als eigene Meldung)
    if (!(t.answers ?? []).some((x) => x && (x.text || x.seconds))) {
      await notify([c.coach_id], {
        title: `${c.first_name} ${c.last_name} übt gerade ein Vorstellungsgespräch`,
        body: `Interview-Training: ${t.title}`,
        url: `/coach/coachees/${c.id}?tab=bewerbungen#training`,
        tag: `training-${t.id}`,
      }).catch(() => undefined);
    }
    return NextResponse.json({ text });
  } catch (error) {
    console.error("[ai] training antwort", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof AiError ? error.message : "Die Antwort ließ sich nicht verarbeiten. Bitte noch einmal versuchen." }, { status: 502 });
  }
}
