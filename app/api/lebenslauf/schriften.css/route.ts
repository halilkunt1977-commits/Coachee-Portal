import { cvFontCss } from "@/lib/cv/fonts";

// Schriften für die Live-Vorschau im Editor (öffentlich, enthält nur die freien Source-Schriften)
export function GET() {
  return new Response(cvFontCss(), { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
