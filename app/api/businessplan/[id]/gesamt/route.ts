import { after, NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, getSession } from "@/lib/auth";
import { BLICK_KEY, clearChat, createRun, decide, executeRun, getRun } from "@/lib/bp/gesamt-ki";
import { SECTIONS } from "@/lib/bp/sections";
import { planFor } from "@/lib/bp/store";

/*
 * Chat mit der KI für den ganzen Businessplan, nur für den Coach.
 * POST { message, files } schickt eine Nachricht: Die KI antwortet oder ändert den Plan (läuft im Hintergrund weiter).
 * POST { decide: id, key?, decision } übernimmt oder verwirft eine Änderung (ohne key: alle offenen dieses Durchgangs).
 * POST { clear: true } leert den Chat. GET ?run=id liefert den Stand, nach dem Ende mit allen Kapiteln.
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
  const body = (await request.json().catch(() => null)) as { message?: unknown; decide?: unknown; key?: unknown; decision?: unknown; clear?: unknown; files?: unknown; fileNames?: unknown } | null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
  const files = strings(body?.files);
  try {
    if (body?.clear === true) {
      await clearChat(who.c.id);
      return NextResponse.json({ ok: true });
    }
    if (typeof body?.decide === "string") {
      const decision = body.decision === "verworfen" ? "verworfen" : "uebernommen";
      const key = typeof body.key === "string" && (body.key === BLICK_KEY || SECTIONS.some((s) => s.key === body.key)) ? body.key : null;
      const ok = await decide(who.user, who.c.id, body.decide, key, decision);
      if (ok) await audit(who.user.id, decision === "verworfen" ? "bp_ai_undo" : "bp_ai_accept", who.c.id);
      const plan = await planFor(who.c);
      return NextResponse.json({ ok, run: await getRun(who.c.id, body.decide), sections: plan.sections, glance: plan.glance });
    }
    await assertAiAllowed(who.user, { coachOnly: true });
    await planFor(who.c);
    const text = String(body?.message ?? "").trim();
    const names = strings(body?.fileNames).map((n) => n.slice(0, 120));
    const run = await createRun(who.user, who.c, `${text}${names.length ? `${text ? "\n" : ""}📎 ${names.join(", ")}` : ""}`, files);
    if (run.fresh) {
      await audit(who.user.id, "bp_ai_run", who.c.id);
      after(() => executeRun(run.id, who.user, who.c, run.message));
    }
    return NextResponse.json({ run: await getRun(who.c.id, run.id), fresh: run.fresh });
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
