"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/*
 * Der Weg zum fertigen Plan als feste Schrittleiste über Businessplan und Finanzplan (nur Coach):
 * ① Fragebogen → ② Finanzplan → ③ Businessplan → ④ Bank und Förderung. Jeder Schritt zeigt seinen Stand.
 * Darunter die Nachschlage-Bereiche (Förderungen, Kredite, Fragen an den Coachee).
 */

export type StepInfo = { status: string; done: boolean; warn?: boolean };
export type PlanStepsProps = {
  vorname: string;
  fragebogen: StepInfo;
  finanzplan: StepInfo;
  businessplan: StepInfo;
  bank: StepInfo;
  fragenNeu: number;
};

type Key = "fragebogen" | "finanzplan" | "businessplan" | "bank";

export function PlanSteps(p: PlanStepsProps) {
  const sp = useSearchParams();
  const tab = sp.get("tab");
  const bereich = sp.get("bereich");
  const active: Key | null = tab === "finanzplan" ? "finanzplan" : tab !== "businessplan" ? null : bereich === "fragebogen" ? "fragebogen" : bereich === "bank" ? "bank" : bereich ? null : "businessplan";
  const steps: { key: Key; title: string; href: string; info: StepInfo }[] = [
    { key: "fragebogen", title: "Fragebogen", href: "?tab=businessplan&bereich=fragebogen", info: p.fragebogen },
    { key: "finanzplan", title: "Finanzplan", href: "?tab=finanzplan", info: p.finanzplan },
    { key: "businessplan", title: "Businessplan", href: "?tab=businessplan", info: p.businessplan },
    { key: "bank", title: "Bank und Förderung", href: "?tab=businessplan&bereich=bank", info: p.bank },
  ];
  const extra = [
    { label: "Förderungen", href: "?tab=businessplan&bereich=foerderung", on: bereich === "foerderung" },
    { label: "Kredite", href: "?tab=businessplan&bereich=kredite", on: bereich === "kredite" },
    { label: p.fragenNeu ? `Fragen an ${p.vorname} (${p.fragenNeu} neu)` : `Fragen an ${p.vorname}`, href: "?tab=businessplan&bereich=fragen", on: bereich === "fragen" },
  ];
  return (
    <nav aria-label="Schritte zum fertigen Plan" className="space-y-2">
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const on = active === s.key;
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                scroll={false}
                aria-current={on ? "step" : undefined}
                className={`group relative flex h-full items-start gap-3 rounded-2xl border px-3 py-3 transition sm:px-4 ${on ? "border-transparent bg-night text-white shadow-lg" : "border-line-soft bg-surface hover:border-accent/40 hover:shadow-sm"}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${s.info.done ? "bg-ok text-white" : on ? "bg-gold text-night" : "bg-surface-2 text-muted ring-1 ring-line"}`}
                  aria-hidden
                >
                  {s.info.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight">{s.title}</span>
                  <span className={`mt-0.5 block text-xs leading-snug ${s.info.warn ? (on ? "font-semibold text-gold-soft" : "font-semibold text-[#a15c00]") : on ? "text-white/70" : "text-muted"}`}>{s.info.status}</span>
                </span>
                {i < steps.length - 1 && <span className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 text-line lg:block" aria-hidden>›</span>}
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm">
        <span className="text-muted">Nachschlagen:</span>
        {extra.map((x) => (
          <Link key={x.href} href={x.href} scroll={false} className={x.on ? "font-semibold text-accent" : "link"}>{x.label}</Link>
        ))}
      </p>
    </nav>
  );
}
