import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { listFragen, vorschlaege } from "@/lib/bp/fragen";
import { planFor } from "@/lib/bp/store";
import { notify } from "@/lib/push";

/*
 * Fragen an den Coachee zum Businessplan und Finanzplan.
 * Coach: GET liefert gestellte Fragen und Vorschläge; POST { send: [{frage, quelle}] } schickt Fragen,
 * POST { delete: id } nimmt eine zurück, POST { erledigt: [ids] } markiert eingearbeitete Antworten.
 * Coachee: GET liefert seine Fragen; POST { answers: {id: text} } speichert Entwürfe, mit submit: true gehen die Antworten an den Coach.
 */

async function who(ctx: RouteContext<"/api/businessplan/[id]/fragen">) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id).catch(() => null);
  if (!c || c.coaching_type !== "gruendung") return null;
  return { user: session.user, c, coach: session.user.role === "coach" && session.mfaPassed };
}

async function state(w: NonNullable<Awaited<ReturnType<typeof who>>>) {
  const fragen = await listFragen(w.c.id);
  if (!w.coach) return { fragen: fragen.filter((f) => f.status !== "erledigt" || f.antwort) };
  return { fragen, vorschlaege: await vorschlaege(await planFor(w.c), w.c.id, fragen) };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/fragen">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await state(w));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/fragen">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { send?: unknown; delete?: unknown; erledigt?: unknown; answers?: unknown; submit?: unknown } | null;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200) : []);

  if (w.coach) {
    if (Array.isArray(body?.send)) {
      const list = (body.send as { frage?: unknown; quelle?: unknown }[])
        .map((x) => ({ frage: typeof x?.frage === "string" ? x.frage.trim().slice(0, 500) : "", quelle: typeof x?.quelle === "string" ? x.quelle.slice(0, 200) : "" }))
        .filter((x) => x.frage)
        .slice(0, 60);
      for (const x of list) await query("INSERT INTO bp_fragen (coachee_id, frage, quelle, created_by) VALUES ($1,$2,$3,$4)", [w.c.id, x.frage, x.quelle, w.user.id]);
      if (list.length) {
        await audit(w.user.id, "bp_fragen_gesendet", w.c.id, { n: list.length });
        if (w.c.user_id) await notify([w.c.user_id], { title: "Neue Fragen von deinem Coach", body: `${list.length} ${list.length === 1 ? "Frage" : "Fragen"} zu deinem Businessplan. Bitte beantworten und zurückschicken.`, url: "/mein-bereich/businessplan?bereich=fragen", tag: "bp-fragen" }).catch(() => undefined);
      }
    } else if (typeof body?.delete === "string") {
      await query("DELETE FROM bp_fragen WHERE id = $1 AND coachee_id = $2", [body.delete, w.c.id]);
    } else if (body?.erledigt) {
      await query("UPDATE bp_fragen SET status = 'erledigt' WHERE coachee_id = $1 AND id = ANY($2::uuid[]) AND status = 'beantwortet'", [w.c.id, ids(body.erledigt)]);
    }
    return NextResponse.json(await state(w));
  }

  // Coachee: nur Antworten auf eigene offene Fragen
  if (body?.answers && typeof body.answers === "object") {
    for (const [id, text] of Object.entries(body.answers as Record<string, unknown>)) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof text !== "string") continue;
      await query("UPDATE bp_fragen SET antwort = $3 WHERE id = $1 AND coachee_id = $2 AND status = 'offen'", [id, w.c.id, text.slice(0, 5000)]);
    }
  }
  if (body?.submit === true) {
    const done = await query<{ id: string }>("UPDATE bp_fragen SET status = 'beantwortet', answered_at = now() WHERE coachee_id = $1 AND status = 'offen' AND btrim(antwort) <> '' RETURNING id", [w.c.id]);
    if (done.length) {
      await audit(w.user.id, "bp_fragen_beantwortet", w.c.id, { n: done.length });
      await notify([w.c.coach_id], { title: `${w.c.first_name} ${w.c.last_name} hat Fragen beantwortet`, body: `${done.length} ${done.length === 1 ? "Antwort" : "Antworten"} zum Businessplan.`, url: `/coach/coachees/${w.c.id}?tab=businessplan&bereich=fragen`, tag: `bp-fragen-${w.c.id}` }).catch(() => undefined);
    }
  }
  return NextResponse.json(await state(w));
}
