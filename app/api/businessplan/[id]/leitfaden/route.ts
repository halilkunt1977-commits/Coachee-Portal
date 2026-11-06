import { NextResponse, type NextRequest } from "next/server";
import { coacheeFor, fullName } from "@/lib/access";
import { AiError, assertAiAllowed } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { brancheOf } from "@/lib/bp/branchen";
import { termine } from "@/lib/bp/leitfaden";
import { checkLeitfaden, leitfadenStand, toggleFrage } from "@/lib/bp/leitfaden-ki";
import { planFor } from "@/lib/bp/store";
import { SECTIONS } from "@/lib/bp/sections";
import { htmlToPdf } from "@/lib/cv/pdf";

/*
 * Gesprächsleitfaden zum Businessplan (nur Coach).
 * GET: Stand (welche Fragen beantwortet sind), mit ?pdf=1 der Leitfaden zum Ausdrucken.
 * POST { check: true } gleicht mit Protokollen und Notizen ab, POST { toggle: id, done } hakt eine Frage ab.
 */

async function coach(ctx: RouteContext<"/api/businessplan/[id]/leitfaden">) {
  const session = await getSession();
  if (!session || session.user.role !== "coach" || !session.mfaPassed) return null;
  const { id } = await ctx.params;
  const c = await coacheeFor(session.user, id);
  if (c.coaching_type !== "gruendung") return null;
  return { user: session.user, c };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/leitfaden">) {
  const who = await coach(ctx);
  if (!who) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  await planFor(who.c);
  const { stand, stale } = await leitfadenStand(who.c.id);
  if (!request.nextUrl.searchParams.get("pdf")) return NextResponse.json({ stand, stale });
  const plan = await planFor(who.c);
  const profile = brancheOf(plan.branche);
  const title = (k: string) => `${SECTIONS.findIndex((s) => s.key === k) + 1}. ${SECTIONS.find((s) => s.key === k)?.title ?? k}`;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1d2433; }
    h1 { font-size: 18pt; color: #1f3a5f; margin: 0 0 2mm; } h2 { font-size: 13pt; color: #1f3a5f; border-bottom: 1.5px solid #c9a24a; padding-bottom: 1mm; margin: 7mm 0 2mm; break-after: avoid; }
    .meta { color: #5b6475; margin-bottom: 4mm; } .muted { color: #5b6475; font-size: 9pt; }
    ul { margin: 1mm 0 2mm; padding-left: 5mm; } li { margin: 1.2mm 0; break-inside: avoid; }
    .done { color: #2f6b45; } .answer { display: block; color: #2f6b45; font-size: 9pt; } .line { display: block; border-bottom: 1px dotted #9aa3b2; height: 6mm; }
    .b { color: #8a6a1f; font-size: 8.5pt; }
  </style></head><body>
  <h1>Gesprächsleitfaden Businessplan</h1>
  <p class="meta">${esc(fullName(who.c))}${profile ? ` · Branche: ${esc(profile.label)}` : ""} · Stand ${new Date().toLocaleDateString("de-DE")}</p>
  ${termine(plan.branche).map((t) => `<h2>Termin ${t.nr}: ${esc(t.title)}</h2>
    <p class="muted">Kapitel ${t.chapters.map((k) => esc(title(k))).join(", ")} · Mitbringen: ${esc(t.mitbringen.join(", "))}</p>
    <ul>${t.fragen.map((f) => {
      const a = stand.answers[f.id];
      return `<li class="${a ? "done" : ""}">${a ? "✓ " : "☐ "}${esc(f.text)}${f.branche ? ' <span class="b">(Branche)</span>' : ""}${a?.answer ? `<span class="answer">${esc(a.answer)}</span>` : a ? "" : '<span class="line"></span>'}</li>`;
    }).join("")}</ul>`).join("")}
  </body></html>`;
  try {
    const pdf = await htmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Leitfaden ${fullName(who.c)}.pdf`)}`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Leitfaden-PDF", e);
    return new NextResponse("Das PDF konnte gerade nicht erzeugt werden.", { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/businessplan/[id]/leitfaden">) {
  const who = await coach(ctx);
  if (!who) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { check?: unknown; toggle?: unknown; done?: unknown } | null;
  try {
    if (typeof body?.toggle === "string") return NextResponse.json({ stand: await toggleFrage(who.c.id, body.toggle.slice(0, 80), body.done === true), stale: false });
    if (body?.check === true) {
      await assertAiAllowed(who.user, { coachOnly: true });
      return NextResponse.json({ stand: await checkLeitfaden(who.user, who.c), stale: false });
    }
    return NextResponse.json({ error: "Unbekannte Anfrage." }, { status: 400 });
  } catch (e) {
    if (!(e instanceof AiError)) console.error("Leitfaden", e);
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Das hat gerade nicht geklappt." }, { status: e instanceof AiError ? 400 : 500 });
  }
}
