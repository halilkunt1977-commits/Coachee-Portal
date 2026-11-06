import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { audit, getSession } from "@/lib/auth";
import { normalizeBank } from "@/lib/bp/bank";
import { draftBankAnswers, saveBank } from "@/lib/bp/bank-ki";
import { copyFromAmt, draftBankPlan } from "@/lib/bp/bank-plan";
import { bankLeitfadenHtml } from "@/lib/bp/bank-leitfaden";
import { planFor } from "@/lib/bp/store";
import { htmlToPdf } from "@/lib/cv/pdf";

/*
 * Angaben für Bank und Förderung.
 * GET ?pdf=1: Leitfaden „Bank und Förderung“ als PDF (Coach und Coachee).
 * POST { copy: true, all? } übernimmt Kapitel aus dem Plan fürs Amt, POST { plan: true, all? } schreibt die Bankfassung mit der KI (Coach).
 * POST { save: BankInfo } speichert die Angaben (Coach und Coachee), POST { draft: true, all? } entwirft die Antworten fürs Bankgespräch (Coach, KI).
 */

async function who(ctx: RouteContext<"/api/businessplan/[id]/bank">) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id).catch(() => null);
  if (!c || c.coaching_type !== "gruendung") return null;
  return { user: session.user, c, coach: session.user.role === "coach" && session.mfaPassed };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/bank">) {
  const w = await who(ctx);
  if (!w) return new NextResponse("Nicht angemeldet", { status: 401 });
  const plan = await planFor(w.c);
  try {
    const pdf = await htmlToPdf(bankLeitfadenHtml(fullName(w.c), plan.finance, plan.bank));
    await audit(w.user.id, "bp_bank_leitfaden", w.c.id);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Leitfaden Bank und Förderung ${fullName(w.c)}.pdf`)}`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Leitfaden Bank", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden. Bitte später noch einmal versuchen.", { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/bank">) {
  const w = await who(ctx);
  if (!w) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { save?: unknown; draft?: unknown; all?: unknown; copy?: unknown; plan?: unknown } | null;
  try {
    // Kapitel der Bankfassung aus dem Plan fürs Amt übernehmen (alle) oder von der KI schreiben lassen (Coach)
    if (body?.copy === true) return NextResponse.json({ sections: await copyFromAmt(w.user, w.c, body.all === true) });
    if (body?.plan === true) {
      if (!w.coach) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
      await assertAiAllowed(w.user, { coachOnly: true });
      const sections = await draftBankPlan(w.user, w.c, body.all === true);
      await audit(w.user.id, "bp_bank_plan_ki", w.c.id);
      return NextResponse.json({ sections });
    }
    if (body?.save) {
      const bank = normalizeBank(body.save);
      await saveBank(w.c.id, bank);
      return NextResponse.json({ bank });
    }
    if (body?.draft === true) {
      if (!w.coach) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
      await assertAiAllowed(w.user, { coachOnly: true });
      const bank = await draftBankAnswers(w.user, w.c, body.all === true);
      await audit(w.user.id, "bp_bank_ki", w.c.id);
      return NextResponse.json({ bank });
    }
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("Bankangaben", e);
    return NextResponse.json({ error: "Das hat gerade nicht geklappt. Bitte noch einmal versuchen." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unbekannte Anfrage." }, { status: 400 });
}
