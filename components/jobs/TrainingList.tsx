import type { Coachee } from "@/lib/access";
import { hasFeature } from "@/lib/features";
import { trainingsFor } from "@/lib/jobs/training";
import { FeatureToggle } from "../features/FeatureToggle";
import { TrainingReportView } from "./TrainingReport";

/* Interview-Trainings des Coachees in der Akte (Reiter „Bewerbungen“): Freigabe und Auswertungen zum Nachlesen */
const de = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));
const date = (d: string) => new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export async function TrainingList({ coachee: c }: { coachee: Coachee }) {
  const on = hasFeature(c, "interview_training");
  const list = await trainingsFor(c.id);
  return (
    <section id="training" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="h2">Interview-Training</h2>
          <p className="text-sm text-muted">
            {`${c.first_name} übt das Gespräch je Stelle vor der Kamera und bekommt eine Auswertung zu Antworten, Sprechweise und Mimik${c.language === "tr" ? " (auf Türkisch)" : ""}. Das Bild wird nur auf dem Gerät gemessen, Aufnahmen werden nicht gespeichert.`}
          </p>
        </div>
        <span className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2">
          <span className="text-sm">Für {c.first_name} freigeben</span>
          <FeatureToggle coacheeId={c.id} feature="interview_training" on={on} label={`Interview-Training für ${c.first_name}`} showState={false} />
        </span>
      </div>
      {list.length ? (
        list.map((t) => (
          <details key={t.id} className="card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold">{t.title || "Training"}</span>
                <span className="block text-xs text-muted">{date(t.finished_at ?? t.created_at)} · {t.interview_lang === "tr" ? "Gespräch auf Türkisch" : "Gespräch auf Deutsch"}</span>
              </span>
              <span className="text-lg font-bold">{t.report?.score ?? "–"}<span className="text-xs font-normal text-muted"> / 100</span></span>
            </summary>
            <div className="mt-4">
              <TrainingReportView training={t} t={de} />
            </div>
          </details>
        ))
      ) : (
        <p className="card text-sm text-muted">{on ? `${c.first_name} hat noch kein Training gemacht.` : "Noch kein Training. Nach der Freigabe sieht der Coachee bei jeder Bewerbung „Interview-Training“."}</p>
      )}
    </section>
  );
}
