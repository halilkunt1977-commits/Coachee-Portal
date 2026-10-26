"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addSearch, deleteSearch, hideJob, rateJobs, runSearch, saveJob, suggestSearches, type SearchIdea, type SearchResult } from "@/app/actions/stellen";
import { ShareButton } from "../teilen/ShareButton";
import { SetupHint } from "../coach/SetupHint";
import { ANGEBOTSART, ARBEITSZEIT, SOURCE_LABEL, STATUS_TONE, UMKREIS, boardLinks, describeQuery, statusLabel, type Fit, type Job, type JobQuery, type JobSource, type SavedSearch, type Status } from "@/lib/jobs/shared";
import type { SourceInfo } from "@/lib/jobs/sources";
import type { T } from "@/lib/i18n";
import { useLocale, useT } from "../i18n/LangProvider";

type Props = {
  coacheeId: string;
  coach: boolean;
  ai: boolean;
  firstName: string;
  searches: SavedSearch[];
  initialQuery: JobQuery;
  known: Record<string, Status>;
  trackerHref: string;
  /** Abgefragte Börsen: immer die Arbeitsagentur, dazu die eingerichteten weiteren */
  sources: JobSource[];
};

const ago = (iso: string | null, t: T) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime()) / 86400000);
  if (days <= 0) return t("heute");
  if (days === 1) return t("gestern");
  if (days < 31) return t("vor {n} Tagen", { n: days });
  return new Date(iso).toLocaleDateString("de-DE");
};

const sourceText = (s: JobSource[], t: T) =>
  s.length === 1 ? t("Live aus der Jobbörse der Bundesagentur für Arbeit.") : t("Live aus der Jobbörse der Bundesagentur für Arbeit, {weitere}.", { weitere: s.filter((k) => k !== "ba").map((k) => SOURCE_LABEL[k]).join(` ${t("und")} `) });

const FIT_TONE = { hoch: "bg-[#e3f1e7] text-ok", mittel: "bg-[#fbf1e3] text-gold", gering: "bg-bg text-muted" } as const;
const FIT_LABEL = { hoch: "Passt gut", mittel: "Passt teilweise", gering: "Passt kaum" } as const;

export function JobSearch(p: Props) {
  const t = useT();
  const locale = useLocale();
  const [searches, setSearches] = useState(p.searches);
  const [active, setActive] = useState<string | null>(p.searches[0]?.id ?? null);
  const [form, setForm] = useState<JobQuery>(p.searches[0] ?? p.initialQuery);
  const [showForm, setShowForm] = useState(p.searches.length === 0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ran, setRan] = useState<JobQuery | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Suche fehlgeschlagen (Arbeitsagentur nicht erreichbar o. Ä.): eigene Meldung mit „Noch einmal versuchen“ statt „0 Stellen“
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo[]>([]);
  const [known, setKnown] = useState(p.known);
  const [fits, setFits] = useState<Record<string, Fit>>({});
  const [rating, setRating] = useState(false);
  const [ideas, setIdeas] = useState<SearchIdea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [hidden, setHidden] = useState<Job | null>(null);
  const [, start] = useTransition();
  const req = useRef(0);

  async function search(q: JobQuery, nextPage = 1) {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    setFailed(null);
    const res: SearchResult = await runSearch(p.coacheeId, q, nextPage).catch(() => ({ jobs: [], total: 0, hidden: 0, error: t("Die Suche hat nicht geklappt.") }));
    if (id !== req.current) return;
    setLoading(false);
    if (res.error) {
      if (!q.was && !q.wo) return setError(t(res.error));
      setRan(q);
      setPage(nextPage);
      setFailed(res.error);
      if (nextPage === 1) setJobs([]);
      return;
    }
    setRan(q);
    setPage(nextPage);
    setTotal(res.total);
    if (nextPage === 1) setSourceInfo(res.sources ?? []);
    setJobs((prev) => {
      if (nextPage === 1) return res.jobs;
      const seen = new Set(prev.map((j) => j.refnr));
      return [...prev, ...res.jobs.filter((j) => !seen.has(j.refnr))];
    });
    if (nextPage === 1) setFits({});
  }

  // Beim ersten Öffnen gleich suchen: mit der ersten gespeicherten Suche oder dem Wunschberuf aus dem Profil
  useEffect(() => {
    if (!form.was && !form.wo) return;
    const timer = window.setTimeout(() => void search(form), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(s: SavedSearch) {
    setActive(s.id);
    setForm(s);
    setShowForm(false);
    void search(s);
  }

  async function save(q: JobQuery) {
    const res = await addSearch(p.coacheeId, q);
    if (res.error) return setError(t(res.error));
    const s = res.search!;
    setSearches((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
    setActive(s.id);
    setForm(s);
    setShowForm(false);
    void search(s);
  }

  async function remove(id: string) {
    setSearches((prev) => prev.filter((s) => s.id !== id));
    if (active === id) setActive(null);
    await deleteSearch(p.coacheeId, id);
  }

  async function loadIdeas() {
    setIdeasBusy(true);
    setError(null);
    const res = await suggestSearches(p.coacheeId);
    setIdeasBusy(false);
    if (res.error) return setError(res.error);
    setIdeas(res.ideas ?? []);
  }

  async function rate() {
    setRating(true);
    const todo = jobs.filter((j) => !fits[j.refnr]).slice(0, 40);
    const res = await rateJobs(p.coacheeId, todo.map(({ refnr, title, beruf, employer, location }) => ({ refnr, title, beruf, employer, location })));
    setRating(false);
    if (res.error) return setError(res.error);
    setFits((prev) => ({ ...prev, ...res.fits }));
  }

  async function keep(job: Job) {
    const res = await saveJob(p.coacheeId, job, fits[job.refnr]?.level !== "gering" ? (fits[job.refnr]?.reason ?? "") : "");
    if (res.error) return setError(t(res.error));
    setKnown((prev) => ({ ...prev, [job.refnr]: res.application!.status }));
  }

  function hide(job: Job) {
    setJobs((prev) => prev.filter((j) => j.refnr !== job.refnr));
    setHidden(job);
    start(() => void hideJob(p.coacheeId, job.refnr, true));
  }

  function undoHide() {
    if (!hidden) return;
    const job = hidden;
    setJobs((prev) => [job, ...prev]);
    setHidden(null);
    start(() => void hideJob(p.coacheeId, job.refnr, false));
  }

  const toggleZeit = (k: string) => {
    const set = new Set(form.arbeitszeit.split(";").filter(Boolean));
    if (set.has(k)) set.delete(k);
    else set.add(k);
    setForm({ ...form, arbeitszeit: [...set].join(";") });
  };

  const sorted = [...jobs].sort((a, b) => {
    const rank = (j: Job) => ({ hoch: 0, mittel: 1, gering: 3 })[fits[j.refnr]?.level ?? "mittel"] ?? 2;
    return Object.keys(fits).length ? rank(a) - rank(b) : 0;
  });
  const unrated = jobs.some((j) => !fits[j.refnr]);

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="h2">{t("Suchen")}</h2>
            <p className="text-sm text-muted">{sourceText(p.sources, t)} {p.coach ? `Gespeicherte Suchen sehen du und ${p.firstName}.` : t("Gespeicherte Suchen sehen du und dein Coach.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.ai && (
              <button type="button" className="btn-ghost btn-sm" disabled={ideasBusy} onClick={loadIdeas}>
                {ideasBusy ? t("Einen Moment …") : "✦ Suchen aus dem Profil vorschlagen"}
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setShowForm(!showForm); setActive(null); }}>
              {showForm ? t("Formular schließen") : `+ ${t("Neue Suche")}`}
            </button>
          </div>
        </div>

        {searches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {searches.map((s) => (
              <span key={s.id} className={`inline-flex max-w-full items-center rounded-full border text-sm ${active === s.id ? "border-accent bg-tint text-accent" : "border-line-soft hover:border-accent"}`}>
                <button type="button" className="truncate py-1 pl-3 pr-1.5 text-left" onClick={() => pick(s)}>{describeQuery(s, t)}</button>
                <button type="button" aria-label={t("Suche entfernen")} title={t("Suche entfernen")} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:text-danger" onClick={() => remove(s.id)}>✕</button>
              </span>
            ))}
          </div>
        )}

        {ideas && (
          <div className="space-y-2 rounded-xl bg-tint/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-accent">{p.coach ? "Vorschläge der KI" : t("Vorschläge")}</p>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setIdeas(null)}>{t("Ausblenden")}</button>
            </div>
            {ideas.length === 0 && <p className="text-sm text-muted">{t("Keine Vorschläge. Ergänze das Kompetenzprofil um Wunschberufe und Rahmenbedingungen.")}</p>}
            {ideas.map((idea, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">{describeQuery(idea, t)}</p>
                  <p className="text-sm text-muted">{idea.why}</p>
                </div>
                <button type="button" className="btn-sm btn" onClick={() => { setIdeas((prev) => prev?.filter((_, j) => j !== i) ?? null); void save(idea); }}>{t("Übernehmen")}</button>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1.3fr]"
            onSubmit={(e) => {
              e.preventDefault();
              setActive(null);
              void search(form);
            }}
          >
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">{t("Beruf oder Stichwort")}</span>
              <input className="input !py-2" value={form.was} maxLength={100} placeholder={t("z. B. Lagerist, Disponent")} onChange={(e) => setForm({ ...form, was: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">{t("Ort oder PLZ")}</span>
              <input className="input !py-2" value={form.wo} maxLength={80} placeholder={t("z. B. Nürnberg")} onChange={(e) => setForm({ ...form, wo: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">{t("Umkreis")}</span>
              <select className="input !py-2" value={form.umkreis} onChange={(e) => setForm({ ...form, umkreis: Number(e.target.value) })}>
                {UMKREIS.map((u) => <option key={u} value={u}>{u ? `${u} km` : t("nur der Ort")}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">{t("Angebot")}</span>
              <select className="input !py-2" value={form.angebotsart} onChange={(e) => setForm({ ...form, angebotsart: Number(e.target.value) })}>
                {ANGEBOTSART.map((a) => <option key={a.key} value={a.key}>{t(a.label)}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              {ARBEITSZEIT.map((a) => {
                const on = form.arbeitszeit.split(";").includes(a.key);
                return (
                  <button key={a.key} type="button" aria-pressed={on} onClick={() => toggleZeit(a.key)} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-tint text-accent" : "border-line-soft text-muted hover:border-accent"}`}>
                    {t(a.label)}
                  </button>
                );
              })}
              <label className="ml-1 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.ohne_zeitarbeit} onChange={(e) => setForm({ ...form, ohne_zeitarbeit: e.target.checked })} /> {t("ohne Zeitarbeit")}
              </label>
              <span className="flex-1" />
              <button type="button" className="btn-ghost btn-sm" onClick={() => save(form)}>{t("Suche speichern")}</button>
              <button className="btn btn-sm">{t("Suchen")}</button>
            </div>
          </form>
        )}
        {error && <p className="rounded-xl bg-[#f8e6e3] px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}
      </section>

      {hidden && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-4 py-2 text-sm" role="status">
          <span className="min-w-0">„{hidden.title}“ {t("ausgeblendet. Die Stelle taucht nicht mehr auf.")}</span>
          <button type="button" className="link" onClick={undoHide}>{t("Rückgängig")}</button>
        </div>
      )}

      {ran && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            {!failed && (
              <p className="text-sm text-muted">
                {loading && page === 1 ? t("Suche läuft …") : t(total === 1 ? "{n} Stelle für {suche}" : "{n} Stellen für {suche}", { n: total.toLocaleString(locale), suche: describeQuery(ran, t) })}
              </p>
            )}
            {p.ai && jobs.length > 0 && unrated && (
              <button type="button" className="btn-ghost btn-sm" disabled={rating} onClick={rate}>
                {rating ? t("Stellen werden geprüft …") : p.coach ? `✦ KI: Passen die Stellen zu ${p.firstName}?` : `✦ ${t("Passen die Stellen zu mir?")}`}
              </button>
            )}
          </div>
          {!failed && sourceInfo.some((s) => s.error) && (
            <p className="rounded-xl bg-bg px-3.5 py-2 text-xs text-muted">
              {sourceInfo.filter((s) => s.error).map((s) => t(s.error!)).join(" ")} {t("Die Treffer der anderen Börsen siehst du trotzdem.")}
            </p>
          )}
          {failed && !loading && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8e6e3] px-4 py-3 text-sm">
              <p className="min-w-0 flex-1 basis-60 text-danger">{t("Die Stellensuche hat gerade nicht geklappt. Das liegt meist an der Verbindung zur Jobbörse und geht gleich wieder.")}</p>
              <button type="button" className="btn btn-sm tap" onClick={() => void search(ran, page)}>{t("Noch einmal versuchen")}</button>
            </div>
          )}
          {!loading && !error && !failed && jobs.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t("Keine Stellen gefunden. Versuch einen allgemeineren Begriff oder einen größeren Umkreis.")}</p>
          )}
          <ul className="space-y-2">
            {sorted.map((j) => {
              const status = known[j.refnr];
              const fit = fits[j.refnr];
              return (
                <li key={j.refnr} className="card !p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-72">
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent hover:underline">{j.title}</a>
                      <p className="text-sm">{[j.employer, j.location && `${j.location}${j.distance != null ? ` (${Math.round(j.distance)} km)` : ""}`].filter(Boolean).join(" · ")}</p>
                      <p className="text-xs text-muted">{[j.source && j.source !== "ba" ? t("über {quelle}", { quelle: SOURCE_LABEL[j.source] }) : "", j.beruf && j.beruf !== j.title ? j.beruf : "", j.published && t("veröffentlicht {wann}", { wann: ago(j.published, t) }), j.start && t("ab {datum}", { datum: new Date(j.start).toLocaleDateString("de-DE") })].filter(Boolean).join(" · ")}</p>
                      {fit && (
                        <p className="mt-1.5 text-sm">
                          <span className={`badge mr-2 ${FIT_TONE[fit.level]}`}>{t(FIT_LABEL[fit.level])}</span>
                          <span className="text-muted">{fit.reason}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {status ? (
                        <Link href={p.trackerHref} className={`badge ${STATUS_TONE[status]}`}>{p.coach && status === "vorschlag" ? "Vorgeschlagen" : t(statusLabel(status))} ✓</Link>
                      ) : (
                        !p.coach && <button type="button" className="btn btn-sm" onClick={() => keep(j)}>{t("Merken")}</button>
                      )}
                      {/* Coach: schlägt die Stelle vor (Stand „Vorschlag“); Coachee: fragt den Coach, was er davon hält */}
                      <ShareButton
                        kind="suche"
                        job={j}
                        role={p.coach ? "coach" : "coachee"}
                        coacheeId={p.coacheeId}
                        recipient={p.firstName}
                        title={[j.title, j.employer].filter(Boolean).join(" · ")}
                        defaultNote={p.coach && fit && fit.level !== "gering" ? fit.reason : undefined}
                        className={p.coach && !status ? "btn btn-sm" : "btn-ghost btn-sm"}
                        onSent={(r) => r.status && setKnown((prev) => ({ ...prev, [j.refnr]: r.status! }))}
                      />
                      {!status && <button type="button" className="btn-ghost btn-sm" onClick={() => hide(j)}>{t("Ausblenden")}</button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {jobs.length > 0 && jobs.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-ghost" disabled={loading} onClick={() => ran && search(ran, page + 1)}>{loading ? t("Lädt …") : t("Weitere Stellen laden")}</button>
            </div>
          )}
          <div className="space-y-2 rounded-xl border border-line-soft px-4 py-3">
            <p className="text-sm font-medium">{t("Dieselbe Suche in weiteren Jobbörsen")}</p>
            <div className="flex flex-wrap gap-2">
              {boardLinks(ran).map((b) => (
                <a key={b.label} href={b.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm tap">{b.label} ↗</a>
              ))}
            </div>
            <p className="text-xs text-muted">{t("Öffnet die Börse mit Beruf und Ort. Eine passende Stelle dort trägst du unter Bewerbungen mit „+ Bewerbung eintragen“ ein.")}</p>
          </div>
          <p className="text-center text-xs text-muted">
            {t("Quellen:")} {p.sources.map((s) => SOURCE_LABEL[s]).join(", ")}. {p.coach ? "Es werden nur die Suchbegriffe übertragen, keine Daten über Coachees." : t("Es werden nur die Suchbegriffe übertragen, keine Daten über dich.")}
          </p>
          {p.coach && p.sources.length < 3 && (
            <SetupHint>
              Weitere Börsen direkt in die Trefferliste holen: kostenlose Schlüssel bei developer.adzuna.com (App-ID und Key als ADZUNA_APP_ID und ADZUNA_APP_KEY) und jooble.org/api/about (als JOOBLE_API_KEY) in den Einstellungen der App eintragen, dann neu starten. Adzuna und Jooble sammeln Stellen aus StepStone, Indeed, Firmen-Karriereseiten und vielen weiteren Börsen.
            </SetupHint>
          )}
        </section>
      )}
    </div>
  );
}
