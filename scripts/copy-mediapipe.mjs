// Dateien der Gesichtserkennung (Interview-Training) aus node_modules nach public/mediapipe/wasm kopieren,
// damit sie vom Portal selbst kommen und kein fremder Server angefragt wird. Läuft vor dem Build und nach npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const dst = path.join("public", "mediapipe", "wasm");
if (!existsSync(src)) {
  console.warn("mediapipe: node_modules fehlt, nichts kopiert");
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) copyFileSync(path.join(src, f), path.join(dst, f));
console.log("mediapipe: wasm kopiert");
