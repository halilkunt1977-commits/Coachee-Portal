// Prüft die Aufbewahrung (14 Tage, 8 Wochen, 6 Monate) mit erfundenen Sicherungen. Aufruf: node scripts/test/retention.mjs
import { backupName, berlinDate, selectKeep } from "../../lib/backup/format.mjs";

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FEHL"} ${name}${ok ? "" : `\n  bekommen: ${JSON.stringify(got)}\n  erwartet: ${JSON.stringify(want)}`}`);
};

// 400 Nächte, jeweils 02:30 Berliner Zeit (00:30 UTC im Sommer, 01:30 im Winter), letzte am Dienstag 20.10.2026
const names = [];
for (let i = 0; i < 400; i++) {
  const d = new Date(Date.UTC(2026, 9, 20, 0, 30) - i * 86_400_000);
  names.push(backupName(d));
}
// dazu zwei Sicherungen per Hand am letzten Tag und eine am Vortag
names.push(backupName(new Date("2026-10-20T09:15:00Z")), backupName(new Date("2026-10-20T13:00:00Z")), backupName(new Date("2026-10-19T16:00:00Z")));
const now = new Date("2026-10-20T14:00:00Z");
const keep = selectKeep(names, undefined, new Date("2026-10-22T14:00:00Z")); // zwei Tage später: nur Tag/Woche/Monat zählen
eq("Anzahl", keep.size, 24);
eq("neueste bleibt (Handsicherung 13:00 UTC)", keep.has(backupName(new Date("2026-10-20T13:00:00Z"))), true);
eq("frühere Handsicherung am selben Tag fällt weg", keep.has(backupName(new Date("2026-10-20T09:15:00Z"))), false);
const berlin = [...keep].map((n) => berlinDate(new Date(Date.UTC(+n.slice(17, 21), +n.slice(21, 23) - 1, +n.slice(23, 25), +n.slice(26, 28), +n.slice(28, 30))))).sort();
eq("behaltene Tage (Berlin)", berlin, [
  "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", // Monate
  "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-09-30", "2026-10-04", // Wochen (Sonntage) und September
  ...Array.from({ length: 14 }, (_, i) => `2026-10-${String(7 + i).padStart(2, "0")}`), // 14 Tage
]);
const fresh = selectKeep(names, undefined, now);
eq("innerhalb von 24 Stunden bleibt auch die frühere Handsicherung", fresh.has(backupName(new Date("2026-10-20T09:15:00Z"))), true);
eq("leere Liste", [...selectKeep([])], []);
eq("fremde Namen werden ignoriert", [...selectKeep(["notiz.txt", names[0]])], [names[0]]);
// Sicherung kurz nach Mitternacht Berliner Zeit zählt zum Berliner Tag, nicht zum UTC-Tag
eq("Berliner Tag", berlinDate(new Date("2026-10-19T22:30:00Z")), "2026-10-20");
process.exit(fails ? 1 : 0);
