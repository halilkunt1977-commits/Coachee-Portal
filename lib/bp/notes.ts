// Schreibhilfe im Businessplan (nur Coach): Verlauf pro Kapitel aus Notizen des Coachs und Vorschlägen der KI.
// Ohne Server-Abhängigkeiten, damit Editor und Server dieselben Typen nutzen.

/** ersetzt: durch einen überarbeiteten Vorschlag abgelöst */
export type TurnStatus = "offen" | "uebernommen" | "verworfen" | "ersetzt";
export type ChatTurn = { id: string; role: "coach" | "ki"; text: string; sources?: string; note?: string; status?: TurnStatus; at: string };
export type ChapterChats = Record<string, ChatTurn[]>;

/** Schlüssel für die Notizen zum ganzen Vorhaben */
export const VORHABEN = "vorhaben";
/** So viele Einträge bleiben pro Kapitel gespeichert, ältere fallen weg */
export const MAX_TURNS = 40;
export const MAX_NOTE = 8000;

export function normalizeTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x): ChatTurn => ({
      id: String(x.id ?? ""),
      role: x.role === "ki" ? ("ki" as const) : ("coach" as const),
      text: typeof x.text === "string" ? x.text : "",
      ...(typeof x.sources === "string" && x.sources ? { sources: x.sources } : {}),
      ...(typeof x.note === "string" && x.note ? { note: x.note } : {}),
      ...(x.status === "offen" || x.status === "uebernommen" || x.status === "verworfen" || x.status === "ersetzt" ? { status: x.status as TurnStatus } : {}),
      at: typeof x.at === "string" ? x.at : "",
    }))
    .filter((t) => t.id && (t.text || t.role === "coach"))
    .slice(-MAX_TURNS);
}

/** Der Vorschlag, der noch auf eine Entscheidung wartet (der jüngste offene) */
export const openProposal = (turns: ChatTurn[]) => [...turns].reverse().find((t) => t.role === "ki" && t.status === "offen") ?? null;
