import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import type { User } from "@/lib/auth";
import { query } from "@/lib/db";
import { financeItems, planFor } from "@/lib/bp/store";
import { GRUENDUNG_CATEGORIES } from "@/lib/profile";
import { FinanceEditor } from "./FinanceEditor";
import { PlanEditor } from "./PlanEditor";

type Links = { plan: string; finance: string; zahlen: string | null };

const files = (id: string) => ({ pdf: `/api/businessplan/${id}/pdf`, excel: `/api/businessplan/${id}/excel` });

export async function PlanPanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const plan = await planFor(c);
  const ids = [...new Set(Object.values(plan.sections).map((s) => s.updated_by).filter((x): x is string => Boolean(x)))];
  const [users, bausteine] = await Promise.all([
    ids.length ? query<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ANY($1)", [ids]) : Promise.resolve([]),
    query<{ category: string; title: string; detail: string }>(
      "SELECT category, title, detail FROM profile_items WHERE coachee_id = $1 AND (NOT internal OR $2) ORDER BY created_at",
      [c.id, user.role === "coach"],
    ),
  ]);
  const names = Object.fromEntries(users.map((u) => [u.id, u.id === user.id ? "dir" : u.name]));
  return (
    <PlanEditor
      coacheeId={c.id}
      coach={user.role === "coach"}
      firstName={c.first_name}
      title={plan.title}
      sections={plan.sections}
      names={names}
      bausteine={bausteine}
      categoryLabels={Object.fromEntries(GRUENDUNG_CATEGORIES.map((k) => [k.key, k.label]))}
      ai={aiEnabled()}
      pdfHref={files(c.id).pdf}
      financeHref={links.finance}
    />
  );
}

export async function FinancePanel({ user, coachee: c, links }: { user: User; coachee: Coachee; links: Links }) {
  const [plan, items] = await Promise.all([planFor(c), financeItems(c.id)]);
  return (
    <FinanceEditor
      coacheeId={c.id}
      coach={user.role === "coach"}
      initial={plan.finance}
      version={plan.finance_version}
      prefilled={plan.prefilled}
      itemCount={items.length}
      excelHref={files(c.id).excel}
      pdfHref={files(c.id).pdf}
      planHref={links.plan}
      zahlenHref={links.zahlen}
    />
  );
}
