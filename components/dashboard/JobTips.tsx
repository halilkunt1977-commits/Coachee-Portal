import Link from "next/link";
import type { Coachee } from "@/lib/access";
import { jobTips } from "@/lib/jobs/empfehlungen";
import { SOURCE_LABEL, describeQuery } from "@/lib/jobs/shared";
import { getT } from "@/lib/i18n-server";
import { JobTipSave } from "./JobTipSave";

/** Passende Stellen aus der Jobbörse für die Startseite. Läuft in Suspense, damit eine langsame Jobbörse die Seite nicht aufhält. */
export async function JobTips({ c }: { c: Coachee }) {
  const [{ tips, queries, error }, t] = await Promise.all([jobTips(c), getT()]);
  if (!queries.length)
    return (
      <p className="text-sm text-muted">
        {t("Sobald ein Wunschberuf in deinem Profil steht oder dein Lebenslauf eine Berufsbezeichnung hat, zeigen wir dir hier passende Stellen.")}{" "}
        <Link href="/mein-bereich/lebenslauf" className="link">{t("Zum Lebenslauf")}</Link>
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t("Gesucht nach:")} {queries.map((q) => describeQuery(q, t)).join(` ${t("und")} `)}</p>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(error)}</p>}
      {!error && !tips.length && <p className="text-sm text-muted">{t("Heute keine neuen Treffer. Schau morgen wieder vorbei oder starte eine eigene Suche.")}</p>}
      <ul className="divide-y divide-line-soft">
        {tips.map((j) => (
          <li key={j.refnr} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 first:pt-0">
            <div className="min-w-0 flex-1 basis-52">
              <a href={j.externalUrl ?? j.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:text-accent hover:underline">{j.title}</a>
              <p className="truncate text-sm text-muted">{[j.employer, j.location, j.distance != null ? `${j.distance.toLocaleString("de-DE")} km` : ""].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted">{t("passt zu „{term}“", { term: j.term })}{j.source && j.source !== "ba" ? ` · ${t("über {quelle}", { quelle: SOURCE_LABEL[j.source] })}` : ""}</p>
            </div>
            <JobTipSave coacheeId={c.id} job={j} />
          </li>
        ))}
      </ul>
      <Link href="/mein-bereich/stellen" className="link inline-block text-sm">{t("Weitere Stellen suchen →")}</Link>
    </div>
  );
}

export function JobTipsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />)}
    </div>
  );
}
