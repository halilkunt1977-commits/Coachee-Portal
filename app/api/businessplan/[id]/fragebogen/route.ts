import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { saveSnapshot } from "@/lib/bp/fassungen";
import { normalizeFinance } from "@/lib/bp/finance";
import { financeFromFragebogen, normalizeFragebogen } from "@/lib/bp/fragebogen";
import { loadFragebogen } from "@/lib/bp/fragebogen-store";
import { planFor } from "@/lib/bp/store";
import { notify } from "@/lib/push";

/*
 * Gründungsfragebogen.
 * GET liefert Antworten und Stand. POST { data } speichert (Coachee und Coach), POST { submit: true } schickt ihn
 * an den Coach (nur Coachee), POST { uebernehmen: true } übernimmt die Zahlen in den Finanzplan (nur Coach,
 * der bisherige Stand wird vorher als Fassung abgelegt).
 */

async function who(ctx: RouteContext<"/api/businessplan/[id]/fragebogen">) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id).catch(() => null);
  if (!c || c.coaching_type !== "gruendung") return null;
  return { user: session.user, c, coach: session.user.role === "coach" && session.mfaPassed };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/fragebogen">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await loadFragebogen(w.c.id));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/fragebogen">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { data?: unknown; submit?: unknown; uebernehmen?: unknown } | null;

  if (body?.data && typeof body.data === "object") {
    const data = normalizeFragebogen(body.data);
    await query(
      `INSERT INTO bp_fragebogen (coachee_id, data, updated_by) VALUES ($1,$2,$3)
       ON CONFLICT (coachee_id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [w.c.id, JSON.stringify(data), w.user.id],
    );
  }

  if (body?.submit === true && !w.coach) {
    const row = await one<{ coachee_id: string }>("UPDATE bp_fragebogen SET submitted_at = now() WHERE coachee_id = $1 RETURNING coachee_id", [w.c.id]);
    if (row) {
      await audit(w.user.id, "bp_fragebogen_gesendet", w.c.id);
      await notify([w.c.coach_id], {
        title: `${w.c.first_name} ${w.c.last_name} hat den Gründungsfragebogen geschickt`,
        body: "Die Antworten stehen im Businessplan unter „Gründungsfragebogen“.",
        url: `/coach/coachees/${w.c.id}?tab=businessplan&bereich=fragebogen`,
        tag: `bp-fragebogen-${w.c.id}`,
      }).catch(() => undefined);
    }
  }

  if (body?.uebernehmen === true) {
    if (!w.coach) return NextResponse.json({ error: "Nur der Coach kann Zahlen in den Finanzplan übernehmen." }, { status: 403 });
    const fb = await loadFragebogen(w.c.id);
    await planFor(w.c);
    const current = await one<{ finance: unknown }>("SELECT finance FROM business_plans WHERE coachee_id = $1", [w.c.id]);
    const before = normalizeFinance(current?.finance);
    const { finance, details } = financeFromFragebogen(fb.data, before);
    if (!details.length) return NextResponse.json({ ...fb, error: "Im Fragebogen stehen noch keine Zahlen für den Finanzplan." });
    await saveSnapshot(w.c.id, before, "Vor der Übernahme aus dem Gründungsfragebogen", w.user.id);
    await query("UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3, updated_at = now() WHERE coachee_id = $1", [w.c.id, JSON.stringify(normalizeFinance(finance)), w.user.id]);
    await query("UPDATE bp_fragebogen SET uebernommen_at = now() WHERE coachee_id = $1", [w.c.id]);
    await audit(w.user.id, "bp_fragebogen_uebernommen", w.c.id, { details: details.join(", ") });
    return NextResponse.json({ ...(await loadFragebogen(w.c.id)), uebernommen: details });
  }

  return NextResponse.json(await loadFragebogen(w.c.id));
}
