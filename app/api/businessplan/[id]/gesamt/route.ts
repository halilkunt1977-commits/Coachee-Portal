import { after, NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, getSession } from "@/lib/auth";
import { createRun, executeRun, getRun, undoRun } from "@/lib/bp/gesamt-ki";
import { planFor } from "@/lib/bp/store";

/*
 * KI für den ganzen Businessplan, nur für den Coach.
 * POST { message } startet einen Durchgang (läuft im Hintergrund weiter), POST { undo: id } macht ihn rückgängig.
 * GET ?run=id liefert den Stand, nach dem Ende mit allen Kapiteln, damit der Editor sie übernimmt.
 */

async function coach(ctx: RouteContext<"/api/businessplan/[id]/gesamt">) {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return null;
  return { user: session.user, c };
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/gesamt">) {
  const who = await coach(ctx);
  if (!who) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { message?: unknown; undo?: unknown } | null;
  try {
    if (typeof body?.undo === "string") {
      const ok = await undoRun(who.user, who.c.id, body.undo);
      if (ok) await audit(who.user.id, "bp_ai_undo", who.c.id);
      const plan = await planFor(who.c);
      return NextResponse.json({ ok, run: await getRun(who.c.id, body.undo), sections: plan.sections, glance: plan.glance });
    }
    await assertAiAllowed(who.user, { coachOnly: true });
    await planFor(who.c);
    const run = await createRun(who.user, who.c, String(body?.message ?? ""));
    if (run.fresh) {
      await audit(who.user.id, "bp_ai_run", who.c.id);
      after(() => executeRun(run.id, who.user, who.c, run.message));
    }
    return NextResponse.json({ run: await getRun(who.c.id, run.id) });
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Businessplan-KI", e);
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt. Bitte gleich noch einmal versuchen." }, { status: e instanceof AiError ? 400 : 500 });
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/gesamt">) {
  const who = await coach(ctx);
  if (!who) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const run = await getRun(who.c.id, request.nextUrl.searchParams.get("run") ?? undefined);
  if (!run || run.status === "laeuft") return NextResponse.json({ run });
  const plan = await planFor(who.c);
  return NextResponse.json({ run, sections: plan.sections, glance: plan.glance });
}
