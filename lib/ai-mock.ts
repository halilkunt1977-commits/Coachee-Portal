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
  if (schemaName === "bp_chat") {
    const q = input.match(/^Neue Frage des Coachs: (.+)$/m)?.[1] ?? "";
    return { answer: `**Testantwort ohne KI** zur Frage „${q}“.\n\n- Stärke: Kapitel 3 ist klar.\n- Schwäche: Umsatz in Kapitel 12 fehlt.\n\nNächster Schritt: Zielgruppe schärfen.` };
  }
  if (schemaName === "bp_pruefung") {
    const neu = input.match(/^Neue Angaben des Coachs: (.+)$/m)?.[1] ?? "";
    const leer = [...input.matchAll(/^## \d+\. .+? \[key: (\w+)\] – 0 Wörter/gm)].map((m) => m[1]);
    const keys = [...input.matchAll(/\[key: (\w+)\]/g)].map((m) => m[1]);
    return {
      note: `Testprüfung ohne KI. Angaben: ${neu}`,
      glance: true,
      chapters: keys.map((key, i) => ({ key, action: leer.includes(key) ? "neu" : i < 3 ? "anpassen" : "lassen", todo: leer.includes(key) ? "Kapitel ist leer." : i < 3 ? `Neue Angaben einarbeiten: ${neu.slice(0, 80)}` : "Stimmig." })),
    };
  }
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
  if (schemaName === "text") {
    const job = input.match(/^Stelle: (.+)$/m)?.[1];
    return { text: job ? `Kurzprofil (Test) zugeschnitten auf: ${job}. Anzeige ${input.includes("Anzeigentext:") ? "gelesen" : "ohne Text"}.` : "Kurzprofil (Test) aus den Angaben im Lebenslauf." };
  }
  if (schemaName === "finanzplan") {
    const json = input.match(/^Aktueller Finanzplan \(JSON\):\n(.+)$/m)?.[1] ?? "{}";
    const finance = JSON.parse(json) as { costs?: unknown[] };
    const message = input.match(/^Nachricht des Coachs: (.+)$/m)?.[1] ?? "";
    finance.costs = [...(finance.costs ?? []), { label: "Miete Büro", monthly: [450, 450, 450], category: "Raumkosten", note: "Testeintrag ohne KI", from: 1 }];
    return { note: `Testantwort ohne KI zu „${message}“: Miete Büro mit 450 € im Monat ab Monat 2 eingetragen.`, finance };
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
  if (schemaName === "stellenanalyse") {
    return {
      fit: "mittel",
      score: 60,
      summary: `Testantwort ohne KI. Material: ${parts.join(", ") || "Stelle und Profil"}.`,
      strengths: ["Erfahrung im Lager"],
      gaps: ["Noch keine Führungserfahrung belegt"],
      cv_tips: ["Lagerstationen nach vorn"],
      letter_tips: ["Zuverlässigkeit belegen"],
      interview: ["Warum diese Stelle?"],
      salary: "",
      next_steps: ["Stellentext einfügen"],
      report: "Testbericht ohne KI.",
    };
  }
  if (schemaName === "gespraechsfragen" || schemaName === "gespraechsfrage") {
    const wunsch = input.match(/^(?:Wunsch|Anweisung) des Coachs: (.+)$/m)?.[1] ?? "";
    const q = (n: number) => ({ question: `Testfrage ${n}: Wie gehen Sie mit ${wunsch.slice(0, 40) || "Zeitdruck"} um?`, answer: "Ich bleibe ruhig, kläre zuerst, was am dringendsten ist, und spreche mich mit dem Team ab.", tips: "Ein konkretes Beispiel aus deiner letzten Stelle macht die Antwort glaubwürdig.", followups: ["Können Sie ein Beispiel nennen?"] });
    return schemaName === "gespraechsfrage" ? { question: q(0) } : { questions: [q(1), q(2), q(3), q(4)] };
  }
  if (schemaName === "gespraechsvorbereitung") {
    const stelle = input.match(/^Stelle: (.+)$/m)?.[1] ?? "die Stelle";
    const station = input.match(/^- .+? bis .+?: (.+)$/m)?.[1] ?? "meiner letzten Stelle";
    return {
      focus: `${/^Anweisung des Coachs: (.+)$/m.test(input) ? `Überarbeitet nach „${input.match(/^Anweisung des Coachs: (.+)$/m)![1]}“. ` : ""}${/^Was der Coach über Stelle/m.test(input) ? "Mit der Beschreibung des Coachs. " : ""}Testtext für „${stelle}“. Im Gespräch kommt es darauf an, dass du deine Erfahrung aus ${station} ruhig und konkret erklärst.${input.includes("Stellentext: liegt nicht vor") ? " Der Stellentext fehlt, deshalb orientiert sich die Vorbereitung an typischen Anforderungen des Berufs." : ""}`,
      questions: [
        { question: "Erzählen Sie uns etwas über sich.", answer: `Ich bringe Erfahrung aus ${station} mit. Dort habe ich gelernt, sorgfältig und im Team zu arbeiten.`, tips: "Der Arbeitgeber will sehen, ob du dich kurz und klar vorstellen kannst. Höchstens zwei Minuten.", followups: ["Warum haben Sie dort aufgehört?"] },
        { question: `Warum möchten Sie als ${stelle} bei uns arbeiten?`, answer: "Die Aufgaben passen zu dem, was ich bisher gemacht habe, und ich möchte mich in diesem Bereich weiterentwickeln.", tips: "Nenne einen konkreten Grund, der mit dem Betrieb zu tun hat.", followups: ["Was wissen Sie über unseren Betrieb?", "Wo sehen Sie sich in drei Jahren?"] },
        { question: "Was ist Ihre größte Schwäche?", answer: "Ich bin manchmal ungeduldig, wenn Abläufe unklar sind. Ich frage deshalb früh nach und schreibe mir Absprachen auf.", tips: "Eine echte Schwäche nennen und zeigen, wie du damit umgehst.", followups: ["Können Sie ein Beispiel nennen?"] },
        { question: "Welche Gehaltsvorstellung haben Sie?", answer: "Ich habe mich an üblichen Gehältern orientiert und stelle mir etwa [Spanne] brutto im Jahr vor.", tips: "Eine Spanne nennen, die du mit deinem Coach abgestimmt hast.", followups: [] },
      ],
      behavior: ["Sei etwa 10 Minuten vorher da.", "Begrüße alle freundlich mit Blickkontakt.", "Schalte dein Handy aus."],
      bring: ["Bewerbungsmappe", "Ausweis", "Stift und Notizen mit deinen Fragen"],
      avoid: ["Nicht schlecht über frühere Arbeitgeber reden.", "Fragen nach Gesundheit oder Familienplanung musst du nicht beantworten; lenke freundlich zur Stelle zurück."],
      ask: ["Wie sieht die Einarbeitung aus?", "Wie ist das Team aufgestellt?", "Wie geht es nach dem Gespräch weiter?"],
    };
  }
  return {};
}
