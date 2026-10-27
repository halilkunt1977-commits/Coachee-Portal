import "server-only";
import type { Coachee } from "../access";
import { audit, type User } from "../auth";
import { one, query } from "../db";
import { calculate, eur, financeIsEmpty, monthsBetween, shiftMonths, type FinanceInput } from "./finance";
import { saveSnapshot } from "./fassungen";
import { importBusinessplanDocx } from "./import-docx";
import { importFinanceXlsx } from "./import-xlsx";
import { SECTIONS, planIsEmpty } from "./sections";
import { financeTouched, planFor } from "./store";

/*
 * Übernahme einer Word- oder Excel-Datei in Businessplan bzw. Finanzplan eines Coachees. Wird vom Upload im
 * Businessplan, vom Knopf „übernehmen“ an einem Dokument und automatisch beim Hochladen unter Dokumente genutzt.
 * Leere Kapitel der Datei überschreiben keinen vorhandenen Text. Beim Finanzplan bleiben Bereiche, die in der Datei
 * leer sind oder nur 0 € enthalten, wie sie im Portal waren; der vorige Stand wird als frühere Fassung abgelegt.
 */

export type ImportResult = { ok: true; message: string; details: string[] } | { ok: false; error: string };
type Source = { document: string | null; name: string };

export async function applyPlanDocx(user: User, c: Coachee, data: Buffer, source: Source): Promise<ImportResult> {
  let res;
  try {
    res = await importBusinessplanDocx(data);
  } catch (e) {
    console.error("Word-Import", e);
    return { ok: false, error: "Die Word-Datei ließ sich nicht lesen. Bitte als .docx speichern und noch einmal versuchen." };
  }
  const found = Object.keys(res.sections);
  if (!found.length) return { ok: false, error: "In der Datei wurden keine Kapitel der Vorlage gefunden (z. B. „1. Executive Summary“, „2. Gründerprofil“)." };
  const plan = await planFor(c);
  const now = new Date().toISOString();
  const sections: Record<string, unknown> = {};
  for (const s of SECTIONS) {
    const old = plan.sections[s.key];
    const imp = res.sections[s.key];
    const take = imp && (imp.text.trim() || imp.sources.trim());
    sections[s.key] = take
      ? { text: imp.text.slice(0, 60000), sources: imp.sources.slice(0, 8000), version: old.version + 1, updated_at: now, updated_by: user.id }
      : old;
  }
  const glance = res.glance.length ? res.glance : plan.glance;
  await query(
    `UPDATE business_plans SET sections = $2, glance = $3, title = CASE WHEN $4 <> '' THEN $4 ELSE title END,
            imports = imports || jsonb_build_object('plan', $5::jsonb), updated_at = now() WHERE coachee_id = $1`,
    [c.id, JSON.stringify(sections), JSON.stringify(glance), res.subtitle.slice(0, 120), JSON.stringify({ document: source.document, name: source.name.slice(0, 200), at: now })],
  );
  await audit(user.id, "bp_imported", c.id, { name: source.name.slice(0, 120), chapters: String(found.length) });
  const filled = res.stats.filter((s) => s.words > 0);
  const words = res.stats.reduce((a, s) => a + s.words, 0);
  const details = [
    ...filled.map((s) => `${SECTIONS.findIndex((x) => x.key === s.key) + 1}. ${s.title}: ${s.words} Wörter${s.headings ? `, ${s.headings} Zwischenüberschriften` : ""}${s.tables ? `, ${s.tables} Tabellen` : ""}${s.lists ? `, ${s.lists} Listen` : ""}${s.sources ? `, ${s.sources} Quellen` : ""}`),
    ...(res.glance.length ? [`Auf einen Blick: ${res.glance.length} Angaben`] : []),
    ...(res.droppedKeyTable ? ["Die Kennzahlen-Tabelle aus Kapitel 12 wird aus dem Finanzplan neu berechnet und deshalb nicht als Text übernommen."] : []),
    ...(res.unmatched.length ? [`Nicht in der Datei: ${res.unmatched.join(", ")}`] : []),
  ];
  return { ok: true, message: `${filled.length} von ${SECTIONS.length} Kapiteln mit zusammen ${words.toLocaleString("de-DE")} Wörtern übernommen.`, details };
}

export async function applyFinanceXlsx(user: User, c: Coachee, data: Buffer, source: Source): Promise<ImportResult> {
  let res;
  try {
    res = await importFinanceXlsx(data);
  } catch (e) {
    console.error("Excel-Import", e);
    return { ok: false, error: "Die Excel-Datei ließ sich nicht lesen. Bitte als .xlsx speichern und noch einmal versuchen." };
  }
  if (financeIsEmpty(res.finance)) return { ok: false, error: `In der Datei wurden keine Zahlen gefunden (Umsatzherleitung, Kostenherleitung, Investitionsplan, Personalplan; Zeilen mit 0 € zählen nicht).${res.warnings.length ? ` ${res.warnings.join(" ")}` : ""}` };
  const plan = await planFor(c);
  const had = financeTouched(plan) && !financeIsEmpty(plan.finance);
  const { finance: f, kept } = had ? mergeFinance(plan.finance, res.finance) : { finance: res.finance, kept: [] };
  if (had) await saveSnapshot(c.id, plan.finance, `Vor der Übernahme aus „${source.name}“`, user.id);
  const now = new Date().toISOString();
  await query(
    `UPDATE business_plans SET finance = $2, finance_version = finance_version + 1, finance_updated_by = $3,
            imports = imports || jsonb_build_object('finance', $4::jsonb), updated_at = now() WHERE coachee_id = $1`,
    [c.id, JSON.stringify(f), user.id, JSON.stringify({ document: source.document, name: source.name.slice(0, 200), at: now })],
  );
  await audit(user.id, "finance_imported_file", c.id, { name: source.name.slice(0, 120) });
  const r = calculate(f);
  const details = [`${f.revenues.length} Leistungsarten, ${f.costs.length} Kostenarten, ${f.investments.length} Investitionen, ${f.staff.length} Positionen im Personalplan`];
  if (kept.length) details.push(`Aus dem Portal behalten, weil die Datei dort nichts oder nur 0 € enthält: ${kept.join(", ")}.`);
  if (had) details.push("Der vorige Stand liegt im Finanzplan unter „Frühere Fassungen“.");
  // Abgleich mit den Summen, die in der Datei stehen
  const cmp = (label: string, file: number[] | undefined, own: number[]) => {
    if (!file?.length) return;
    const diff = own.some((v, i) => file[i] !== undefined && Math.abs(v - file[i]) >= 1);
    details.push(`${label}: ${own.map((v) => eur(v)).join(" / ")}${diff ? ` (in der Datei ${file.map((v) => eur(v)).join(" / ")})` : " – wie in der Datei"}`);
  };
  cmp("Umsatz Jahr 1/2/3", res.fileTotals.revenue, r.years.map((y) => y.revenue));
  cmp("Gesamtkosten", res.fileTotals.totalCosts, r.years.map((y) => y.totalCosts));
  cmp("Ergebnis vor Steuern", res.fileTotals.profit, r.years.map((y) => y.profit));
  cmp("Kontostand am Jahresende", res.fileTotals.balance, r.years.map((y) => y.balance));
  details.push(...res.warnings);
  return { ok: true, message: "Finanzplan aus der Excel-Datei übernommen.", details };
}

/**
 * Datei-Stand mit dem Portal-Stand zusammenführen: Bereiche und Annahmen, die in der Datei fehlen oder 0 sind, bleiben
 * aus dem Portal. Finanzierung, Förderung und Reserve kommen in der Vorlage nicht vor und bleiben immer.
 */
function mergeFinance(cur: FinanceInput, imp: FinanceInput): { finance: FinanceInput; kept: string[] } {
  const old = shiftMonths(cur, monthsBetween(cur.start, imp.start));
  const kept: string[] = [];
  const keep = <K extends "revenues" | "costs" | "investments" | "staff">(k: K, label: string) => {
    if (imp[k].length || !old[k].length) return imp[k];
    kept.push(label);
    return old[k];
  };
  const zero = (y: number[]) => !y.some((v) => v);
  const notes = { ...imp.notes };
  for (const k of Object.keys(notes) as (keyof typeof notes)[]) notes[k] ||= old.notes[k];
  return {
    finance: {
      ...imp,
      revenues: keep("revenues", "Umsätze"),
      costs: keep("costs", "laufende Kosten"),
      investments: keep("investments", "Investitionen"),
      staff: keep("staff", "Personal"),
      financing: old.financing,
      grants: old.grants,
      reserve: old.reserve,
      openingCash: imp.openingCash || old.openingCash,
      privateDraw: zero(imp.privateDraw) ? old.privateDraw : imp.privateDraw,
      materialPct: zero(imp.materialPct) ? old.materialPct : imp.materialPct,
      taxPct: imp.taxPct || old.taxPct,
      notes,
    },
    kept,
  };
}

/**
 * Nach dem Hochladen unter Dokumente: Businessplan (.docx) bzw. Finanzplan (.xlsx) automatisch übernehmen,
 * wenn der Plan des Coachees noch leer ist. Sonst bleibt es beim Knopf „übernehmen“ am Dokument.
 */
export async function autoImportDocument(user: User, c: Coachee, doc: { id: string; category: string; name: string }, data: Buffer): Promise<string | null> {
  if (c.coaching_type !== "gruendung") return null;
  const ext = doc.name.toLowerCase().split(".").pop();
  try {
    if (doc.category === "businessplan" && ext === "docx") {
      const plan = await planFor(c);
      if (!planIsEmpty(plan.sections, plan.glance)) return "Der Businessplan im Portal hat schon Text und wurde nicht überschrieben. Zum Ersetzen am Dokument auf „In den Businessplan übernehmen“ tippen.";
      const r = await applyPlanDocx(user, c, data, { document: doc.id, name: doc.name });
      return r.ok ? `In den Businessplan übernommen: ${r.message}` : `Nicht in den Businessplan übernommen: ${r.error}`;
    }
    if (doc.category === "finanzplan" && ext === "xlsx") {
      const plan = await planFor(c);
      if (financeTouched(plan) && !financeIsEmpty(plan.finance)) return "Der Finanzplan im Portal hat schon Zahlen und wurde nicht überschrieben. Zum Ersetzen am Dokument auf „In den Finanzplan übernehmen“ tippen.";
      const r = await applyFinanceXlsx(user, c, data, { document: doc.id, name: doc.name });
      return r.ok ? "In den Finanzplan übernommen." : `Nicht in den Finanzplan übernommen: ${r.error}`;
    }
  } catch (e) {
    console.error("Automatische Übernahme", e);
  }
  return null;
}

/** Kann dieses Dokument in Businessplan oder Finanzplan übernommen werden? */
export const importTarget = (category: string, name: string): "plan" | "finance" | null => {
  const ext = name.toLowerCase().split(".").pop();
  return category === "businessplan" && ext === "docx" ? "plan" : category === "finanzplan" && ext === "xlsx" ? "finance" : null;
};

export async function documentFile(coacheeId: string, coachId: string, docId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return null;
  return one<{ id: string; file_id: string; category: string; name: string }>(
    "SELECT d.id, d.file_id, d.category, f.name FROM documents d JOIN files f ON f.id = d.file_id JOIN coachees c ON c.id = d.coachee_id WHERE d.id = $1 AND d.coachee_id = $2 AND c.coach_id = $3",
    [docId, coacheeId, coachId],
  );
}
