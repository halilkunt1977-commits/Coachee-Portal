import "server-only";
import { query } from "../db";
import { BANK_SECTIONS } from "./bank-sections";
import { brancheOf } from "./branchen";
import { calculate, financeIsEmpty } from "./finance";
import { pruefeFinanzplan } from "./finanz-pruefung";
import { recentRuns } from "./gesamt-ki";
import { SECTIONS } from "./sections";
import type { PlanRow } from "./store";

/*
 * Fragen an den Coachee: Der Coach sieht Vorschläge, was für Businessplan und Finanzplan noch fehlt
 * (offene Angaben in eckigen Klammern, Rückfragen der KI, Prüfung des Finanzplans, fehlende Bankangaben),
 * wählt aus und schickt sie. Der Coachee beantwortet sie und schickt sie zurück.
 */

export type Frage = { id: string; frage: string; quelle: string; antwort: string; status: "offen" | "beantwortet" | "erledigt"; created_at: string; answered_at: string | null };
export type Vorschlag = { frage: string; quelle: string };

const key = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]+/g, " ").trim();

export async function listFragen(coacheeId: string): Promise<Frage[]> {
  const rows = await query<Omit<Frage, "created_at" | "answered_at"> & { created_at: string | Date; answered_at: string | Date | null }>(
    "SELECT id, frage, quelle, antwort, status, created_at, answered_at FROM bp_fragen WHERE coachee_id = $1 ORDER BY created_at, id",
    [coacheeId],
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), answered_at: r.answered_at ? new Date(r.answered_at).toISOString() : null }));
}

/** Offene Angabe „[Abschluss laut Zeugnis ergänzen]“ als Frage */
function placeholderQuestion(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[.:]$/, "");
  const core = t.replace(/\s+(ergänzen|eintragen|angeben|einfügen|nachtragen|prüfen|klären|bestätigen)$/i, "");
  return `Bitte ergänzen: ${core.charAt(0).toUpperCase()}${core.slice(1)}`;
}

export async function vorschlaege(plan: PlanRow, coacheeId: string, existing: Frage[]): Promise<Vorschlag[]> {
  const out: Vorschlag[] = [];
  const seen = new Set(existing.map((f) => key(f.frage)));
  const add = (frage: string, quelle: string) => {
    const k = key(frage);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ frage: frage.slice(0, 500), quelle });
  };
  // offene Angaben in eckigen Klammern
  const scan = (defs: { key: string; title: string }[], sections: PlanRow["sections"], label: string) =>
    defs.forEach((d, i) => {
      for (const m of (sections[d.key]?.text ?? "").matchAll(/\[([^\]\n]{4,200})\]/g)) {
        if (/^(x| )$/i.test(m[1]) || /^https?:/.test(m[1])) continue;
        add(placeholderQuestion(m[1]), `${label} · ${i + 1}. ${d.title}`);
      }
    });
  scan(SECTIONS, plan.sections, "Plan fürs Amt");
  scan(BANK_SECTIONS, plan.bankSections, "Plan für die Bank");
  // Rückfragen der KI aus der letzten Bewertung
  const runs = await recentRuns(coacheeId).catch(() => []);
  const review = [...runs].reverse().find((r) => r.status === "fertig" && r.result?.review?.length)?.result?.review ?? [];
  for (const r of review) for (const q of r.questions) add(q, `Rückfrage zu „${SECTIONS.find((s) => s.key === r.key)?.title ?? r.key}“`);
  // Prüfung des Finanzplans
  if (!financeIsEmpty(plan.finance)) {
    for (const h of pruefeFinanzplan(plan.finance, calculate(plan.finance), brancheOf(plan.branche))) {
      if (h.tone !== "warn") continue;
      const text = h.text.replace(/\{(\w+)\}/g, (_, k: string) => h.vars?.[k] ?? "").replace(/\s*Bitte (begründen|prüfen)[^.]*\.\s*$/, "");
      add(`${text} Was ist hier richtig?`, "Prüfung des Finanzplans");
    }
  } else add("Welche Zahlen hast du schon für den Finanzplan (Preise, erwartete Kunden, Kosten, Anschaffungen)?", "Finanzplan");
  // Angaben für die Bank
  const b = plan.bank;
  if (!b.hausbank.trim()) add("Bei welcher Bank hast du dein Konto, und welche Bank möchtest du für den Kredit ansprechen?", "Angaben für die Bank");
  if (!b.eigenmittel.trim()) add("Wie viel eigenes Geld bringst du ein, und woher stammt es (Ersparnisse, Abfindung, Sachen wie Werkzeug oder Auto)?", "Angaben für die Bank");
  if (!b.sicherheiten.trim()) add("Welche Sicherheiten kannst du der Bank bieten (Auto, Lebensversicherung, Sparvertrag, Bürgschaft)?", "Angaben für die Bank");
  if (!b.vermoegen.length) add("Welches private Vermögen hast du (Konto, Sparverträge, Auto, Immobilie) und wie viel ist es wert?", "Angaben für die Bank");
  if (!b.verbindlichkeiten.length) add("Hast du private Kredite oder andere Verpflichtungen (Ratenkauf, Unterhalt)? Wenn ja: Restschuld und Monatsrate.", "Angaben für die Bank");
  return out.slice(0, 60);
}
