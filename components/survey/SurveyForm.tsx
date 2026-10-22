"use client";
import { useEffect, useRef, useState } from "react";
import { saveSurvey, submitSurvey, suggestStationTasks } from "@/app/actions/erfahrung";
import { LEVELS, YES_NO, asksDetail, newStationKey, period, progress, type Choice, type Level, type Station, type SurveyData } from "@/lib/survey/types";
import { Notice } from "../ui";

type Props = { id: string; initial: SurveyData; submittedAt: string | null; coach?: boolean; /** „Typische Aufgaben anzeigen“ (Zusatzfunktion Erfahrungsbogen-Hilfen) */ suggest?: boolean };

/** Erfahrungsbogen zum Ankreuzen. Speichert von selbst, Absenden schickt ihn an den Coach. */
export function SurveyForm({ id, initial, submittedAt, coach = false, suggest = true }: Props) {
  const [d, setD] = useState<SurveyData>(initial);
  const [saved, setSaved] = useState<"ok" | "saving" | "error">("ok");
  const [sent, setSent] = useState<string | null>(submittedAt);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Öffnen allein speichert nie: erst wenn sich etwas gegenüber dem geladenen Stand geändert hat (auch unter StrictMode)
  const [initialJson] = useState(() => JSON.stringify(initial));
  const changed = useRef(false);

  useEffect(() => {
    if (!changed.current && JSON.stringify(d) === initialJson) return;
    changed.current = true;
    setSaved("saving");
    const t = setTimeout(() => {
      saveSurvey(id, d).then((r) => setSaved(r.ok ? "ok" : "error")).catch(() => setSaved("error"));
    }, 1200);
    return () => clearTimeout(t);
  }, [d, id, initialJson]);

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
          Geh deine Stationen der Reihe nach durch und kreuz an, was du dort gemacht hast: <b>Oft</b> für deine Hauptaufgaben, <b>Manchmal</b> für Gelegentliches. Wo in Klammern eine Frage steht, z. B. „(welcher?)“, trägst du die Antwort ein. Was fehlt, schreibst du einfach dazu. Aus deinen Antworten machen wir danach gemeinsam deinen neuen Lebenslauf und einen kurzen Pitch für deine Bewerbungen. Alles wird automatisch gespeichert, du kannst jederzeit aufhören und später weitermachen.
        </p>
      )}

      {d.stations.map((st, i) => (
        <StationCard key={st.key} id={id} index={i} st={st} suggestOn={suggest} onChange={(patch) => setStation(st.key, patch)} onRemove={() => setD((x) => ({ ...x, stations: x.stations.filter((s) => s.key !== st.key) }))} />
      ))}

      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => setD((x) => ({ ...x, stations: [...x.stations, { key: newStationKey(), kind: "arbeit", title: "", company: "", location: "", start: "", end: "", current: false, tasks: [], tools: [], ownTasks: "", leadership: "", success: "", liked: "" }] }))}
      >
        + Weitere Station ergänzen (z. B. Nebenjob, Praktikum, Ehrenamt)
      </button>

      <section className="card space-y-5">
        <h2 className="h2">Was dich ausmacht</h2>
        <ChipGroup label="Deine Stärken: Was würden Kollegen über dich sagen?" items={d.strengths} onChange={(strengths) => setD({ ...d, strengths })} />
        <ChipGroup label="Programme, mit denen du arbeiten kannst" items={d.software} onChange={(software) => setD({ ...d, software })} addLabel="Weiteres Programm" levels />
        <ChipGroup label="Sprachen (außer Deutsch)" items={d.languages} onChange={(languages) => setD({ ...d, languages })} addLabel="Weitere Sprache" />
        <ChipGroup label="Führerscheine und Nachweise" items={d.licences} onChange={(licences) => setD({ ...d, licences })} addLabel="Weiterer Nachweis" />
        <ChipGroup label="Wie kannst du arbeiten?" items={d.availability} onChange={(availability) => setD({ ...d, availability })} addLabel="Weiteres" />
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

function StationCard({ id, index, st, suggestOn, onChange, onRemove }: { id: string; index: number; st: Station; suggestOn: boolean; onChange: (p: Partial<Station>) => void; onRemove: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const manual = !st.tasks.length && st.kind !== "luecke";
  const gap = st.kind === "luecke";
  const edu = st.kind === "ausbildung";
  const setTask = (i: number, patch: Partial<Choice>) => onChange({ tasks: st.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

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
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{gap ? "Zeit ohne Eintrag im Lebenslauf" : edu ? `Station ${index + 1} · Aus- und Weiterbildung` : `Station ${index + 1}`}</p>
          {gap ? <h2 className="h2">Was hast du {st.current ? `seit ${period({ ...st, current: false })}` : `von ${period(st)}`} gemacht?</h2> : manual && !st.title ? null : <h2 className="h2">{st.title || "Neue Station"}</h2>}
          {!gap && <p className="text-sm text-muted">{[st.company, st.location, period(st)].filter(Boolean).join(" · ")}</p>}
        </div>
        {(manual || gap) && <button type="button" className="tap -my-2 px-2 text-sm text-muted hover:text-danger" onClick={onRemove}>{gap ? "Trifft nicht zu" : "Entfernen"}</button>}
      </div>

      {manual && (
        <div className="space-y-3">
          <select className="input" aria-label="Art" value={st.kind} onChange={(e) => onChange({ kind: e.target.value === "ausbildung" ? "ausbildung" : "arbeit" })}>
            <option value="arbeit">Stelle, Nebenjob, Praktikum oder Ehrenamt</option>
            <option value="ausbildung">Ausbildung, Weiterbildung oder Kurs</option>
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder={edu ? "Ausbildung / Kurs, z. B. CNC-Fachkraft" : "Tätigkeit / Beruf, z. B. Lagerhelfer"} value={st.title} onChange={(e) => onChange({ title: e.target.value })} />
            <input className="input" placeholder={edu ? "Schule / Bildungsträger" : "Firma"} value={st.company} onChange={(e) => onChange({ company: e.target.value })} />
            <input className="input" type="month" aria-label="Von" value={st.start} onChange={(e) => onChange({ start: e.target.value })} />
            <input className="input" type="month" aria-label="Bis" value={st.end} disabled={st.current} onChange={(e) => onChange({ end: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.current} onChange={(e) => onChange({ current: e.target.checked })} /> Mache ich heute noch</label>
          {suggestOn && <button type="button" className="btn btn-sm" disabled={loading || !st.title.trim()} onClick={suggest}>{loading ? "Einen Moment …" : "Typische Aufgaben anzeigen"}</button>}
          {err && <Notice tone="error">{err}</Notice>}
        </div>
      )}

      {st.tasks.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">{gap ? "Was trifft zu?" : edu ? "Was hast du dort gelernt und gemacht?" : "Was hast du dort gemacht?"}</p>
          <ul className="divide-y divide-line-soft">
            {st.tasks.map((t, i) => (
              <li key={`${t.text}${i}`} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`min-w-0 flex-1 text-sm ${t.level ? "font-medium" : ""}`}>{t.text}</span>
                  <LevelPicker value={t.level} options={gap || edu ? YES_NO : LEVELS} onChange={(level) => setTask(i, { level })} />
                </div>
                {t.level > 0 && asksDetail(t.text) && (
                  <input className="input py-1.5 text-sm" placeholder="Bitte ergänzen" value={t.detail ?? ""} onChange={(e) => setTask(i, { detail: e.target.value.slice(0, 200) })} />
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1 text-sm" placeholder="Fehlt etwas? Hier eintragen" value={newTask} onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) { e.preventDefault(); onChange({ tasks: [...st.tasks, { text: newTask.trim().slice(0, 200), level: 2 }] }); setNewTask(""); } }} />
            <button type="button" className="btn-ghost btn-sm tap" disabled={!newTask.trim()} onClick={() => { onChange({ tasks: [...st.tasks, { text: newTask.trim().slice(0, 200), level: 2 }] }); setNewTask(""); }}>Hinzufügen</button>
          </div>
        </div>
      )}

      {!gap && st.tools.length > 0 && <ChipGroup label="Womit hast du gearbeitet?" items={st.tools} onChange={(tools) => onChange({ tools })} addLabel="Weiteres" />}

      {gap ? (
        <Area label="Bitte kurz aufschreiben" value={st.ownTasks} onChange={(ownTasks) => onChange({ ownTasks })} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Area label={edu ? "Was hast du sonst noch gelernt?" : "Was hast du sonst noch gemacht?"} value={st.ownTasks} onChange={(ownTasks) => onChange({ ownTasks })} />
          {!edu && <Area label="Hattest du Verantwortung? Für wie viele Leute, welche Kunden, wie viel Geld?" value={st.leadership} onChange={(leadership) => onChange({ leadership })} placeholder="z. B. 12 Mitarbeitende, Schichtplanung" />}
          <Area label="Worauf bist du dort stolz?" value={st.success} onChange={(success) => onChange({ success })} placeholder={edu ? "z. B. Note, Prüfungsstück, Projekt" : "z. B. Inventurdifferenz halbiert, neue Kollegen eingearbeitet"} />
          <Area label="Was hat dir dort gefallen?" value={st.liked} onChange={(liked) => onChange({ liked })} />
        </div>
      )}
    </section>
  );
}

function LevelPicker({ value, options, onChange }: { value: Level; options: { value: Level; label: string }[]; onChange: (l: Level) => void }) {
  return (
    <span role="group" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line text-sm sm:text-xs">
      {options.map((l) => (
        <button key={l.value} type="button" aria-pressed={value === l.value} onClick={() => onChange(l.value)}
          className={`min-h-11 min-w-11 px-3 sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1.5 ${value === l.value ? (l.value === 0 ? "bg-line-soft font-semibold" : "bg-accent font-semibold text-white") : "bg-surface text-muted hover:text-ink"}`}>
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
            className={`tap rounded-full border px-3 py-1 text-sm ${c.level === 2 ? "border-accent bg-accent text-white" : c.level === 1 ? "border-accent bg-accent/10 text-accent" : "border-line-soft bg-surface text-muted hover:text-ink"}`}>
            {c.level > 0 ? "✓ " : ""}{c.text}{levels && c.level === 1 ? " · Grundkenntnisse" : levels && c.level === 2 ? " · gut" : ""}
          </button>
        ))}
        {addLabel && (
          <span className="inline-flex gap-1">
            <input className="input w-40 py-1 text-sm" placeholder={addLabel} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); push(); } }} />
            {add.trim() && <button type="button" className="btn-ghost btn-sm tap min-w-11" aria-label="Hinzufügen" onClick={push}>+</button>}
          </span>
        )}
      </div>
      {items.some((c) => c.level > 0 && asksDetail(c.text)) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {items.map((c, i) =>
            c.level > 0 && asksDetail(c.text) ? (
              <input key={`d${c.text}${i}`} className="input py-1.5 text-sm" placeholder={c.text} value={c.detail ?? ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, detail: e.target.value.slice(0, 200) } : x)))} />
            ) : null,
          )}
        </div>
      )}
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
