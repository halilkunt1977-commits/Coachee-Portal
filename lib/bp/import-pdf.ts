import "server-only";
import type { Coachee } from "../access";
import { AiError, jsonResponse, pseudonymize } from "../ai";
import type { User } from "../auth";
import { wordCount } from "./markdown";
import { SECTIONS, type GlanceItem } from "./sections";

/*
 * Businessplan aus einer PDF (oder aus dem Text einer Word-Datei ohne Vorlagen-Aufbau) übernehmen.
 * 1. Kapitel an ihren nummerierten Titeln erkennen („4. Zielgruppe“); das Inhaltsverzeichnis zählt nicht.
 * 2. Im PDF-Text gehen Überschriften, Listen und Tabellen verloren: Die KI stellt sie je Kapitel wieder her,
 *    ohne den Wortlaut zu ändern. Ohne KI bleibt der Text in Absätzen.
 * 3. Findet die Erkennung kaum Kapitel (freier Aufbau), ordnet die KI den ganzen Text den 14 Kapiteln zu.
 */

export type TextImport = {
  subtitle: string;
  glance: GlanceItem[];
  sections: Record<string, { text: string; sources: string }>;
  stats: { key: string; title: string; words: number }[];
  unmatched: string[];
  /** wie die Kapitel gefunden wurden */
  how: "titel" | "ki";
  formatted: boolean;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").trim();
const TITLE = /^(\d{1,2})\s*[.)]?\s+(.{3,90}?)(?:\s*\.{2,}\s*\d+|\s+\d{1,3})?$/;

function keyOf(line: string): string | null {
  const m = TITLE.exec(line.trim());
  if (!m) return null;
  const t = norm(m[2]);
  const s = SECTIONS.find((x) => norm(x.title) === t) ?? SECTIONS.find((x) => t.startsWith(norm(x.title)) || (t.length > 8 && norm(x.title).startsWith(t)));
  return s && SECTIONS.indexOf(s) + 1 === Number(m[1]) ? s.key : null;
}

/** Seitenzahlen und wiederkehrende Kopf-/Fußzeilen entfernen */
function cleanLines(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const count = new Map<string, number>();
  for (const l of lines) if (l && l.length < 80) count.set(l, (count.get(l) ?? 0) + 1);
  return lines.filter((l) => !/^\d{1,3}$/.test(l) && !/^seite \d+( von \d+)?$/i.test(l) && !((count.get(l) ?? 0) >= 3 && !keyOf(l) && l.length < 80 && /business\s*plan/i.test(l)));
}

/** Zeilen zu Absätzen: Eine Zeile, die nicht mit Satzzeichen endet und lang ist, läuft im nächsten weiter */
function reflow(lines: string[]) {
  const max = Math.max(40, ...lines.map((l) => l.length));
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (!l) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur = cur ? `${cur}${cur.endsWith("-") ? "" : " "}${l}` : l;
    if (/[.!?:]$/.test(l) || l.length < max * 0.7) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out.join("\n\n");
}

function splitSources(lines: string[]) {
  const i = lines.findIndex((l) => /^quellen\s*:?$/i.test(l));
  return i < 0 ? { body: lines, sources: "" } : { body: lines.slice(0, i), sources: lines.slice(i + 1).filter(Boolean).join("\n") };
}

/** Kapitel an den Titeln erkennen */
export function splitByTitles(text: string) {
  const lines = cleanLines(text);
  const last = new Map<string, number>();
  lines.forEach((l, i) => {
    const k = keyOf(l);
    if (k) last.set(k, i);
  });
  // in der Reihenfolge der Vorlage, jede Fundstelle nach der vorigen (sonst ist es das Inhaltsverzeichnis)
  const starts: { key: string; at: number }[] = [];
  for (const s of SECTIONS) {
    const at = last.get(s.key);
    if (at !== undefined && (!starts.length || at > starts[starts.length - 1].at)) starts.push({ key: s.key, at });
  }
  const raw: Record<string, { lines: string[]; sources: string }> = {};
  // Nach dem letzten Kapitel folgt oft der Finanzplan als Anhang; der gehört nicht in den Text
  const lastAt = starts[starts.length - 1]?.at ?? 0;
  const appendix = lines.findIndex((l, i) => i > lastAt && /^(anhang\b|anlage\b|finanzplan$)/i.test(l));
  const end = appendix > 0 ? appendix : lines.length;
  starts.forEach((s, i) => {
    const { body, sources } = splitSources(lines.slice(s.at + 1, starts[i + 1]?.at ?? end));
    raw[s.key] = { lines: body, sources };
  });

  // Vor dem ersten Kapitel: Untertitel und „Auf einen Blick“ (Bezeichnung mit Doppelpunkt, Wert darunter oder dahinter)
  const front = lines.slice(0, starts[0]?.at ?? 0);
  const glance: GlanceItem[] = [];
  const g = front.findIndex((l) => norm(l) === "auf einen blick");
  if (g >= 0) {
    let label: string | null = null;
    for (const l of front.slice(g + 1)) {
      if (!l || keyOf(l)) continue;
      if (/^kennzahl\b/i.test(l)) break;
      const m = /^([^:]{2,60}):\s*(.*)$/.exec(l);
      if (m && !m[2]) label = m[1].trim();
      else if (m) glance.push({ label: m[1].trim(), value: m[2].trim() });
      else if (label) {
        glance.push({ label, value: l });
        label = null;
      } else if (glance.length) glance[glance.length - 1].value += `\n${l}`;
    }
  }
  const title = front.findIndex((l) => /^business\s*plan\b/i.test(l));
  const subtitle = title >= 0 ? (front.slice(title + 1, title + 4).find((l) => l && !/^stand\b/i.test(l) && !/business\s*plan/i.test(l) && !/^\d/.test(l) && l.length > 12) ?? "") : "";
  return { raw, glance, subtitle };
}

const FORMAT_SCHEMA = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };
const FORMAT_INSTRUCTIONS = `Du bekommst den Text eines Kapitels aus einem Businessplan, der aus einer PDF ausgelesen wurde. Dabei sind Zeilenumbrüche, Zwischenüberschriften, Aufzählungen und Tabellen verloren gegangen.
Stelle die Struktur als Markdown wieder her:
- Absätze getrennt durch eine Leerzeile, Zeilen innerhalb eines Absatzes zusammenfügen, Silbentrennung am Zeilenende aufheben.
- Kurze Zeilen, die erkennbar Zwischenüberschriften sind, als eigene Zeile mit „### “.
- Aufzählungen mit „- “ (nummerierte mit „1. “).
- Tabellen (Zeilen mit gleich vielen Spalten, z. B. Kundengruppe / Anteil / Ansprache) als Markdown-Tabelle mit Kopfzeile und | --- |.
WICHTIG: Ändere keinen Wortlaut. Kein Wort weglassen, hinzufügen oder umformulieren, keine Zahlen ändern. Keine Kapitelüberschrift. Platzhalter wie [Name] bleiben stehen.`;

const SPLIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subtitle", "chapters"],
  properties: {
    subtitle: { type: "string" },
    chapters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["key", "text", "sources"], properties: { key: { type: "string", enum: SECTIONS.map((s) => s.key) }, text: { type: "string" }, sources: { type: "array", items: { type: "string" } } } },
    },
  },
};
const SPLIT_INSTRUCTIONS = `Du bekommst den Text eines Businessplans (oder Ideenpapiers) in freiem Aufbau, ausgelesen aus einer Datei. Ordne die Inhalte den 14 Kapiteln der Vorlage zu: ${SECTIONS.map((s, i) => `${i + 1}. ${s.title} [${s.key}]`).join(", ")}.
- Übernimm den Text möglichst wörtlich in das passende Kapitel; formuliere nicht um und erfinde nichts. Ein Abschnitt gehört in genau ein Kapitel.
- Stelle die Struktur als Markdown her: Absätze mit Leerzeile, Zwischenüberschriften mit „### “, Aufzählungen mit „- “, Tabellen als Markdown-Tabelle.
- Quellenangaben eines Abschnitts gehören ins Feld sources des Kapitels (eine pro Eintrag).
- Kapitel ohne passenden Inhalt lässt du weg. Zahlenkolonnen eines Finanzplans gehören nicht in den Text (die übernimmt der Finanzplan), eine kurze Beschreibung der Finanzierung schon in Kapitel 12.
- subtitle: das Vorhaben in wenigen Worten, falls genannt (z. B. „Gründung eines Malerbetriebs“), sonst leer.
- Namen sind durch [Name] ersetzt.`;

/** Text eines Businessplans in Kapitel zerlegen; mit KI (wenn erlaubt) Struktur wiederherstellen bzw. frei zuordnen */
export async function planFromText(user: User, c: Coachee, text: string, ai: boolean): Promise<TextImport | null> {
  const names = [c.first_name, c.last_name];
  const fill = (s: string) => s.replaceAll("[Name]", `${c.first_name} ${c.last_name}`.trim());
  const found = splitByTitles(text);
  const keys = Object.keys(found.raw).filter((k) => found.raw[k].lines.some((l) => l.trim()));
  const sections: TextImport["sections"] = {};
  let how: TextImport["how"] = "titel";
  let formatted = false;

  if (keys.length >= 3) {
    for (const k of keys) sections[k] = { text: reflow(found.raw[k].lines), sources: found.raw[k].sources };
    if (ai) {
      const queue = [...keys];
      let ok = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          for (let k = queue.shift(); k; k = queue.shift()) {
            try {
              const out = await jsonResponse<{ text: string }>({ coacheeId: c.id, userId: user.id, purpose: "businessplan", schemaName: "pdf_kapitel", schema: FORMAT_SCHEMA, maxTokens: 12000, instructions: FORMAT_INSTRUCTIONS, input: pseudonymize(found.raw[k].lines.join("\n").slice(0, 40000), names) });
              const t = fill(out.text).trim();
              // nur übernehmen, wenn der Umfang passt (die KI soll nichts weglassen)
              if (t && wordCount(t) >= wordCount(sections[k].text) * 0.85) {
                sections[k].text = t;
                ok++;
              }
            } catch (e) {
              if (!(e instanceof AiError)) console.error("PDF-Kapitel", k, e);
            }
          }
        }),
      );
      formatted = ok > 0;
    }
  } else if (ai && text.trim().length > 300) {
    how = "ki";
    const out = await jsonResponse<{ subtitle: string; chapters: { key: string; text: string; sources: string[] }[] }>({ coacheeId: c.id, userId: user.id, purpose: "businessplan", schemaName: "pdf_plan", schema: SPLIT_SCHEMA, maxTokens: 32000, instructions: SPLIT_INSTRUCTIONS, input: pseudonymize(text.slice(0, 120000), names) });
    for (const ch of out.chapters) {
      if (!SECTIONS.some((s) => s.key === ch.key) || !ch.text.trim()) continue;
      const prev = sections[ch.key];
      sections[ch.key] = { text: [prev?.text, fill(ch.text).trim()].filter(Boolean).join("\n\n"), sources: [prev?.sources, ...ch.sources.map(fill)].filter(Boolean).join("\n") };
    }
    found.subtitle ||= fill(out.subtitle ?? "");
    formatted = true;
  }
  if (!Object.keys(sections).length) return null;
  const own = [c.first_name, c.last_name].filter((n) => n && n.length > 2).map((n) => n.toLowerCase());
  return {
    subtitle: own.some((n) => found.subtitle.toLowerCase().includes(n)) ? "" : found.subtitle.slice(0, 120),
    glance: found.glance,
    sections,
    stats: SECTIONS.filter((s) => sections[s.key]).map((s) => ({ key: s.key, title: s.title, words: wordCount(sections[s.key].text) })),
    unmatched: SECTIONS.filter((s) => !sections[s.key]).map((s) => s.title),
    how,
    formatted,
  };
}

/** Enthält der Text Angaben für den Finanzplan (Beträge zusammen mit Umsatz, Kosten, Investitionen …)? */
export const hasFinanceInfo = (text: string) => (text.match(/\d[\d.,]*\s?(€|eur\b|euro\b)/gi)?.length ?? 0) >= 4 && /umsatz|kosten|investition|finanzierung|miete|preis|stundensatz|liquidit|darlehen|entnahme/i.test(text);
