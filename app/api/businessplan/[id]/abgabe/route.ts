import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor } from "@/lib/access";
import { audit, getSession } from "@/lib/auth";
import { abgabeLabel, createAbgabe, listAbgaben } from "@/lib/bp/abgabe";
import { notify } from "@/lib/push";

/*
 * Abgabe von Businessplan und Finanzplan (Coach und Coachee).
 * POST { kind: "fachstelle" | "bank" } erzeugt die Fassung und legt sie in die Dokumente; GET listet die bisherigen Abgaben.
 */

async function who(ctx: RouteContext<"/api/businessplan/[id]/abgabe">) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id).catch(() => null);
  if (!c || c.coaching_type !== "gruendung") return null;
  return { user: session.user, c };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/abgabe">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json({ abgaben: await listAbgaben(w.c.id) });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/abgabe">) {
  const w = await who(ctx);
  // Abgeben nur der Coach; der Coachee sieht die Dateien
  if (!w || w.user.role !== "coach") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = body?.kind === "bank" ? "bank" : body?.kind === "fachstelle" ? "fachstelle" : null;
  if (!kind) return NextResponse.json({ error: "Unbekannte Fassung." }, { status: 400 });
  try {
    await createAbgabe(w.user, w.c, kind);
  } catch (e) {
    console.error("Abgabe Businessplan", e);
    return NextResponse.json({ error: "Die Unterlagen konnten gerade nicht erstellt werden. Bitte später noch einmal versuchen." }, { status: 500 });
  }
  await audit(w.user.id, "bp_abgabe", w.c.id, { kind });
  if (w.user.role !== "coach") {
    await notify([w.c.coach_id], { title: `${w.c.first_name} ${w.c.last_name} hat den Businessplan abgegeben`, body: `Fassung für ${abgabeLabel(kind)}. Die Dateien liegen in den Dokumenten.`, url: `/coach/coachees/${w.c.id}?tab=businessplan`, tag: `abgabe-${w.c.id}` }).catch(() => undefined);
  }
  return NextResponse.json({ abgaben: await listAbgaben(w.c.id) });
}
