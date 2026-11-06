import "server-only";
import { fullName, type Coachee } from "../access";
import type { User } from "../auth";
import { one, query } from "../db";
import { storeFile } from "../files";
import { htmlToPdf } from "../cv/pdf";
import { cvFontCss } from "../cv/fonts";
import { bankLeitfadenHtml } from "./bank-leitfaden";
import { financeWorkbook } from "./excel";
import { planPdf } from "./plan-pdf";
import { planFor } from "./store";

/*
 * Abgabe des Businessplans: fertige Fassung für die fachkundige Stelle (Jobcenter, Agentur) oder für Bank und Förderung.
 * Die Dateien (PDF, Excel, bei der Bank dazu der Leitfaden) landen in den Dokumenten der Akte, freigegeben für den Coachee.
 */

export type AbgabeKind = "fachstelle" | "bank";
export type Abgabe = { id: string; kind: AbgabeKind; created_at: string; by: string | null; files: { id: string; title: string }[] };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const abgabeLabel = (k: AbgabeKind) => (k === "bank" ? "Bank und Förderung" : "Jobcenter / Agentur");

export async function createAbgabe(user: User, c: Coachee, kind: AbgabeKind) {
  const plan = await planFor(c);
  const name = fullName(c);
  const bank = kind === "bank";
  const coach = await one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]);
  const date = new Date();
  const meta = { title: plan.title, name, email: c.email, phone: c.phone, coach: coach?.name ?? "Coach", date: date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) };
  const opts = bank ? { bank: plan.bank } : {};
  const [pdf, xlsx, guide] = await Promise.all([
    planPdf(plan.sections, plan.glance, plan.finance, meta, cvFontCss(), opts),
    financeWorkbook(plan.finance, { name, title: plan.title }, opts),
    bank ? htmlToPdf(bankLeitfadenHtml(name, plan.finance, plan.bank)) : Promise.resolve(null),
  ]);
  const tag = bank ? "Bank" : "Fachstelle";
  const day = date.toLocaleDateString("de-DE");
  const parts: { title: string; file: string; mime: string; data: Uint8Array }[] = [
    { title: `Abgabe ${tag} – Businessplan ${day}`, file: `Businessplan ${tag} ${name}.pdf`, mime: "application/pdf", data: pdf },
    { title: `Abgabe ${tag} – Finanzplan ${day}`, file: `Finanzplan ${tag} ${name}.xlsx`, mime: XLSX, data: xlsx },
  ];
  if (guide) parts.push({ title: `Leitfaden Bank und Förderung ${day}`, file: `Leitfaden Bank und Förderung ${name}.pdf`, mime: "application/pdf", data: guide });
  const docs: string[] = [];
  for (const p of parts) {
    const fileId = await storeFile({ coacheeId: c.id, kind: "dokument", name: p.file, mime: p.mime, data: Buffer.from(p.data), userId: user.id });
    const row = await one<{ id: string }>(
      "INSERT INTO documents (coachee_id, file_id, category, title, shared, created_by) VALUES ($1,$2,'businessplan',$3,true,$4) RETURNING id",
      [c.id, fileId, p.title, user.id],
    );
    docs.push(row!.id);
  }
  await query("INSERT INTO bp_abgaben (coachee_id, kind, documents, created_by) VALUES ($1,$2,$3,$4)", [c.id, kind, docs, user.id]);
}

export async function listAbgaben(coacheeId: string): Promise<Abgabe[]> {
  const rows = await query<{ id: string; kind: AbgabeKind; created_at: string | Date; by: string | null; files: { id: string; title: string }[] | null }>(
    `SELECT a.id, a.kind, a.created_at, u.name AS by,
       (SELECT json_agg(json_build_object('id', d.file_id, 'title', d.title) ORDER BY array_position(a.documents, d.id))
          FROM documents d WHERE d.id = ANY(a.documents)) AS files
       FROM bp_abgaben a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.coachee_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
    [coacheeId],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, created_at: new Date(r.created_at).toISOString(), by: r.by, files: r.files ?? [] }));
}
