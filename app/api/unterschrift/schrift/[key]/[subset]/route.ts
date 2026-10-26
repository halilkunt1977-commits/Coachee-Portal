import { readFile } from "node:fs/promises";
import path from "node:path";
import { SIGNATURE_FONTS, SIGNATURE_SUBSETS } from "@/lib/signature-fonts";

// Handschriften für die Unterschrift-Vorschläge (öffentlich, nur freie Schriften)
export async function GET(_request: Request, ctx: RouteContext<"/api/unterschrift/schrift/[key]/[subset]">) {
  const { key, subset } = await ctx.params;
  const font = SIGNATURE_FONTS.find((f) => f.key === key);
  if (!font || !(SIGNATURE_SUBSETS as readonly string[]).includes(subset)) return new Response("Nicht gefunden", { status: 404 });
  const file = path.join(process.cwd(), "node_modules", "@fontsource", font.key, "files", `${font.key}-${subset}-${font.weight}-normal.woff2`);
  const data = await readFile(file);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=604800, immutable" } });
}
