"use client";
import { useMemo, useState } from "react";
import { addApplication, deleteApplication, updateApplication } from "@/app/actions/stellen";
import { APPLIED, CHANNELS, STATUSES, STATUS_TONE, channelLabel, statusLabel, today, type Application, type Status } from "@/lib/jobs/shared";

type Props = { coacheeId: string; coach: boolean; firstName: string; initial: Application[]; searchHref: string; exportHref: { pdf: string; excel: string } };

const ACTIVE: Status[] = ["vorschlag", "gemerkt", "beworben", "gespraech"];
const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export function Tracker(p: Props) {
  const [apps, setApps] = useState(p.initial);
  const [filter, setFilter] = useState<"aktiv" | "alle" | Status>("aktiv");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = today();

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.key, apps.filter((a) => a.status === s.key).length])) as Record<Status, number>, [apps]);
  const applied = apps.filter((a) => APPLIED.includes(a.status)).length;
  const due = apps.filter((a) => a.next_on && a.next_on <= now && ACTIVE.includes(a.status));
  const list = apps.filter((a) => (filter === "alle" ? true : filter === "aktiv" ? ACTIVE.includes(a.status) : a.status === filter));

  const replace = (a: Application) => setApps((prev) => prev.map((x) => (x.id === a.id ? a : x)));

  async function patch(id: string, change: Parameters<typeof updateApplication>[2]) {
    setError(null);
    setApps((prev) => prev.map((x) => (x.id === id ? { ...x, ...change } : x)));
    const res = await updateApplication(p.coacheeId, id, change);
    if (res.error) setError(res.error);
    else if (res.application) replace(res.application);
  }

  async function remove(id: string) {
    setApps((prev) => prev.filter((x) => x.id !== id));
    await deleteApplication(p.coacheeId, id);
  }

  async function add(form: FormData) {
    setError(null);
    const res = await addApplication(p.coacheeId, Object.fromEntries(form) as Partial<Application>);
    if (res.error) return setError(res.error);
    setApps((prev) => [res.application!, ...prev]);
    setAdding(false);
    setOpen(res.application!.id);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bewerbungen" value={applied} />
        <Stat label="Gespräche" value={counts.gespraech + counts.zusage} />
        <Stat label={p.coach ? "Offene Vorschläge" : "Neue Vorschläge"} value={counts.vorschlag} tone={counts.vorschlag ? "text-gold" : ""} />
        <Stat label="Nachfassen fällig" value={due.length} tone={due.length ? "text-danger" : ""} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={filter === "aktiv"} onClick={() => setFilter("aktiv")}>Laufend</Chip>
          {STATUSES.map((s) => counts[s.key] > 0 && (
            <Chip key={s.key} on={filter === s.key} onClick={() => setFilter(s.key)}>{s.label} {counts[s.key]}</Chip>
          ))}
          <Chip on={filter === "alle"} onClick={() => setFilter("alle")}>Alle {apps.length}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          {applied > 0 && (
            <>
              <a className="btn-ghost btn-sm" href={p.exportHref.pdf}>Nachweis als PDF</a>
              <a className="btn-ghost btn-sm" href={p.exportHref.excel}>Excel</a>
            </>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setAdding(!adding)}>{adding ? "Abbrechen" : "+ Bewerbung eintragen"}</button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-[#f8e6e3] px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}

      {adding && (
        <form action={add} className="card grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-muted sm:col-span-2">Für Initiativbewerbungen oder Stellen aus anderen Börsen. Stellen aus der Suche kommen mit einem Klick hierher.</p>
          <In name="title" label="Stelle" placeholder="z. B. Initiativbewerbung Lager" />
          <In name="employer" label="Arbeitgeber" />
          <In name="location" label="Ort" />
          <In name="url" label="Link zur Anzeige (optional)" type="url" />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Stand</span>
            <select name="status" className="input !py-2" defaultValue="beworben">
              {STATUSES.filter((s) => s.key !== "vorschlag").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <In name="applied_on" label="Beworben am" type="date" defaultValue={now} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Wie</span>
              <select name="channel" className="input !py-2" defaultValue="email">
                {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end sm:col-span-2"><button className="btn">Eintragen</button></div>
        </form>
      )}

      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {apps.length === 0 ? (
            <>Noch keine Stellen. <a href={p.searchHref} className="link">Passende Stellen suchen</a></>
          ) : (
            "In dieser Auswahl ist nichts."
          )}
        </div>
      )}

      <ul className="space-y-2">
        {list.map((a) => {
          const isOpen = open === a.id;
          const overdue = a.next_on && a.next_on <= now && ACTIVE.includes(a.status);
          return (
            <li key={a.id} className={`card !p-0 ${a.status === "vorschlag" && !p.coach ? "ring-2 ring-gold/40" : ""}`}>
              <div className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent hover:underline">{a.title}</a> : <span className="font-semibold">{a.title}</span>}
                  </div>
                  <p className="text-sm">{[a.employer, a.location].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted">
                    {[a.applied_on && `beworben am ${fmt(a.applied_on)}${a.channel ? ` per ${channelLabel(a.channel)}` : ""}`, a.status === "vorschlag" && a.proposed_by_name && `vorgeschlagen von ${a.proposed_by_name}`].filter(Boolean).join(" · ")}
                  </p>
                  {a.reason && <p className="mt-1.5 rounded-lg bg-tint/50 px-3 py-1.5 text-sm"><span className="font-semibold text-accent">Warum es passt: </span>{a.reason}</p>}
                  {a.next_on && ACTIVE.includes(a.status) && (
                    <p className={`mt-1.5 text-sm ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      {overdue ? "Fällig: " : "Nächster Schritt: "}{fmt(a.next_on)}{a.next_note ? ` · ${a.next_note}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === "vorschlag" && !p.coach ? (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => patch(a.id, { status: "gemerkt" })}>Interessiert mich</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => patch(a.id, { status: "verworfen" })}>Passt nicht</button>
                    </>
                  ) : (
                    <select
                      aria-label="Stand"
                      className={`rounded-full border-0 py-1 pl-3 pr-8 text-xs font-semibold ${STATUS_TONE[a.status]}`}
                      value={a.status}
                      onChange={(e) => patch(a.id, { status: e.target.value as Status })}
                    >
                      {STATUSES.filter((s) => s.key !== "vorschlag" || p.coach || a.status === "vorschlag").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  )}
                  <button type="button" aria-expanded={isOpen} className="btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? "Zuklappen" : "Details"}</button>
                </div>
              </div>
              {isOpen && <Details a={a} coach={p.coach} onPatch={(c) => patch(a.id, c)} onDelete={() => remove(a.id)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Details({ a, coach, onPatch, onDelete }: { a: Application; coach: boolean; onPatch: (c: Parameters<typeof updateApplication>[2]) => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const blur = (key: "contact" | "note" | "next_note" | "reason") => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.target.value !== a[key]) onPatch({ [key]: e.target.value });
  };
  return (
    <div className="grid gap-3 border-t border-line-soft p-4 sm:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Beworben am</span>
          <input type="date" className="input !py-2" defaultValue={a.applied_on ?? ""} onBlur={(e) => e.target.value !== (a.applied_on ?? "") && onPatch({ applied_on: e.target.value || null })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Wie</span>
          <select className="input !py-2" value={a.channel} onChange={(e) => onPatch({ channel: e.target.value })}>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Ansprechperson</span>
        <input className="input !py-2" maxLength={300} defaultValue={a.contact} placeholder="Name, Telefon, E-Mail" onBlur={blur("contact")} />
      </label>
      <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Nachfassen am</span>
          <input type="date" className="input !py-2" defaultValue={a.next_on ?? ""} onBlur={(e) => e.target.value !== (a.next_on ?? "") && onPatch({ next_on: e.target.value || null })} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-muted">Was ist zu tun?</span>
          <input className="input !py-2" maxLength={200} defaultValue={a.next_note} placeholder="z. B. anrufen, Gespräch 10 Uhr" onBlur={blur("next_note")} />
        </label>
      </div>
      {coach && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Warum es passt (sieht der Coachee)</span>
          <input className="input !py-2" maxLength={600} defaultValue={a.reason} onBlur={blur("reason")} />
        </label>
      )}
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-muted">Notizen</span>
        <textarea className="input min-h-20" maxLength={4000} defaultValue={a.note} placeholder="Gesprächsnotizen, Fragen, Gehalt …" onBlur={blur("note")} />
      </label>
      <div className="flex flex-wrap items-end justify-between gap-3 sm:col-span-2">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {a.history.map((h, i) => (
            <li key={i}>{new Date(h.at).toLocaleDateString("de-DE")} {statusLabel(h.status)} ({h.by})</li>
          ))}
        </ol>
        {confirm ? (
          <span className="flex items-center gap-2 text-sm">
            Wirklich löschen?
            <button type="button" className="font-semibold text-danger hover:underline" onClick={onDelete}>Ja, löschen</button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirm(false)}>Nein</button>
          </span>
        ) : (
          <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => setConfirm(true)}>Löschen</button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card !p-4">
      <p className={`font-[family-name:var(--font-display)] text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-tint text-accent" : "border-line-soft text-muted hover:border-accent"}`}>
      {children}
    </button>
  );
}

function In({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input name={name} className="input !py-2" maxLength={200} {...props} />
    </label>
  );
}
