"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addSearch, deleteSearch, hideJob, rateJobs, runSearch, saveJob, suggestSearches, type SearchIdea } from "@/app/actions/stellen";
import { ANGEBOTSART, ARBEITSZEIT, STATUS_TONE, UMKREIS, describeQuery, statusLabel, type Fit, type Job, type JobQuery, type SavedSearch, type Status } from "@/lib/jobs/shared";

type Props = {
  coacheeId: string;
  coach: boolean;
  ai: boolean;
  firstName: string;
  searches: SavedSearch[];
  initialQuery: JobQuery;
  known: Record<string, Status>;
  trackerHref: string;
};

const ago = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime()) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 31) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE");
};

const FIT_TONE = { hoch: "bg-[#e3f1e7] text-ok", mittel: "bg-[#fbf1e3] text-gold", gering: "bg-bg text-muted" } as const;
const FIT_LABEL = { hoch: "Passt gut", mittel: "Passt teilweise", gering: "Passt kaum" } as const;

export function JobSearch(p: Props) {
  const [searches, setSearches] = useState(p.searches);
  const [active, setActive] = useState<string | null>(p.searches[0]?.id ?? null);
  const [form, setForm] = useState<JobQuery>(p.searches[0] ?? p.initialQuery);
  const [showForm, setShowForm] = useState(p.searches.length === 0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ran, setRan] = useState<JobQuery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState(p.known);
  const [fits, setFits] = useState<Record<string, Fit>>({});
  const [rating, setRating] = useState(false);
  const [ideas, setIdeas] = useState<SearchIdea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [hidden, setHidden] = useState<Job | null>(null);
  const [proposing, setProposing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [, start] = useTransition();
  const req = useRef(0);

  async function search(q: JobQuery, nextPage = 1) {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    const res = await runSearch(p.coacheeId, q, nextPage);
    if (id !== req.current) return;
    setLoading(false);
    setRan(q);
    setPage(nextPage);
    if (res.error) {
      setError(res.error);
      if (nextPage === 1) setJobs([]);
      return;
    }
    setTotal(res.total);
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
    const t = window.setTimeout(() => void search(form), 0);
    return () => window.clearTimeout(t);
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
    if (res.error) return setError(res.error);
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

  async function keep(job: Job, why = "") {
    const res = await saveJob(p.coacheeId, job, why || (fits[job.refnr]?.level !== "gering" ? (fits[job.refnr]?.reason ?? "") : ""));
    if (res.error) return setError(res.error);
    setKnown((prev) => ({ ...prev, [job.refnr]: res.application!.status }));
    setProposing(null);
    setReason("");
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
            <h2 className="h2">Suchen</h2>
            <p className="text-sm text-muted">Live aus der Jobbörse der Bundesagentur für Arbeit. Gespeicherte Suchen sehen {p.coach ? `du und ${p.firstName}` : "du und dein Coach"}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.ai && (
              <button type="button" className="btn-ghost btn-sm" disabled={ideasBusy} onClick={loadIdeas}>
                {ideasBusy ? "KI überlegt …" : "✦ Suchen aus dem Profil vorschlagen"}
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setShowForm(!showForm); setActive(null); }}>
              {showForm ? "Formular schließen" : "+ Neue Suche"}
            </button>
          </div>
        </div>

        {searches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {searches.map((s) => (
              <span key={s.id} className={`inline-flex max-w-full items-center rounded-full border text-sm ${active === s.id ? "border-accent bg-tint text-accent" : "border-line-soft hover:border-accent"}`}>
                <button type="button" className="truncate py-1 pl-3 pr-1.5 text-left" onClick={() => pick(s)}>{describeQuery(s)}</button>
                <button type="button" aria-label="Suche entfernen" title="Suche entfernen" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:text-danger" onClick={() => remove(s.id)}>✕</button>
              </span>
            ))}
          </div>
        )}

        {ideas && (
          <div className="space-y-2 rounded-xl bg-tint/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-accent">Vorschläge der KI</p>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setIdeas(null)}>Ausblenden</button>
            </div>
            {ideas.length === 0 && <p className="text-sm text-muted">Keine Vorschläge. Ergänze das Kompetenzprofil um Wunschberufe und Rahmenbedingungen.</p>}
            {ideas.map((idea, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">{describeQuery(idea)}</p>
                  <p className="text-sm text-muted">{idea.why}</p>
                </div>
                <button type="button" className="btn-sm btn" onClick={() => { setIdeas((prev) => prev?.filter((_, j) => j !== i) ?? null); void save(idea); }}>Übernehmen</button>
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
              <span className="mb-1 block text-xs font-medium text-muted">Beruf oder Stichwort</span>
              <input className="input !py-2" value={form.was} maxLength={100} placeholder="z. B. Lagerist, Disponent" onChange={(e) => setForm({ ...form, was: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">Ort oder PLZ</span>
              <input className="input !py-2" value={form.wo} maxLength={80} placeholder="z. B. Nürnberg" onChange={(e) => setForm({ ...form, wo: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">Umkreis</span>
              <select className="input !py-2" value={form.umkreis} onChange={(e) => setForm({ ...form, umkreis: Number(e.target.value) })}>
                {UMKREIS.map((u) => <option key={u} value={u}>{u ? `${u} km` : "nur der Ort"}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">Angebot</span>
              <select className="input !py-2" value={form.angebotsart} onChange={(e) => setForm({ ...form, angebotsart: Number(e.target.value) })}>
                {ANGEBOTSART.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              {ARBEITSZEIT.map((a) => {
                const on = form.arbeitszeit.split(";").includes(a.key);
                return (
                  <button key={a.key} type="button" aria-pressed={on} onClick={() => toggleZeit(a.key)} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-tint text-accent" : "border-line-soft text-muted hover:border-accent"}`}>
                    {a.label}
                  </button>
                );
              })}
              <label className="ml-1 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.ohne_zeitarbeit} onChange={(e) => setForm({ ...form, ohne_zeitarbeit: e.target.checked })} /> ohne Zeitarbeit
              </label>
              <span className="flex-1" />
              <button type="button" className="btn-ghost btn-sm" onClick={() => save(form)}>Suche speichern</button>
              <button className="btn btn-sm">Suchen</button>
            </div>
          </form>
        )}
        {error && <p className="rounded-xl bg-[#f8e6e3] px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}
      </section>

      {hidden && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-4 py-2 text-sm" role="status">
          <span className="min-w-0">„{hidden.title}“ ausgeblendet. Die Stelle taucht nicht mehr auf.</span>
          <button type="button" className="link" onClick={undoHide}>Rückgängig</button>
        </div>
      )}

      {ran && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm text-muted">
              {loading && page === 1 ? "Suche läuft …" : `${total.toLocaleString("de-DE")} ${total === 1 ? "Stelle" : "Stellen"} für ${describeQuery(ran)}`}
            </p>
            {p.ai && jobs.length > 0 && unrated && (
              <button type="button" className="btn-ghost btn-sm" disabled={rating} onClick={rate}>
                {rating ? "KI prüft die Stellen …" : `✦ KI: Passen die Stellen zu ${p.coach ? p.firstName : "mir"}?`}
              </button>
            )}
          </div>
          {!loading && !error && jobs.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Keine Stellen gefunden. Versuch einen allgemeineren Begriff oder einen größeren Umkreis.</p>
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
                      <p className="text-xs text-muted">{[j.beruf && j.beruf !== j.title ? j.beruf : "", j.published && `veröffentlicht ${ago(j.published)}`, j.start && `ab ${new Date(j.start).toLocaleDateString("de-DE")}`].filter(Boolean).join(" · ")}</p>
                      {fit && (
                        <p className="mt-1.5 text-sm">
                          <span className={`badge mr-2 ${FIT_TONE[fit.level]}`}>{FIT_LABEL[fit.level]}</span>
                          <span className="text-muted">{fit.reason}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {status ? (
                        <Link href={p.trackerHref} className={`badge ${STATUS_TONE[status]}`}>{p.coach && status === "vorschlag" ? "Vorgeschlagen" : statusLabel(status)} ✓</Link>
                      ) : p.coach ? (
                        <button type="button" className="btn btn-sm" onClick={() => { setProposing(proposing === j.refnr ? null : j.refnr); setReason(fit && fit.level !== "gering" ? fit.reason : ""); }}>Vorschlagen</button>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => keep(j)}>Merken</button>
                      )}
                      {!status && <button type="button" className="btn-ghost btn-sm" onClick={() => hide(j)}>Ausblenden</button>}
                    </div>
                  </div>
                  {proposing === j.refnr && (
                    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void keep(j, reason); }}>
                      <input className="input !py-2 min-w-0 flex-1 basis-64" autoFocus maxLength={600} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Warum passt das für ${p.firstName}? (optional, sieht ${p.firstName})`} />
                      <button className="btn btn-sm">Vorschlagen</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {jobs.length > 0 && jobs.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-ghost" disabled={loading} onClick={() => ran && search(ran, page + 1)}>{loading ? "Lädt …" : "Weitere Stellen laden"}</button>
            </div>
          )}
          <p className="text-center text-xs text-muted">Quelle: Jobbörse der Bundesagentur für Arbeit. Es werden nur die Suchbegriffe übertragen, keine Daten über {p.coach ? "Coachees" : "dich"}.</p>
        </section>
      )}
    </div>
  );
}
