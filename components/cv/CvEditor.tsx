"use client";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { improveWithAi, removePhoto, saveCv, skillsFromProfile, uploadPhoto, type AiField } from "@/app/actions/lebenslauf";
import { renderCvHtml } from "@/lib/cv/render";
import { COLORS, TEMPLATES, TIPS, type CvData, type CvPhoto, type PersonalLock, type TemplateKey } from "@/lib/cv/types";
import { CvPreview } from "./CvPreview";
import { PhotoDialog } from "./PhotoDialog";
import { SignatureField } from "./SignatureField";

type Props = {
  cvId: string;
  coacheeId: string;
  /** Datei der digitalen Unterschrift (gehört zur Akte, gilt für alle Lebensläufe) */
  signatureId: string | null;
  initial: { name: string; template: TemplateKey; color: string; data: CvData; version: number; photoId: string | null };
  ai: boolean;
  backHref: string;
  backLabel: string;
  /** Coachee: Name und Kontakt kommen aus den Stammdaten und lassen sich nur ein- oder ausblenden */
  locked?: PersonalLock | null;
  /** „An … senden“ */
  share?: React.ReactNode;
};

type SaveState = { kind: "saved" | "dirty" | "saving" | "error" | "conflict"; at?: string; by?: string | null; message?: string };

// Vorschau lädt die Schriften vom Portal selbst, das PDF bekommt sie eingebettet
const PREVIEW_FONTS = '@import url("/api/lebenslauf/schriften.css");';
const LEVELS = ["ohne Stufe", "Grundkenntnisse", "Erweitert", "Gut", "Sehr gut", "Experte"];
const LANGUAGE_LEVELS = ["Muttersprache", "Verhandlungssicher", "Fließend", "Gute Kenntnisse", "Grundkenntnisse", "C2", "C1", "B2", "B1", "A2", "A1"];

export function CvEditor({ cvId, coacheeId, signatureId: initialSignature, initial, ai, backHref, backLabel, locked = null, share }: Props) {
  const [name, setName] = useState(initial.name);
  const [template, setTemplate] = useState<TemplateKey>(initial.template);
  const [color, setColor] = useState(initial.color);
  const [data, setData] = useState<CvData>(initial.data);
  const [photoId, setPhotoId] = useState(initial.photoId);
  const [signatureId, setSignatureId] = useState(initialSignature);
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [view, setView] = useState<"form" | "preview">("form");
  const [designOpen, setDesignOpen] = useState(false);
  const [photoEdit, setPhotoEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ---------- Automatisch speichern ----------
  const version = useRef(initial.version);
  const latest = useRef({ name, template, color, data });
  const busy = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const timer = useRef<number | null>(null);
  // Öffnen allein speichert nie (auch nicht unter StrictMode): erst nach einer echten Änderung
  const [initialJson] = useState(() => JSON.stringify({ name, template, color, data }));
  const changed = useRef(false);
  const blocked = useRef(false);

  // Speichert, bis nichts mehr offen ist. Änderungen während des Speicherns werden direkt danach nachgeschoben.
  const doSave = useCallback((): Promise<void> => {
    if (blocked.current) return Promise.resolve();
    if (busy.current) {
      pending.current = true;
      return busy.current;
    }
    busy.current = (async () => {
      do {
        pending.current = false;
        setSave({ kind: "saving" });
        try {
          const res = await saveCv(cvId, version.current, latest.current);
          if (res.ok) {
            version.current = res.version;
            setSave({ kind: "saved", at: res.savedAt });
          } else if (res.conflict) {
            blocked.current = true;
            setSave({ kind: "conflict", by: res.conflict.by });
          } else setSave({ kind: "error", message: res.error });
        } catch {
          setSave({ kind: "error", message: "Keine Verbindung, neuer Versuch …" });
          pending.current = true;
          await new Promise((r) => setTimeout(r, 3000));
        }
      } while (pending.current && !blocked.current);
      busy.current = null;
    })();
    return busy.current;
  }, [cvId]);

  useEffect(() => {
    latest.current = { name, template, color, data };
  }, [name, template, color, data]);

  useEffect(() => {
    if (!changed.current && JSON.stringify({ name, template, color, data }) === initialJson) return;
    changed.current = true;
    setSave((s) => (s.kind === "conflict" ? s : { kind: "dirty" }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void doSave(), 900);
  }, [name, template, color, data, doSave, initialJson]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (save.kind === "dirty" || save.kind === "error") await doSave();
    else if (busy.current) await busy.current;
  }, [save.kind, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save.kind === "dirty" || save.kind === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.kind]);

  // ---------- Vorschau ----------
  const deferred = useDeferredValue(data);
  const photoUrl = photoId ? `/api/dateien/${photoId}` : null;
  const [layout, setLayout] = useState({ pages: 1, fit: 1 });
  const signatureUrl = signatureId ? `/api/dateien/${signatureId}` : null;
  const html = useMemo(() => renderCvHtml(deferred, { template, color, photo: photoUrl, signature: signatureUrl, fontCss: PREVIEW_FONTS }), [deferred, template, color, photoUrl, signatureUrl]);

  // ---------- Hilfen zum Ändern ----------
  const set = <K extends keyof CvData>(key: K, value: CvData[K]) => setData((d) => ({ ...d, [key]: value }));
  const setPersonal = (key: keyof CvData["personal"], value: string) => setData((d) => ({ ...d, personal: { ...d.personal, [key]: value } }));
  const setPhoto = (v: CvPhoto) => setData((d) => ({ ...d, photo: v }));

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function onPhotoFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("foto", file);
    const res = await uploadPhoto(cvId, fd).catch(() => ({ ok: false as const, error: "Das Foto konnte nicht hochgeladen werden." }));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    if (!res.ok) return setNotice(res.error);
    setPhotoId(res.photoId);
    setPhoto({ zoom: 1, x: 50, y: 50 });
    setPhotoEdit(true);
  }

  async function addProfileSkills() {
    const skills = await skillsFromProfile(cvId);
    const known = new Set(data.skills.map((s) => s.name.trim().toLowerCase()));
    const fresh = skills.filter((s) => !known.has(s.name.trim().toLowerCase()));
    if (!fresh.length) return setNotice(skills.length ? "Alle Kenntnisse aus dem Kompetenzprofil stehen schon drin." : "Im Kompetenzprofil sind noch keine freigegebenen Kenntnisse.");
    set("skills", [...data.skills, ...fresh]);
    setNotice(`${fresh.length} ${fresh.length === 1 ? "Kenntnis" : "Kenntnisse"} aus dem Kompetenzprofil übernommen.`);
  }

  const sortByDate = () => set("experience", [...data.experience].sort((a, b) => (b.current ? "9999" : b.end || b.start).localeCompare(a.current ? "9999" : a.end || a.start)));

  const pdfHref = `/api/lebenslauf/${cvId}/pdf`;
  const [pdfBusy, setPdfBusy] = useState(false);

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href={backHref} className="text-sm text-muted hover:text-ink" onClick={() => void flush()}>← {backLabel}</Link>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name des Lebenslaufs" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight outline-none hover:border-line focus:border-accent sm:text-2xl" />
        <SaveBadge state={save} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" className="btn-ghost" onClick={() => setDesignOpen((o) => !o)} aria-expanded={designOpen}>
            <span className="size-3.5 rounded-full" style={{ background: color }} /> Design: {TEMPLATES.find((t) => t.key === template)?.label}
          </button>
          {share}
          <button
            type="button"
            className="btn"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              await flush();
              const a = document.createElement("a");
              a.href = pdfHref;
              a.click();
              window.setTimeout(() => setPdfBusy(false), 2500);
            }}
          >
            {pdfBusy ? "PDF wird erstellt …" : "PDF herunterladen"}
          </button>
        </div>
      </div>

      {save.kind === "conflict" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fbf1e3] px-4 py-3 text-sm text-[#7a5524]">
          <span>{save.by ? `${save.by} hat` : "Jemand hat"} diesen Lebenslauf gerade geändert. Lade neu, um mit dem aktuellen Stand weiterzumachen. Deine letzte Änderung ist dann weg.</span>
          <button type="button" className="btn-ghost btn-sm tap" onClick={() => window.location.reload()}>Neu laden</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-tint px-4 py-2.5 text-sm text-accent" role="status">
          <span>{notice}</span>
          <button type="button" className="tap px-1 text-xs font-semibold" onClick={() => setNotice(null)}>Schließen</button>
        </div>
      )}

      {designOpen && <DesignPicker data={data} photo={photoUrl} template={template} color={color} onTemplate={setTemplate} onColor={setColor} onClose={() => setDesignOpen(false)} />}

      {/* Umschalter am Handy */}
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1 text-sm font-semibold lg:hidden">
        {(["form", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg py-2 ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "form" ? "Bearbeiten" : "Vorschau"}</button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className={`space-y-3 ${view === "form" ? "" : "hidden lg:block"}`}>
          <Step n={1} title="Persönliche Daten" tip={TIPS.personal} open>
            <div className="flex flex-wrap items-center gap-4">
              <div className="size-20 overflow-hidden rounded-xl bg-bg ring-1 ring-line">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Bewerbungsfoto" className="size-full object-cover" style={{ objectPosition: `${data.photo.x}% ${data.photo.y}%`, transform: `scale(${data.photo.zoom})`, transformOrigin: `${data.photo.x}% ${data.photo.y}%` }} />
                ) : (
                  <span className="grid size-full place-items-center text-xs text-muted">Kein Foto</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm tap" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Lädt hoch …" : photoUrl ? "Anderes Foto" : "Foto hochladen"}</button>
                {photoUrl && <button type="button" className="btn-ghost btn-sm tap" onClick={() => setPhotoEdit(true)}>Ausschnitt</button>}
                {photoUrl && (
                  <button type="button" className="btn-ghost btn-sm tap" onClick={async () => { await removePhoto(cvId); setPhotoId(null); }}>Entfernen</button>
                )}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPhotoFile(e.target.files?.[0])} />
              </div>
              {template === "schlicht" && photoUrl && <p className="w-full text-xs text-muted">Das Design „Schlicht“ zeigt bewusst kein Foto.</p>}
            </div>
            {locked && <p className="rounded-xl bg-tint px-3 py-2 text-xs text-accent">Name, E-Mail, Telefon und Geburtsdatum kommen aus deinen Daten. Du kannst sie ein- oder ausblenden. Ändern kannst du Telefon und Geburtsdatum unter „Meine Daten“ auf der Seite „Mein Lebenslauf“.</p>}
            <Grid>
              {locked ? (
                <>
                  <Fixed label="Vorname" value={locked.firstName} />
                  <Fixed label="Nachname" value={locked.lastName} />
                </>
              ) : (
                <>
                  <In label="Vorname" value={data.personal.firstName} onChange={(v) => setPersonal("firstName", v)} autoComplete="given-name" />
                  <In label="Nachname" value={data.personal.lastName} onChange={(v) => setPersonal("lastName", v)} autoComplete="family-name" />
                </>
              )}
            </Grid>
            <AiHelp cvId={cvId} ai={ai} field="headline" data={data} value={data.personal.headline} onApply={(v) => setPersonal("headline", v)}>
              <In label="Berufsbezeichnung oder Wunschposition" value={data.personal.headline} onChange={(v) => setPersonal("headline", v)} placeholder="z. B. Fachkraft für Lagerlogistik" />
            </AiHelp>
            <Grid>
              {locked ? (
                <>
                  <Fixed label="E-Mail" value={locked.email} shown={Boolean(data.personal.email)} onShow={(on) => setPersonal("email", on ? locked.email : "")} />
                  <Fixed label="Telefon" value={locked.phone} shown={Boolean(data.personal.phone)} onShow={(on) => setPersonal("phone", on ? locked.phone : "")} />
                </>
              ) : (
                <>
                  <In label="E-Mail" type="email" value={data.personal.email} onChange={(v) => setPersonal("email", v)} autoComplete="email" />
                  <In label="Telefon" type="tel" value={data.personal.phone} onChange={(v) => setPersonal("phone", v)} autoComplete="tel" />
                </>
              )}
            </Grid>
            <In label="Straße und Hausnummer" value={data.personal.street} onChange={(v) => setPersonal("street", v)} autoComplete="street-address" />
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <In label="PLZ" value={data.personal.zip} onChange={(v) => setPersonal("zip", v)} inputMode="numeric" autoComplete="postal-code" />
              <In label="Ort" value={data.personal.city} onChange={(v) => setPersonal("city", v)} autoComplete="address-level2" />
            </div>
            <Grid>
              {locked ? (
                <Fixed label="Geburtsdatum" value={locked.birthDate} shown={Boolean(data.personal.birthDate)} onShow={(on) => setPersonal("birthDate", on ? locked.birthDate : "")} />
              ) : (
                <In label="Geburtsdatum" value={data.personal.birthDate} onChange={(v) => setPersonal("birthDate", v)} placeholder="TT.MM.JJJJ" hint="freiwillig" />
              )}
              <In label="Geburtsort" value={data.personal.birthPlace} onChange={(v) => setPersonal("birthPlace", v)} hint="freiwillig" />
              <In label="Nationalität" value={data.personal.nationality} onChange={(v) => setPersonal("nationality", v)} hint="freiwillig" />
              <In label="Führerschein" value={data.personal.license} onChange={(v) => setPersonal("license", v)} placeholder="z. B. B, BE, Stapler" />
            </Grid>
            <In label="Website oder LinkedIn" value={data.personal.web} onChange={(v) => setPersonal("web", v)} />
          </Step>

          <Step n={2} title="Profil" tip={TIPS.summary} open={!data.summary}>
            <AiHelp cvId={cvId} ai={ai} field="summary" data={data} value={data.summary} onApply={(v) => set("summary", v)}>
              <Area label="Kurzprofil" value={data.summary} onChange={(v) => set("summary", v)} rows={4} />
            </AiHelp>
          </Step>

          <Step n={3} title="Berufserfahrung" tip={TIPS.experience} count={data.experience.length}>
            <ListEditor
              items={data.experience}
              onChange={(v) => set("experience", v)}
              add={{ label: "Station hinzufügen", item: { title: "", company: "", location: "", start: "", end: "", current: false, bullets: "" } }}
              summary={(e) => [e.title || "Neue Station", e.company].filter(Boolean).join(" · ")}
              extra={data.experience.length > 1 ? <button type="button" className="link text-sm" onClick={sortByDate}>Neueste zuerst sortieren</button> : null}
              render={(e, upd) => (
                <>
                  <Grid>
                    <In label="Position" value={e.title} onChange={(v) => upd({ title: v })} />
                    <In label="Firma" value={e.company} onChange={(v) => upd({ company: v })} />
                  </Grid>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <In label="Ort" value={e.location} onChange={(v) => upd({ location: v })} />
                    <In label="Von" type="month" value={e.start} onChange={(v) => upd({ start: v })} />
                    {e.current ? (
                      <div><span className="label">Bis</span><p className="py-2.5 text-[15px] text-muted">heute</p></div>
                    ) : (
                      <In label="Bis" type="month" value={e.end} onChange={(v) => upd({ end: v })} />
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.current} onChange={(ev) => upd({ current: ev.target.checked, end: ev.target.checked ? "" : e.end })} className="size-4 accent-[var(--accent)]" /> Arbeite ich noch dort</label>
                  <AiHelp cvId={cvId} ai={ai} field="bullets" data={{ ...data, experience: [e] }} value={e.bullets} onApply={(v) => upd({ bullets: v })}>
                    <Area label="Aufgaben und Erfolge" hint="Ein Punkt pro Zeile" value={e.bullets} onChange={(v) => upd({ bullets: v })} rows={4} />
                  </AiHelp>
                </>
              )}
            />
          </Step>

          <Step n={4} title="Ausbildung" tip={TIPS.education} count={data.education.length}>
            <ListEditor
              items={data.education}
              onChange={(v) => set("education", v)}
              add={{ label: "Ausbildung hinzufügen", item: { degree: "", school: "", location: "", start: "", end: "", detail: "" } }}
              summary={(e) => [e.degree || "Neuer Eintrag", e.school].filter(Boolean).join(" · ")}
              render={(e, upd) => (
                <>
                  <Grid>
                    <In label="Abschluss" value={e.degree} onChange={(v) => upd({ degree: v })} placeholder="z. B. Mittlere Reife" />
                    <In label="Schule oder Hochschule" value={e.school} onChange={(v) => upd({ school: v })} />
                  </Grid>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <In label="Ort" value={e.location} onChange={(v) => upd({ location: v })} />
                    <In label="Von" type="month" value={e.start} onChange={(v) => upd({ start: v })} />
                    <In label="Bis" type="month" value={e.end} onChange={(v) => upd({ end: v })} />
                  </div>
                  <In label="Schwerpunkt oder Note" value={e.detail} onChange={(v) => upd({ detail: v })} />
                </>
              )}
            />
          </Step>

          <Step n={5} title="Weiterbildung und Zertifikate" tip={TIPS.certificates} count={data.certificates.length}>
            <ListEditor
              items={data.certificates}
              onChange={(v) => set("certificates", v)}
              add={{ label: "Weiterbildung hinzufügen", item: { name: "", institution: "", year: "" } }}
              summary={(c) => c.name || "Neuer Eintrag"}
              render={(c, upd) => (
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                  <In label="Bezeichnung" value={c.name} onChange={(v) => upd({ name: v })} />
                  <In label="Anbieter" value={c.institution} onChange={(v) => upd({ institution: v })} />
                  <In label="Jahr" value={c.year} onChange={(v) => upd({ year: v })} inputMode="numeric" />
                </div>
              )}
            />
          </Step>

          <Step n={6} title="Kenntnisse" tip={TIPS.skills} count={data.skills.length}>
            <div className="space-y-2">
              {data.skills.map((s, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Kenntnis" : ""} value={s.name} onChange={(v) => set("skills", data.skills.map((x, j) => (j === i ? { ...x, name: v } : x)))} aria-label="Kenntnis" /></div>
                  <label className="w-36 shrink-0">
                    {i === 0 && <span className="label">Stufe</span>}
                    <select className="input" value={s.level} aria-label="Stufe" onChange={(e) => set("skills", data.skills.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))}>
                      {LEVELS.map((l, n) => <option key={n} value={n}>{l}</option>)}
                    </select>
                  </label>
                  <MiniButtons i={i} len={data.skills.length} onMove={(d) => set("skills", move(data.skills, i, d))} onRemove={() => set("skills", data.skills.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm tap" onClick={() => set("skills", [...data.skills, { name: "", level: 3 }])}>+ Kenntnis</button>
              <button type="button" className="btn-ghost btn-sm tap" onClick={addProfileSkills}>Aus dem Kompetenzprofil übernehmen</button>
            </div>
          </Step>

          <Step n={7} title="Sprachen" tip={TIPS.languages} count={data.languages.length}>
            <datalist id="sprachstufen">{LANGUAGE_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
            <div className="space-y-2">
              {data.languages.map((l, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Sprache" : ""} value={l.name} onChange={(v) => set("languages", data.languages.map((x, j) => (j === i ? { ...x, name: v } : x)))} aria-label="Sprache" /></div>
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Niveau" : ""} value={l.level} list="sprachstufen" onChange={(v) => set("languages", data.languages.map((x, j) => (j === i ? { ...x, level: v } : x)))} aria-label="Niveau" /></div>
                  <MiniButtons i={i} len={data.languages.length} onMove={(d) => set("languages", move(data.languages, i, d))} onRemove={() => set("languages", data.languages.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost btn-sm tap" onClick={() => set("languages", [...data.languages, { name: "", level: "" }])}>+ Sprache</button>
          </Step>

          <Step n={8} title="Interessen und Abschluss" tip={TIPS.interests}>
            <AiHelp cvId={cvId} ai={ai} field="interests" data={data} value={data.interests} onApply={(v) => set("interests", v)}>
              <Area label="Interessen" value={data.interests} onChange={(v) => set("interests", v)} rows={2} />
            </AiHelp>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.signature} onChange={(e) => set("signature", e.target.checked)} className="size-4 accent-[var(--accent)]" /> Zeile für Ort, Datum und Unterschrift</label>
            {data.signature && (
              <>
                <In label="Ort für die Unterschrift" value={data.place} onChange={(v) => set("place", v)} placeholder={data.personal.city || "z. B. Nürnberg"} hint="Das Datum wird beim Herunterladen automatisch eingesetzt." />
                <SignatureField coacheeId={coacheeId} value={signatureId} onChange={setSignatureId} />
                {signatureId && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.signatureImage} onChange={(e) => set("signatureImage", e.target.checked)} className="size-4 accent-[var(--accent)]" /> Unterschrift in diesem Lebenslauf zeigen</label>
                )}
              </>
            )}
          </Step>
        </div>

        <div className={`lg:sticky lg:top-20 ${view === "preview" ? "" : "hidden lg:block"}`}>
          <CvPreview html={html} onLayout={setLayout} />
          <p className="mt-2 text-center text-xs text-muted">
            {layout.pages} {layout.pages === 1 ? "Seite" : "Seiten"}, Umbrüche wie im PDF.
            {layout.fit < 1 && ` Schrift und Abstände sind auf ${Math.round(layout.fit * 100)} % verkleinert, damit kein Rest allein auf einer Seite steht.`}
          </p>
        </div>
      </div>

      {photoEdit && photoUrl && (
        <PhotoDialog
          src={photoUrl}
          value={data.photo}
          onCancel={() => setPhotoEdit(false)}
          onSave={(v) => {
            setPhoto(v);
            setPhotoEdit(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Bausteine ----------

function SaveBadge({ state }: { state: SaveState }) {
  const time = state.at ? new Date(state.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
  const text = {
    saved: time ? `Gespeichert ${time}` : "Gespeichert",
    dirty: "Änderungen …",
    saving: "Speichert …",
    error: state.message ?? "Nicht gespeichert",
    conflict: "Nicht gespeichert",
  }[state.kind];
  const tone = state.kind === "error" || state.kind === "conflict" ? "text-danger" : state.kind === "saved" ? "text-ok" : "text-muted";
  return <span className={`text-xs font-medium ${tone}`} aria-live="polite">{text}</span>;
}

function Step({ n, title, tip, count, open, children }: { n: number; title: string; tip: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group card !p-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-accent">{n}</span>
        <span className="h2 flex-1">{title}</span>
        {count !== undefined && count > 0 && <span className="badge bg-bg text-muted">{count}</span>}
        <span className="text-muted transition group-open:rotate-180" aria-hidden>⌄</span>
      </summary>
      <div className="space-y-4 border-t border-line-soft px-5 pb-5 pt-4">
        <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted"><b className="font-semibold text-ink">Tipp:</b> {tip}</p>
        {children}
      </div>
    </details>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

function In({ label, value, onChange, hint, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block min-w-0">
      {label && <span className="label">{label}{hint && <span className="ml-1 font-normal text-muted">({hint})</span>}</span>}
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

/** Feld aus den Stammdaten: nur lesen, bei Bedarf im Lebenslauf ein- oder ausblenden */
function Fixed({ label, value, shown, onShow }: { label: string; value: string; shown?: boolean; onShow?: (on: boolean) => void }) {
  return (
    <div className="min-w-0">
      <span className="label flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {onShow && value && (
          <label className="flex items-center gap-1.5 text-xs font-normal text-muted">
            <input type="checkbox" checked={shown} onChange={(e) => onShow(e.target.checked)} className="size-3.5 accent-[var(--accent)]" /> zeigen
          </label>
        )}
      </span>
      <input className={`input cursor-not-allowed bg-surface-2 ${shown === false ? "text-muted line-through" : "text-muted"}`} value={value || "noch nicht eingetragen"} readOnly aria-label={label} />
    </div>
  );
}

function Area({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="label">{label}{hint && <span className="ml-1 font-normal text-muted">({hint})</span>}</span>
      <textarea className="input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function move<T>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function MiniButtons({ i, len, onMove, onRemove }: { i: number; len: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const cls = "grid size-11 sm:size-9 place-items-center rounded-lg border border-line text-muted hover:border-accent hover:text-accent disabled:opacity-30";
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={cls} disabled={i === 0} onClick={() => onMove(-1)} aria-label="Nach oben" title="Nach oben">↑</button>
      <button type="button" className={cls} disabled={i === len - 1} onClick={() => onMove(1)} aria-label="Nach unten" title="Nach unten">↓</button>
      <button type="button" className={`${cls} hover:!border-danger hover:!text-danger`} onClick={onRemove} aria-label="Entfernen" title="Entfernen">✕</button>
    </div>
  );
}

function ListEditor<T>({ items, onChange, add, summary, render, extra }: { items: T[]; onChange: (v: T[]) => void; add: { label: string; item: T }; summary: (t: T) => string; render: (t: T, upd: (p: Partial<T>) => void) => ReactNode; extra?: ReactNode }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div key={i} className={`rounded-xl border ${open ? "border-accent/40 bg-bg/40" : "border-line-soft"}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-h-11 min-w-0 flex-1 truncate text-left text-sm font-semibold sm:min-h-0" onClick={() => setOpenIdx(open ? null : i)} aria-expanded={open}>
                {summary(item)}
              </button>
              <MiniButtons
                i={i}
                len={items.length}
                onMove={(d) => {
                  onChange(move(items, i, d));
                  if (open) setOpenIdx(i + d);
                }}
                onRemove={() => {
                  onChange(items.filter((_, j) => j !== i));
                  setOpenIdx(null);
                }}
              />
            </div>
            {open && <div className="space-y-3 border-t border-line-soft px-3 pb-3 pt-3">{render(item, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))))}</div>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost btn-sm tap" onClick={() => { onChange([...items, add.item]); setOpenIdx(items.length); }}>+ {add.label}</button>
        {extra}
      </div>
    </div>
  );
}

/** Feld mit KI-Knopf: der Vorschlag erscheint darunter und wird erst nach Klick übernommen. */
function AiHelp({ cvId, ai, field, data, value, onApply, children }: { cvId: string; ai: boolean; field: AiField; data: CvData; value: string; onApply: (v: string) => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!ai) return <>{children}</>;
  const label = value.trim() ? "Verbessern lassen" : "Formulieren lassen";
  return (
    <div className="space-y-2">
      {children}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await improveWithAi(cvId, field, value, data).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
          setBusy(false);
          if (res.ok) setSuggestion(res.text);
          else setError(res.error);
        }}
      >
        <span aria-hidden>✦</span> {busy ? "Wird geschrieben …" : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {suggestion && (
        <div className="space-y-2 rounded-xl border border-gold/40 bg-[#fbf6ee] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Vorschlag</p>
          <p className="whitespace-pre-line text-sm">{suggestion}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm tap" onClick={() => { onApply(suggestion); setSuggestion(null); }}>Übernehmen</button>
            <button type="button" className="btn-ghost btn-sm tap" onClick={() => setSuggestion(null)}>Verwerfen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DesignPicker({ data, photo, template, color, onTemplate, onColor, onClose }: { data: CvData; photo: string | null; template: TemplateKey; color: string; onTemplate: (t: TemplateKey) => void; onColor: (c: string) => void; onClose: () => void }) {
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2">Design und Farbe</h2>
        <button type="button" className="btn-ghost btn-sm tap" onClick={onClose}>Fertig</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button key={c.hex} type="button" title={c.name} aria-label={`Farbe ${c.name}`} aria-pressed={color === c.hex} onClick={() => onColor(c.hex)} className={`size-8 rounded-full ring-offset-2 ring-offset-surface transition ${color === c.hex ? "ring-2 ring-ink" : "hover:scale-110"}`} style={{ background: c.hex }} />
        ))}
        <label className="ml-1 flex items-center gap-2 text-sm text-muted">
          Eigene Farbe
          <input type="color" value={color} onChange={(e) => onColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" onClick={() => onTemplate(t.key)} aria-pressed={template === t.key} className={`group space-y-2 rounded-xl p-2 text-left transition ${template === t.key ? "bg-tint ring-2 ring-accent" : "hover:bg-bg"}`}>
            <CvPreview html={renderCvHtml(data, { template: t.key, color, photo, fontCss: PREVIEW_FONTS })} showBreaks={false} className="pointer-events-none max-h-56 overflow-hidden" />
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className="block text-xs text-muted">{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
