import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// Schriften für Lebensläufe als eingebettete Daten, damit Vorschau und PDF ohne fremde Server gleich aussehen.
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

let css: string | null = null;

export function cvFontCss() {
  if (css) return css;
  const faces: string[] = [];
  const add = (family: string, pkg: string, weight: number, style: "normal" | "italic") => {
    for (const [subset, range] of [["latin", LATIN], ["latin-ext", LATIN_EXT]] as const) {
      const file = path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", `${pkg}-${subset}-${weight}-${style}.woff2`);
      const data = readFileSync(file).toString("base64");
      faces.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${range}}`);
    }
  };
  for (const w of [400, 600, 700]) add("Source Sans 3", "source-sans-3", w, "normal");
  add("Source Sans 3", "source-sans-3", 400, "italic");
  for (const w of [400, 600]) add("Source Serif 4", "source-serif-4", w, "normal");
  css = faces.join("\n");
  return css;
}
