import { BackButton } from "@/components/jobs/BackButton";
import { requireUser } from "@/lib/auth";
import { fetchBaDetail } from "@/lib/jobs/badetail";
import { baJobUrl } from "@/lib/jobs/shared";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";
export const generateMetadata = async () => ({ title: (await getT())("Stellenanzeige") });

/** Anzeige der Arbeitsagentur im Portal: unser Server holt sie, weil arbeitsagentur.de in manchen Netzen nicht lädt */
export default async function Stelle({ params }: PageProps<"/stelle/[refnr]">) {
  await requireUser();
  const t = await getT();
  const refnr = decodeURIComponent((await params).refnr).trim();
  const valid = /^[\w-]{4,60}$/.test(refnr);
  const job = valid ? await fetchBaDetail(refnr) : null;
  const external = valid ? baJobUrl(refnr) : "https://www.arbeitsagentur.de/jobsuche/";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:py-10">
      <BackButton />
      {job ? (
        <article className="card space-y-5 p-5 sm:p-7">
          <header className="space-y-1.5">
            <p className="eyebrow">{t("Stellenanzeige")} · {t("Arbeitsagentur")}</p>
            <h1 className="h1 leading-tight">{job.title}</h1>
            <p className="text-muted">{[job.employer, job.location].filter(Boolean).join(" · ")}</p>
          </header>
          {job.facts.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {job.facts.map((f) => (
                <div key={f.label} className="flex gap-2">
                  <dt className="shrink-0 text-muted">{t(f.label)}:</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="whitespace-pre-line break-words border-t border-line pt-5 leading-relaxed">{job.description}</div>
          <footer className="flex flex-wrap gap-2 border-t border-line pt-4">
            {job.externalUrl && <a href={job.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">{t("Zur Bewerbung beim Arbeitgeber")} ↗</a>}
            <a href={external} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">{t("Bei der Arbeitsagentur öffnen")} ↗</a>
            <span className="self-center text-xs text-muted">{t("Referenznummer")}: {refnr}</span>
          </footer>
        </article>
      ) : (
        <div className="card space-y-3 p-5 sm:p-7">
          <h1 className="h2">{t("Anzeige gerade nicht abrufbar")}</h1>
          <p className="text-muted">{t("Die Arbeitsagentur hat die Anzeige nicht geliefert. Vielleicht ist sie nicht mehr online. Du kannst es direkt bei der Arbeitsagentur versuchen.")}</p>
          <a href={external} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm inline-flex">{t("Bei der Arbeitsagentur öffnen")} ↗</a>
        </div>
      )}
    </main>
  );
}
