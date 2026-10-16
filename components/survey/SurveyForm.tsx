"use client";
import { useEffect, useRef, useState } from "react";
import { saveSurvey, submitSurvey, suggestStationTasks } from "@/app/actions/erfahrung";
import { LEVELS, newStationKey, period, progress, type Choice, type Level, type Station, type SurveyData } from "@/lib/survey/types";
import { Notice } from "../ui";

type Props = { id: string; initial: SurveyData; submittedAt: string | null; coach?: boolean };

/** Erfahrungsbogen zum Ankreuzen. Speichert von selbst, Absenden schickt ihn an den Coach. */
export function SurveyForm({ id, initial, submittedAt, coach = false }: Props) {
  const [d, setD] = useState<SurveyData>(initial);
  const [saved, setSaved] = useState<"ok" | "saving" | "error">("ok");
  const [sent, setSent] = useState<string | null>(submittedAt);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(() => {
      saveSurvey(id, d).then((r) => setSaved(r.ok ? "ok" : "error")).catch(() => setSaved("error"));
    }, 1200);
    return () => clearTimeout(t);
  }, [d, id]);

  const setStation = (key: string, patch: Partial<Station>) => setD((p) => ({ ...p, stations: p.stations.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const p = progress(d);

  async function send() {
    setSending(true);
    const r = await submitSurvey(id, d).catch(() => ({ ok: false, error: "Das hat nicht geklappt. Bitte noch einmal versuchen." }));
    setSending(false);
    if (r.ok) { setSent(new Date().toISOString()); setMsg(null); } else setMsg(r.error ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="card sticky top-16 z-10 space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><b>{p.done} von {p.total}</b> Stationen ausgefüllt</span>
          <span className="text-xs text-muted">{saved === "saving" ? "Wird gespeichert …" : saved === "error" ? "Nicht gespeichert, bitte Verbindung prüfen" : "Gespeichert"}</span>
        </div>
        <div className="h-2 rounded-full bg-line-soft"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
      </div>

      {!coach && (
        <p className="text-sm text-muted">
          Geh deine Stationen der Reihe nach durch und kreuz an, was du dort gemacht hast: <b>Oft</b> für deine Hauptaufgaben, <b>Manchmal</b> für Gelegentliches. Was fehlt, schreibst du einfach dazu. Alles wird automatisch gespeichert, du kannst jederzeit aufhören und später weitermachen.
        </p>
      )}

      {d.stations.map((st, i) => (
        <StationCard key={st.key} id={id} index={i} st={st} onChange={(patch) => setStation(st.key, patch)} onRemove={() => setD((x) => ({ ...x, stations: x.stations.filter((s) => s.key !== st.key) }))} />
      ))}

      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => setD((x) => ({ ...x, stations: [...x.stations, { key: newStationKey(), title: "", company: "", location: "", start: "", end: "", current: false, tasks: [], tools: [], ownTasks: "", leadership: "", success: "", liked: "" }] }))}
      >
        + Weitere Station ergänzen (z. B. Nebenjob, Praktikum, Ehrenamt)
      </button>

      <section className="card space-y-5">
        <h2 className="h2">Was dich ausmacht</h2>
        <ChipGroup label="Deine Stärken: Was würden Kollegen über dich sagen?" items={d.strengths} onChange={(strengths) => setD({ ...d, strengths })} />
        <ChipGroup label="Programme, mit denen du arbeiten kannst" items={d.software} onChange={(software) => setD({ ...d, software })} addLabel="Weiteres Programm" levels />
        <ChipGroup label="Führerscheine und Nachweise" items={d.licences} onChange={(licences) => setD({ ...d, licences })} addLabel="Weiterer Nachweis" />
        <Area label="Welche Arbeit wünschst du dir als Nächstes?" value={d.wish} onChange={(wish) => setD({ ...d, wish })} placeholder="z. B. Lagerleitung in Vollzeit, gern im Raum Hannover" />
        <Area label="Möchtest du sonst noch etwas sagen?" value={d.notes} onChange={(notes) => setD({ ...d, notes })} />
      </section>

      {msg && <Notice tone="error">{msg}</Notice>}
      {!coach && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{sent ? "Abgeschickt. Dein Coach hat den Bogen bekommen. Änderungen werden weiter gespeichert." : "Fertig? Dann schick den Bogen an deinen Coach."}</p>
          <button type="button" className="btn" disabled={sending} onClick={send}>{sending ? "Wird gesendet …" : sent ? "Erneut senden" : "An meinen Coach senden"}</button>
        </div>
      )}
    </div>
  );
}

function StationCard({ id, index, st, onChange, onRemove }: { id: string; index: number; st: Station; onChange: (p: Partial<Station>) => void; onRemove: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const manual = !st.tasks.length;
  const setTask = (i: number, level: Level) => onChange({ tasks: st.tasks.map((t, j) => (j === i ? { ...t, level } : t)) });

  async function suggest() {
    setLoading(true);
    setErr(null);
    const r = await suggestStationTasks(id, { title: st.title, company: st.company }).catch(() => ({ ok: false as const, error: "Das hat nicht geklappt." }));
    setLoading(false);
    if (r.ok) onChange({ tasks: r.tasks, tools: r.tools });
    else setErr(r.error);
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Station {index + 1}</p>
          {manual && !st.title ? null : <h2 className="h2">{st.title || "Neue Station"}</h2>}
          <p className="text-sm text-muted">{[st.company, st.location, period(st)].filter(Boolean).join(" · ")}</p>
        </div>
        {manual && <button type="button" className="text-xs text-muted hover:text-danger" onClick={onRemove}>Entfernen</button>}
      </div>

      {manual && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="Tätigkeit / Beruf, z. B. Lagerhelfer" value={st.title} onChange={(e) => onChange({ title: e.target.value })} />
            <input className="input" placeholder="Firma" value={st.company} onChange={(e) => onChange({ company: e.target.value })} />
            <input className="input" type="month" aria-label="Von" value={st.start} onChange={(e) => onChange({ start: e.target.value })} />
            <input className="input" type="month" aria-label="Bis" value={st.end} disabled={st.current} onChange={(e) => onChange({ end: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.current} onChange={(e) => onChange({ current: e.target.checked })} /> Mache ich heute noch</label>
          <button type="button" className="btn btn-sm" disabled={loading || !st.title.trim()} onClick={suggest}>{loading ? "Einen Moment …" : "Typische Aufgaben anzeigen"}</button>
          {err && <Notice tone="error">{err}</Notice>}
        </div>
      )}

      {st.tasks.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Was hast du dort gemacht?</p>
          <ul className="divide-y divide-line-soft">
            {st.tasks.map((t, i) => (
              <li key={`${t.text}${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={`min-w-0 flex-1 text-sm ${t.level ? "font-medium" : ""}`}>{t.text}</span>
                <LevelPicker value={t.level} onChange={(l) => setTask(i, l)} />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1 text-sm" placeholder="Fehlt etwas? Hier eintragen" value={newTask} onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) { e.preventDefault(); onChange({ tasks: [...st.tasks, { text: newTask.trim().slice(0, 200), level: 2 }] }); setNewTask(""); } }} />
            <button type="button" className="btn-ghost btn-sm" disabled={!newTask.trim()} onClick={() => { onChange({ tasks: [...st.tasks, { text: newTask.trim().slice(0, 200), level: 2 }] }); setNewTask(""); }}>Hinzufügen</button>
          </div>
        </div>
      )}

      {st.tools.length > 0 && <ChipGroup label="Womit hast du gearbeitet?" items={st.tools} onChange={(tools) => onChange({ tools })} addLabel="Weiteres" />}

      <div className="grid gap-3 md:grid-cols-2">
        <Area label="Was hast du sonst noch gemacht?" value={st.ownTasks} onChange={(ownTasks) => onChange({ ownTasks })} />
        <Area label="Hattest du Verantwortung? Für wie viele Leute, welche Kunden, wie viel Geld?" value={st.leadership} onChange={(leadership) => onChange({ leadership })} placeholder="z. B. 12 Mitarbeitende, Schichtplanung" />
        <Area label="Worauf bist du dort stolz?" value={st.success} onChange={(success) => onChange({ success })} placeholder="z. B. Inventurdifferenz halbiert, neue Kollegen eingearbeitet" />
        <Area label="Was hat dir dort gefallen?" value={st.liked} onChange={(liked) => onChange({ liked })} />
      </div>
    </section>
  );
}

function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line text-xs">
      {LEVELS.map((l) => (
        <button key={l.value} type="button" onClick={() => onChange(l.value)}
          className={`px-2.5 py-1.5 ${value === l.value ? (l.value === 0 ? "bg-line-soft font-semibold" : "bg-accent font-semibold text-white") : "bg-surface text-muted hover:text-ink"}`}>
          {l.label}
        </button>
      ))}
    </span>
  );
}

function ChipGroup({ label, items, onChange, addLabel, levels = false }: { label: string; items: Choice[]; onChange: (c: Choice[]) => void; addLabel?: string; levels?: boolean }) {
  const [add, setAdd] = useState("");
  // Antippen: aus → ja (bei Programmen: Grundkenntnisse → gut → aus)
  const next = (l: Level): Level => (levels ? (l === 0 ? 1 : l === 1 ? 2 : 0) : l === 0 ? 2 : 0);
  const push = () => { if (add.trim()) { onChange([...items, { text: add.trim().slice(0, 100), level: 2 }]); setAdd(""); } };
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}{levels && <span className="font-normal text-muted"> (einmal tippen: Grundkenntnisse, zweimal: gut)</span>}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((c, i) => (
          <button key={`${c.text}${i}`} type="button" onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, level: next(x.level) } : x)))}
            className={`rounded-full border px-3 py-1 text-sm ${c.level === 2 ? "border-accent bg-accent text-white" : c.level === 1 ? "border-accent bg-accent/10 text-accent" : "border-line-soft bg-surface text-muted hover:text-ink"}`}>
            {c.level > 0 ? "✓ " : ""}{c.text}{levels && c.level === 1 ? " · Grundkenntnisse" : levels && c.level === 2 ? " · gut" : ""}
          </button>
        ))}
        {addLabel && (
          <span className="inline-flex gap-1">
            <input className="input w-40 py-1 text-sm" placeholder={addLabel} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); push(); } }} />
            {add.trim() && <button type="button" className="btn-ghost btn-sm" onClick={push}>+</button>}
          </span>
        )}
      </div>
    </div>
  );
}

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea className="input min-h-20 text-sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
