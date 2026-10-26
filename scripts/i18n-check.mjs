// Prüft, ob jeder Text in t("…") eine türkische Übersetzung in lib/i18n-tr.ts hat. Aufruf: node scripts/i18n-check.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tr = readFileSync(path.join(root, "lib/i18n-tr.ts"), "utf8");
const keys = new Set([...tr.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules" && !f.startsWith(".")) walk(p); }
    else if (/\.(tsx?|mjs)$/.test(f) && !p.endsWith("i18n-tr.ts")) files.push(p);
  }
};
for (const d of ["app", "components", "lib"]) walk(path.join(root, d));

const missing = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = JSON.parse(`"${m[1]}"`);
    if (!keys.has(key)) missing.set(key, path.relative(root, f));
  }
}
for (const [k, f] of missing) console.log(`${f}: ${k}`);
console.log(missing.size ? `${missing.size} Texte ohne Übersetzung` : `Alles übersetzt (${keys.size} Einträge)`);
process.exitCode = missing.size ? 1 : 0;
