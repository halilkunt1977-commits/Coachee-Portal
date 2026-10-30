import { fullName, type Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import type { User } from "@/lib/auth";
import { query } from "@/lib/db";
import { financeIsEmpty, keyFigures } from "@/lib/bp/finance";
import { planIsEmpty } from "@/lib/bp/sections";
import { loadChats } from "@/lib/bp/context";
import { getRun } from "@/lib/bp/gesamt-ki";
import { financeItems, financeTouched, planFor } from "@/lib/bp/store";
import { GRUENDUNG_CATEGORIES } from "@/lib/profile";
import { FinanceEditor } from "./FinanceEditor";
import { PlanEditor } from "./PlanEditor";
import { ShareButton } from "../teilen/ShareButton";

type Links = { plan: string; finance: string; zahlen: string | null };

const files = (id: string) => ({ pdf: `/api/businessplan/${id}/pdf`, word: `/api/businessplan/${id}/word`, excel: `/api/businessplan/${id}/excel`, schreibhilfe: `/api/businessplan/${id}/schreibhilfe`, gesamt: `/api/businessplan/${id}/gesamt` });

export async function PlanPanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const plan = await planFor(c);
  const ids = [...new Set(Object.values(plan.sections).map((s) => s.updated_by).filter((x): x is string => Boolean(x)))];
  const coach = user.role === "coach";
  const [users, bausteine, notes, lastRun] = await Promise.all([
    ids.length ? query<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ANY($1)", [ids]) : Promise.resolve([]),
    query<{ category: string; title: string; detail: string }>(
      "SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND (NOT internal OR $2) ORDER BY created_at",
      [c.id, coach],
    ),
    // Notizen und Verlauf der Schreibhilfe nur für den Coach
    coach ? loadChats(c.id) : Promise.resolve({ chats: {}, vorhaben: "" }),
    coach ? getRun(c.id) : Promise.resolve(null),
  ]);
  const names = Object.fromEntries(users.map((u) => [u.id, u.id === user.id ? "dir" : u.name]));
  return (
    <PlanEditor
      coacheeId={c.id}
      coach={coach}
      name={fullName(c)}
      title={plan.title}
      sections={plan.sections}
      glance={plan.glance}
      figures={financeIsEmpty(plan.finance) ? null : keyFigures(plan.finance)}
      names={names}
      bausteine={bausteine}
      categoryLabels={Object.fromEntries(GRUENDUNG_CATEGORIES.map((k) => [k.key, k.label]))}
      ai={aiEnabled() && coach}
      pdfHref={files(c.id).pdf}
      wordHref={files(c.id).word}
      financeHref={links.finance}
      imported={coach && plan.imports.plan ? { name: plan.imports.plan.name, at: plan.imports.plan.at } : null}
      lastRun={lastRun}
      gesamtHref={files(c.id).gesamt}
      projectNotes={notes.vorhaben}
      schreibhilfeHref={files(c.id).schreibhilfe}
      filled={!planIsEmpty(plan.sections, plan.glance) || (financeTouched(plan) && !financeIsEmpty(plan.finance))}
      share={<ShareButton kind="businessplan" refId={c.id} role={user.role} coacheeId={c.id} recipient={c.first_name} title={plan.title || "Businessplan"} className="btn-ghost" />}
    />
  );
}

export async function FinancePanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const [plan, items] = await Promise.all([planFor(c), financeItems(c.id)]);
  const coach = user.role === "coach";
  return (
    <FinanceEditor
      coacheeId={c.id}
      coach={coach}
      initial={plan.finance}
      version={plan.finance_version}
      prefilled={plan.prefilled}
      itemCount={items.length}
      excelHref={files(c.id).excel}
      pdfHref={files(c.id).pdf}
      planHref={links.plan}
      zahlenHref={links.zahlen}
      imported={coach && plan.imports.finance ? { name: plan.imports.finance.name, at: plan.imports.finance.at } : null}
      filled={financeTouched(plan) && !financeIsEmpty(plan.finance)}
      share={<ShareButton kind="finanzplan" refId={c.id} role={user.role} coacheeId={c.id} recipient={c.first_name} title="Finanzplan" />}
    />
  );
}
