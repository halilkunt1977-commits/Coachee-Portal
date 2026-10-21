import "server-only";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/*
 * Feste Antworten für lokale Tests ohne OpenAI-Schlüssel (AI_MOCK=1, nur außerhalb von production, siehe lib/ai.ts).
 * Der Text zeigt, welche Teile des Materials angekommen sind, damit man den Kontext prüfen kann.
 * Das zuletzt gesendete Material liegt zum Nachsehen in <tmp>/ai-mock-input.txt.
 */
export function mockJson(schemaName: string, input: string): unknown {
  void writeFile(path.join(os.tmpdir(), "ai-mock-input.txt"), input).catch(() => {});
  const parts = [...input.matchAll(/^== (.+?) ==$/gm)].map((m) => m[1]);
  const vorhaben = input.match(/^Vorhaben: (.+)$/m)?.[1] ?? "die Gründung";
  const instruction = input.match(/^Neue Nachricht des Coachs \(Notizen oder Anweisung\): (.+)$/m)?.[1] ?? "";
  if (schemaName === "kapitel") {
    const short = /kürzer/i.test(instruction);
    const text = [
      `[Name] plant: ${vorhaben}. Grundlage dieses Testtextes sind die Notizen des Coachs und die Bausteine aus den Gesprächen.`,
      ...(short
        ? []
        : [
            "### Leistungen im Überblick",
            "- Leistung A für Privatkunden\n- Leistung B für Hausverwaltungen\n- Kleinaufträge im Gewerbe",
            "### Kundengruppen",
            "| Kundengruppe | Anteil Jahr 1 | Ansprache |\n| --- | --- | --- |\n| Privat | 60 % | Empfehlung |\n| Hausverwaltungen | 30 % | Direktansprache |\n| Gewerbe | 10 % | Website |",
            `Die Zahl der Betriebe im Landkreis ist noch offen [Anzahl Betriebe der Branche im Landkreis mit Quelle].${instruction ? ` Umgesetzte Anweisung: ${instruction}` : ""}`,
          ]),
    ].join("\n\n");
    return {
      text,
      sources: input.includes("Handwerkskammer") ? ["Handwerkskammer (2026): Schriftliche Auskunft"] : [],
      note: `Testantwort ohne KI. Material: ${parts.join(", ") || "keins"}.`,
    };
  }
  if (schemaName === "auf_einen_blick") {
    return {
      items: [
        { label: "Gründungsvorhaben", value: vorhaben },
        { label: "Zielgruppe", value: "Privatkunden, Hausverwaltungen" },
        { label: "Rechtsform", value: "Einzelunternehmen" },
        { label: "Startdatum", value: "" },
      ],
    };
  }
  return {};
}
