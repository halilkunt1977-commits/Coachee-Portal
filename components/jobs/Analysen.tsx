import { Suspense } from "react";
import { analyzeJob, jobReportToDocuments } from "@/app/actions/stellenanalyse";
import type { Coachee } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { analyzeApplication, appsForAnalysis, type AnalyzedApp, type JobAnalysis } from "@/lib/jobs/analysis";
import { statusLabel } from "@/lib/jobs/shared";
import { ActionForm } from "../akte/ActionForm";
import { SubmitButton } from "../SubmitButton";
import { Icon } from "../shell/icons";

/*
 * Stellenanalyse im Reiter „Bewerbungen“ der Akte, nur für den Coach. Neue gemerkte Stellen werden beim
 * Öffnen automatisch analysiert (höchstens drei auf einmal, damit die Seite nicht lange wartet).
 */
const FIT: Record<JobAnalysis["fit"], { label: string; tone: string }> = {
  hoch: { label: "passt gut", tone: "bg-[#e3f1e7] text-[#2f6b45]" },
  mittel: { label: "passt teilweise", tone: "bg-[#fbeec8] text-[#7a5a17]" },
  gering: { label: "passt wenig", tone: "bg-[#f6e0dc] text-[#a33a2c]" },
};

export function StellenAnalysen({ coachee, coachId }: { coachee: Coachee; coachId: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="h2">Stellenanalyse</h2>
        <p className="text-sm text-muted">Nur für dich sichtbar. Jede gemerkte Stelle wird mit Profil und Lebenslauf abgeglichen; den Bericht in Du-Form kannst du dem Coachee geben.</p>
      </div>
      <Suspense fallback={<p className="card text-sm text-muted">Stellen werden analysiert …</p>}>
        <List coachee={coachee} coachId={coachId} />
      </Suspense>
    </section>
  );
}

async function List({ coachee, coachId }: { coachee: Coachee; coachId: string }) {
  let apps = await appsForAnalysis(coachee.id);
  const ai = aiEnabled();
  const open = apps.filter((a) => !a.analysis).slice(0, 3);
  if (ai && open.length) {
    await Promise.all(open.map((a) => analyzeApplication(coachee, a.id, coachId).catch((e) => console.error("[ai] stellenanalyse", e))));
    apps = await appsForAnalysis(coachee.id);
  }
  if (!apps.length) return <p className="card text-sm text-muted">Noch keine gemerkte Stelle. Sobald der Coachee oder du eine Stelle merkt, erscheint hier die Analyse.</p>;
  return (
    <div className="space-y-3">
      {!ai && <p className="card text-sm text-muted">Für die Analyse fehlt noch OPENAI_API_KEY in Coolify.</p>}
      {apps.map((a) => <Card key={a.id} app={a} coacheeId={coachee.id} ai={ai} />)}
    </div>
  );
}

function Card({ app: a, coacheeId, ai }: { app: AnalyzedApp; coacheeId: string; ai: boolean }) {
  const r = a.analysis;
  return (
    <details className="card group space-y-3" open={!r}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{a.title}</span>
          <span className="block text-sm text-muted">{[a.employer, a.location, statusLabel(a.status)].filter(Boolean).join(" · ")}</span>
        </span>
        {r ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${FIT[r.fit].tone}`}>{r.score} % · {FIT[r.fit].label}</span>
        ) : (
          <span className="text-xs text-muted">noch nicht analysiert</span>
        )}
      </summary>
      {r && (
        <div className="space-y-3 text-sm">
          <p>{r.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Points title="Stärken für diese Stelle" items={r.strengths} />
            <Points title="Lücken und wie man sie ausgleicht" items={r.gaps} />
            <Points title="Lebenslauf anpassen" items={r.cv_tips} />
            <Points title="Fürs Anschreiben" items={r.letter_tips} />
            <Points title="Wahrscheinliche Fragen im Gespräch" items={r.interview} />
            <Points title="Nächste Schritte" items={r.next_steps} />
          </div>
          {r.salary && <p className="text-muted"><span className="font-semibold text-ink">Gehalt (Orientierung): </span>{r.salary}</p>}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/stellenanalyse/${coacheeId}?stelle=${a.id}`} target="_blank" className="btn-ghost btn-sm"><Icon name="doc" className="size-4" /> Bericht für Coachee (PDF)</a>
            <form action={jobReportToDocuments.bind(null, coacheeId, a.id)}>
              <SubmitButton className="btn-ghost btn-sm" pendingText="Wird abgelegt …">In Dokumente legen</SubmitButton>
            </form>
          </div>
        </div>
      )}
      {ai && (
        <ActionForm action={analyzeJob.bind(null, coacheeId, a.id)} className="space-y-2 border-t border-line-soft pt-3">
          <label className="block">
            <span className="label">Stellentext (aus der Anzeige kopieren, macht die Analyse genauer)</span>
            <textarea name="job_text" defaultValue={a.job_text} rows={3} className="input min-h-20" placeholder="Aufgaben, Anforderungen, Angebot …" />
          </label>
          <SubmitButton className="btn-ghost btn-sm" pendingText="Wird analysiert …">{r ? "Neu analysieren" : "Jetzt analysieren"}</SubmitButton>
        </ActionForm>
      )}
    </details>
  );
}

function Points({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg bg-bg p-3">
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
