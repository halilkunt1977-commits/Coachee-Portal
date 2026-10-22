import Link from "next/link";
import { setAiLimit } from "@/app/actions/freigaben";
import type { Coachee } from "@/lib/access";
import { limitOf, usageFor, type UsageCount } from "@/lib/feature-usage";
import { FEATURES, defaultMonthlyLimit, hasFeature } from "@/lib/features";
import { ActionForm } from "../akte/ActionForm";
import { Meter } from "../dashboard/Charts";
import { SubmitButton } from "../SubmitButton";
import { formatDate } from "../ui";
import { FeatureToggle } from "./FeatureToggle";

/** „3 im Monat · 12 gesamt · zuletzt 12.10.2026“ */
export function UsageLine({ u, className = "text-xs text-muted" }: { u: UsageCount; className?: string }) {
  if (!u.total) return <span className={className}>Noch nicht genutzt</span>;
  return (
    <span className={className}>
      <b className="font-semibold text-ink tabular-nums">{u.month}</b> im Monat · <span className="tabular-nums">{u.total}</span> gesamt · zuletzt {formatDate(u.last)}
    </span>
  );
}

/** Aufrufe in diesem Monat gegen die Monatsgrenze */
export function MonthMeter({ used, limit }: { used: number; limit: number }) {
  const pct = limit ? Math.round((used / limit) * 100) : used ? 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs text-muted">
        <span>Diesen Monat</span>
        <span className={`tabular-nums ${pct >= 100 ? "font-semibold text-danger" : pct >= 80 ? "font-semibold text-gold" : ""}`}>{used} von {limit}</span>
      </div>
      <Meter pct={pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "gold" : "accent"} />
    </div>
  );
}

/** Eigene Monatsgrenze; leer = Standard */
export function LimitForm({ coacheeId, limit, id }: { coacheeId: string; limit: number | null; id: string }) {
  return (
    <ActionForm action={setAiLimit.bind(null, coacheeId)} className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-muted">Monatsgrenze{limit == null ? ` (Standard ${defaultMonthlyLimit()})` : ""}</label>
      <div className="flex gap-2">
        <input id={id} name="limit" type="number" inputMode="numeric" min={0} max={1000} step={1} defaultValue={limit ?? ""} placeholder={String(defaultMonthlyLimit())} title="Aufrufe pro Monat; leer lassen für den Standard" className="input min-w-0 flex-1 py-1.5 text-sm" />
        <SubmitButton className="btn-ghost btn-sm shrink-0" pendingText="…">Speichern</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Block „Freigaben“ in der Akte: dieselben Schalter wie unter Freigaben, nur für diesen Coachee */
export async function FeatureBlock({ coachId, coachee: c }: { coachId: string; coachee: Coachee }) {
  const usage = (await usageFor(coachId, c.id)).get(c.id);
  const list = FEATURES.filter((f) => (f.types as readonly string[]).includes(c.coaching_type) || hasFeature(c, f.key));
  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h2">Freigaben</h2>
        <Link href="/coach/freigaben" className="link text-xs">Alle Freigaben</Link>
      </div>
      <p className="text-xs text-muted">Hilfen mit KI, die {c.first_name} selbst nutzen darf. {c.first_name} sieht nur, was freigegeben ist, ohne Hinweis auf KI.</p>
      <ul className="space-y-3">
        {list.map((f) => (
          <li key={f.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{f.label}</p>
              <p className="text-xs text-muted">{f.where}</p>
              <UsageLine u={usage.features[f.key]} />
            </div>
            <FeatureToggle coacheeId={c.id} feature={f.key} on={hasFeature(c, f.key)} label={`${f.label} für ${c.first_name}`} showState={false} />
          </li>
        ))}
      </ul>
      <div className="space-y-3 border-t border-line-soft pt-3">
        <MonthMeter used={usage.month} limit={limitOf(c)} />
        <LimitForm coacheeId={c.id} limit={c.ai_monthly_limit} id={`limit-${c.id}`} />
      </div>
    </div>
  );
}
