import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, getSession } from "@/lib/auth";
import { proposeGlance, sendChapterMessage } from "@/lib/bp/schreibhilfe";
import { SECTIONS } from "@/lib/bp/sections";
import { planFor } from "@/lib/bp/store";

/*
 * Schreibhilfe im Businessplan, nur für den Coach. Als Route statt Server Action, weil eine Antwort der KI dauern kann
 * und Server Actions im Browser nacheinander laufen: Das automatische Speichern im Editor soll nicht warten müssen.
 * Body: { key, message } schreibt oder überarbeitet ein Kapitel, { blick: true } schlägt „Auf einen Blick“ vor.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/schreibhilfe">) {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return NextResponse.json({ error: "Businessplan gibt es nur im Gründungscoaching." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { key?: unknown; message?: unknown; blick?: unknown } | null;
  try {
    await assertAiAllowed(session.user, { coachOnly: true });
    await planFor(c);
    if (body?.blick === true) {
      const items = await proposeGlance(session.user, c);
      await audit(session.user.id, "bp_draft", c.id, { section: "blick" });
      return NextResponse.json({ items });
    }
    const key = String(body?.key ?? "");
    if (!SECTIONS.some((s) => s.key === key)) return NextResponse.json({ error: "Unbekanntes Kapitel." }, { status: 400 });
    const res = await sendChapterMessage(session.user, c, key, String(body?.message ?? ""));
    if (!res.error) await audit(session.user.id, "bp_draft", c.id, { section: key });
    return NextResponse.json(res);
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-Schreibhilfe", e);
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." }, { status: e instanceof AiError ? 400 : 500 });
  }
}
