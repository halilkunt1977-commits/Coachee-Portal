import { ago } from "./inbox/time";

/*
 * Online-Anzeige für den Coach. Der Coachee-Bereich meldet sich regelmäßig (components/presence/Heartbeat.tsx),
 * gespeichert wird nur der Zeitpunkt und ein grober Bereich, nie die Adresse.
 * „online“: in den letzten 2 Minuten gesehen, „kürzlich aktiv“: in den letzten 15 Minuten.
 * Nach dem Abmelden ist der Bereich leer, dann zählt nur noch „zuletzt online“.
 */
export const ONLINE_MS = 2 * 60_000;
export const RECENT_MS = 15 * 60_000;

/** Grober Bereich zu einer Adresse des Coachee-Bereichs, die Reihenfolge zählt (spezifisch vor allgemein) */
const AREAS: [RegExp, string][] = [
  [/^\/mein-bereich\/posteingang/, "Posteingang"],
  [/^\/mein-bereich\/kalender/, "Kalender"],
  [/^\/mein-bereich\/aufgaben/, "Aufgaben"],
  [/^\/mein-bereich\/businessplan/, "Businessplan"],
  [/^\/mein-bereich\/finanzplan/, "Finanzplan"],
  [/^\/mein-bereich\/stellen/, "Stellensuche"],
  [/^\/mein-bereich\/bewerbungen/, "Bewerbungen"],
  [/^\/mein-bereich\/handbuch/, "Handbuch"],
  [/^\/mein-bereich\/lebenslauf/, "Lebenslauf"],
  [/^\/mein-bereich\/erfahrung/, "Erfahrungsbogen"],
  [/^\/mein-bereich\/assistent/, "Assistent"],
  [/^\/mein-bereich\/?$/, "Startseite"],
  [/^\/lebenslauf(\/|$)/, "Lebenslauf"],
  [/^\/anschreiben(\/|$)/, "Anschreiben"],
];

export function areaFor(path: string) {
  return AREAS.find(([re]) => re.test(path))?.[1] ?? "Portal";
}

/** Online-Stand eines Coachees, wie ihn /api/praesenz liefert */
export type Presence = { id: string; name: string; seen: string | null; area: string | null };
export type PresenceState = "online" | "kuerzlich" | "offline";

export function presenceState(p: Pick<Presence, "seen" | "area"> | undefined, now: number): PresenceState {
  if (!p?.seen || !p.area) return "offline";
  const age = now - new Date(p.seen).getTime();
  return age <= ONLINE_MS ? "online" : age <= RECENT_MS ? "kuerzlich" : "offline";
}

/** „Online · gerade bei Lebenslauf“, „Kürzlich aktiv · vor 6 Min.“, „Zuletzt online gestern“ oder null, wenn nie gesehen */
export function presenceText(p: Presence | undefined, now: number) {
  const state = presenceState(p, now);
  if (!p?.seen) return null;
  if (state === "online") return `Online · gerade bei ${p.area}`;
  if (state === "kuerzlich") return `Kürzlich aktiv · ${ago(p.seen, now)} bei ${p.area}`;
  return `Zuletzt online ${ago(p.seen, now)}`;
}
