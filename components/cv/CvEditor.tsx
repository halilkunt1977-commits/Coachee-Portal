"use client";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { improveWithAi, removePhoto, saveCv, skillsFromProfile, uploadPhoto, type AiField } from "@/app/actions/lebenslauf";
import { renderCvHtml } from "@/lib/cv/render";
import { COLORS, TEMPLATES, TIPS, type CvData, type CvLanguageKey, type CvPhoto, type PersonalLock, type TemplateKey } from "@/lib/cv/types";
import { CvPreview } from "./CvPreview";
import { PhotoDialog } from "./PhotoDialog";
import { SignatureField } from "./SignatureField";
import { useT } from "../i18n/LangProvider";

type Props = {
  cvId: string;
  coacheeId: string;
  /** Vor- und Nachname für die Unterschrift-Vorschläge */
  signName: string;
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

export function CvEditor({ cvId, coacheeId, signName, signatureId: initialSignature, initial, ai, backHref, backLabel, locked = null, share }: Props) {
  const t = useT();
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
          } else setSave({ kind: "error", message: t(res.error) });
        } catch {
          setSave({ kind: "error", message: t("Keine Verbindung, neuer Versuch …") });
          pending.current = true;
          await new Promise((r) => setTimeout(r, 3000));
        }
      } while (pending.current && !blocked.current);
      busy.current = null;
    })();
    return busy.current;
  }, [cvId, t]);

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
    const res = await uploadPhoto(cvId, fd).catch(() => ({ ok: false as const, error: t("Das Foto konnte nicht hochgeladen werden.") }));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    if (!res.ok) return setNotice(t(res.error));
    setPhotoId(res.photoId);
    setPhoto({ zoom: 1, x: 50, y: 50 });
    setPhotoEdit(true);
  }

  async function addProfileSkills() {
    const skills = await skillsFromProfile(cvId);
    const known = new Set(data.skills.map((s) => s.name.trim().toLowerCase()));
    const fresh = skills.filter((s) => !known.has(s.name.trim().toLowerCase()));
    if (!fresh.length) return setNotice(skills.length ? t("Alle Kenntnisse aus dem Kompetenzprofil stehen schon drin.") : t("Im Kompetenzprofil sind noch keine freigegebenen Kenntnisse."));
    set("skills", [...data.skills, ...fresh]);
    setNotice(t(fresh.length === 1 ? "{n} Kenntnis aus dem Kompetenzprofil übernommen." : "{n} Kenntnisse aus dem Kompetenzprofil übernommen.", { n: fresh.length }));
  }

  const sortByDate = () => set("experience", [...data.experience].sort((a, b) => (b.current ? "9999" : b.end || b.start).localeCompare(a.current ? "9999" : a.end || a.start)));

  const pdfHref = `/api/lebenslauf/${cvId}/pdf`;
  const [pdfBusy, setPdfBusy] = useState(false);

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href={backHref} className="text-sm text-muted hover:text-ink" onClick={() => void flush()}>← {backLabel}</Link>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Name des Lebenslaufs")} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight outline-none hover:border-line focus:border-accent sm:text-2xl" />
        <SaveBadge state={save} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" className="btn-ghost" onClick={() => setDesignOpen((o) => !o)} aria-expanded={designOpen}>
            <span className="size-3.5 rounded-full" style={{ background: color }} /> {t("Design:")} {t(TEMPLATES.find((x) => x.key === template)?.label ?? "")}
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
            {pdfBusy ? t("PDF wird erstellt …") : t("PDF herunterladen")}
          </button>
        </div>
      </div>

      {save.kind === "conflict" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fbf1e3] px-4 py-3 text-sm text-[#7a5524]">
          <span>{save.by ? t("{name} hat diesen Lebenslauf gerade geändert. Lade neu, um mit dem aktuellen Stand weiterzumachen. Deine letzte Änderung ist dann weg.", { name: save.by }) : t("Jemand hat diesen Lebenslauf gerade geändert. Lade neu, um mit dem aktuellen Stand weiterzumachen. Deine letzte Änderung ist dann weg.")}</span>
          <button type="button" className="btn-ghost btn-sm tap" onClick={() => window.location.reload()}>{t("Neu laden")}</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-tint px-4 py-2.5 text-sm text-accent" role="status">
          <span>{notice}</span>
          <button type="button" className="tap px-1 text-xs font-semibold" onClick={() => setNotice(null)}>{t("Schließen")}</button>
        </div>
      )}

      {designOpen && <DesignPicker data={data} photo={photoUrl} template={template} color={color} onTemplate={setTemplate} onColor={setColor} onLanguage={(l) => set("language", l)} onClose={() => setDesignOpen(false)} />}

      {/* Umschalter am Handy */}
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1 text-sm font-semibold lg:hidden">
        {(["form", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg py-2 ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "form" ? t("Bearbeiten") : t("Vorschau")}</button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className={`space-y-3 ${view === "form" ? "" : "hidden lg:block"}`}>
          <Step n={1} title="Persönliche Daten" tip={TIPS.personal} open>
            <div className="flex flex-wrap items-center gap-4">
              <div className="size-20 overflow-hidden rounded-xl bg-bg ring-1 ring-line">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt={t("Bewerbungsfoto")} className="size-full object-cover" style={{ objectPosition: `${data.photo.x}% ${data.photo.y}%`, transform: `scale(${data.photo.zoom})`, transformOrigin: `${data.photo.x}% ${data.photo.y}%` }} />
                ) : (
                  <span className="grid size-full place-items-center text-xs text-muted">{t("Kein Foto")}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm tap" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? t("Lädt hoch …") : photoUrl ? t("Anderes Foto") : t("Foto hochladen")}</button>
                {photoUrl && <button type="button" className="btn-ghost btn-sm tap" onClick={() => setPhotoEdit(true)}>{t("Ausschnitt")}</button>}
                {photoUrl && (
                  <button type="button" className="btn-ghost btn-sm tap" onClick={async () => { await removePhoto(cvId); setPhotoId(null); }}>{t("Entfernen")}</button>
                )}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPhotoFile(e.target.files?.[0])} />
              </div>
              {template === "schlicht" && photoUrl && <p className="w-full text-xs text-muted">{t("Das Design „Schlicht“ zeigt bewusst kein Foto.")}</p>}
            </div>
            {locked && <p className="rounded-xl bg-tint px-3 py-2 text-xs text-accent">{t("Name, E-Mail, Telefon und Geburtsdatum kommen aus deinen Daten. Du kannst sie ein- oder ausblenden. Ändern kannst du Telefon und Geburtsdatum unter „Meine Daten“ auf der Seite „Mein Lebenslauf“.")}</p>}
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
              summary={(e) => [e.title || t("Neue Station"), e.company].filter(Boolean).join(" · ")}
              extra={data.experience.length > 1 ? <button type="button" className="link text-sm" onClick={sortByDate}>{t("Neueste zuerst sortieren")}</button> : null}
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
                      <div><span className="label">{t("Bis")}</span><p className="py-2.5 text-[15px] text-muted">{t("heute")}</p></div>
                    ) : (
                      <In label="Bis" type="month" value={e.end} onChange={(v) => upd({ end: v })} />
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.current} onChange={(ev) => upd({ current: ev.target.checked, end: ev.target.checked ? "" : e.end })} className="size-4 accent-[var(--accent)]" /> {t("Arbeite ich noch dort")}</label>
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
              summary={(e) => [e.degree || t("Neuer Eintrag"), e.school].filter(Boolean).join(" · ")}
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
              summary={(c) => c.name || t("Neuer Eintrag")}
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
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Kenntnis" : ""} value={s.name} onChange={(v) => set("skills", data.skills.map((x, j) => (j === i ? { ...x, name: v } : x)))} aria-label={t("Kenntnis")} /></div>
                  <label className="w-36 shrink-0">
                    {i === 0 && <span className="label">{t("Stufe")}</span>}
                    <select className="input" value={s.level} aria-label={t("Stufe")} onChange={(e) => set("skills", data.skills.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))}>
                      {LEVELS.map((l, n) => <option key={n} value={n}>{t(l)}</option>)}
                    </select>
                  </label>
                  <MiniButtons i={i} len={data.skills.length} onMove={(d) => set("skills", move(data.skills, i, d))} onRemove={() => set("skills", data.skills.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm tap" onClick={() => set("skills", [...data.skills, { name: "", level: 3 }])}>+ {t("Kenntnis")}</button>
              <button type="button" className="btn-ghost btn-sm tap" onClick={addProfileSkills}>{t("Aus dem Kompetenzprofil übernehmen")}</button>
            </div>
          </Step>

          <Step n={7} title="Sprachen" tip={TIPS.languages} count={data.languages.length}>
            <datalist id="sprachstufen">{LANGUAGE_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
            <div className="space-y-2">
              {data.languages.map((l, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Sprache" : ""} value={l.name} onChange={(v) => set("languages", data.languages.map((x, j) => (j === i ? { ...x, name: v } : x)))} aria-label={t("Sprache")} /></div>
                  <div className="min-w-0 flex-1"><In label={i === 0 ? "Niveau" : ""} value={l.level} list="sprachstufen" onChange={(v) => set("languages", data.languages.map((x, j) => (j === i ? { ...x, level: v } : x)))} aria-label={t("Niveau")} /></div>
                  <MiniButtons i={i} len={data.languages.length} onMove={(d) => set("languages", move(data.languages, i, d))} onRemove={() => set("languages", data.languages.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost btn-sm tap" onClick={() => set("languages", [...data.languages, { name: "", level: "" }])}>+ {t("Sprache")}</button>
          </Step>

          <Step n={8} title="Interessen und Abschluss" tip={TIPS.interests}>
            <AiHelp cvId={cvId} ai={ai} field="interests" data={data} value={data.interests} onApply={(v) => set("interests", v)}>
              <Area label="Interessen" value={data.interests} onChange={(v) => set("interests", v)} rows={2} />
            </AiHelp>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.signature} onChange={(e) => set("signature", e.target.checked)} className="size-4 accent-[var(--accent)]" /> {t("Zeile für Ort, Datum und Unterschrift")}</label>
            {data.signature && (
              <>
                <In label="Ort für die Unterschrift" value={data.place} onChange={(v) => set("place", v)} placeholder={data.personal.city || t("z. B. Nürnberg")} hint="Das Datum wird beim Herunterladen automatisch eingesetzt." />
                <SignatureField coacheeId={coacheeId} name={signName} value={signatureId} onChange={setSignatureId} />
                {signatureId && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.signatureImage} onChange={(e) => set("signatureImage", e.target.checked)} className="size-4 accent-[var(--accent)]" /> {t("Unterschrift in diesem Lebenslauf zeigen")}</label>
                )}
              </>
            )}
          </Step>
        </div>

        <div className={`lg:sticky lg:top-20 ${view === "preview" ? "" : "hidden lg:block"}`}>
          <CvPreview html={html} onLayout={setLayout} />
          <p className="mt-2 text-center text-xs text-muted">
            {t(layout.pages === 1 ? "{n} Seite, Umbrüche wie im PDF." : "{n} Seiten, Umbrüche wie im PDF.", { n: layout.pages })}
            {layout.fit < 1 && ` ${t("Schrift und Abstände sind auf {p} % verkleinert, damit kein Rest allein auf einer Seite steht.", { p: Math.round(layout.fit * 100) })}`}
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
  const t = useT();
  const time = state.at ? new Date(state.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
  const text = {
    saved: time ? t("Gespeichert {zeit}", { zeit: time }) : t("Gespeichert"),
    dirty: t("Änderungen …"),
    saving: t("Speichert …"),
    error: state.message ?? t("Nicht gespeichert"),
    conflict: t("Nicht gespeichert"),
  }[state.kind];
  const tone = state.kind === "error" || state.kind === "conflict" ? "text-danger" : state.kind === "saved" ? "text-ok" : "text-muted";
  return <span className={`text-xs font-medium ${tone}`} aria-live="polite">{text}</span>;
}

function Step({ n, title, tip, count, open, children }: { n: number; title: string; tip: string; count?: number; open?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <details open={open} className="group card !p-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-accent">{n}</span>
        <span className="h2 flex-1">{t(title)}</span>
        {count !== undefined && count > 0 && <span className="badge bg-bg text-muted">{count}</span>}
        <span className="text-muted transition group-open:rotate-180" aria-hidden>⌄</span>
      </summary>
      <div className="space-y-4 border-t border-line-soft px-5 pb-5 pt-4">
        <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted"><b className="font-semibold text-ink">{t("Tipp:")}</b> {t(tip)}</p>
        {children}
      </div>
    </details>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

function In({ label, value, onChange, hint, placeholder, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const t = useT();
  return (
    <label className="block min-w-0">
      {label && <span className="label">{t(label)}{hint && <span className="ml-1 font-normal text-muted">({t(hint)})</span>}</span>}
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder && t(placeholder)} {...rest} />
    </label>
  );
}

/** Feld aus den Stammdaten: nur lesen, bei Bedarf im Lebenslauf ein- oder ausblenden */
function Fixed({ label, value, shown, onShow }: { label: string; value: string; shown?: boolean; onShow?: (on: boolean) => void }) {
  const t = useT();
  return (
    <div className="min-w-0">
      <span className="label flex items-baseline justify-between gap-2">
        <span>{t(label)}</span>
        {onShow && value && (
          <label className="flex items-center gap-1.5 text-xs font-normal text-muted">
            <input type="checkbox" checked={shown} onChange={(e) => onShow(e.target.checked)} className="size-3.5 accent-[var(--accent)]" /> {t("zeigen")}
          </label>
        )}
      </span>
      <input className={`input cursor-not-allowed bg-surface-2 ${shown === false ? "text-muted line-through" : "text-muted"}`} value={value || t("noch nicht eingetragen")} readOnly aria-label={t(label)} />
    </div>
  );
}

function Area({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  const t = useT();
  return (
    <label className="block">
      <span className="label">{t(label)}{hint && <span className="ml-1 font-normal text-muted">({t(hint)})</span>}</span>
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
  const t = useT();
  const cls = "grid size-11 sm:size-9 place-items-center rounded-lg border border-line text-muted hover:border-accent hover:text-accent disabled:opacity-30";
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={cls} disabled={i === 0} onClick={() => onMove(-1)} aria-label={t("Nach oben")} title={t("Nach oben")}>↑</button>
      <button type="button" className={cls} disabled={i === len - 1} onClick={() => onMove(1)} aria-label={t("Nach unten")} title={t("Nach unten")}>↓</button>
      <button type="button" className={`${cls} hover:!border-danger hover:!text-danger`} onClick={onRemove} aria-label={t("Entfernen")} title={t("Entfernen")}>✕</button>
    </div>
  );
}

function ListEditor<T>({ items, onChange, add, summary, render, extra }: { items: T[]; onChange: (v: T[]) => void; add: { label: string; item: T }; summary: (t: T) => string; render: (t: T, upd: (p: Partial<T>) => void) => ReactNode; extra?: ReactNode }) {
  const t = useT();
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
        <button type="button" className="btn-ghost btn-sm tap" onClick={() => { onChange([...items, add.item]); setOpenIdx(items.length); }}>+ {t(add.label)}</button>
        {extra}
      </div>
    </div>
  );
}

/** Feld mit KI-Knopf: der Vorschlag erscheint darunter und wird erst nach Klick übernommen. */
function AiHelp({ cvId, ai, field, data, value, onApply, children }: { cvId: string; ai: boolean; field: AiField; data: CvData; value: string; onApply: (v: string) => void; children: ReactNode }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!ai) return <>{children}</>;
  const label = value.trim() ? t("Verbessern lassen") : t("Formulieren lassen");
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
        <span aria-hidden>✦</span> {busy ? t("Wird geschrieben …") : label}
      </button>
      {error && <p className="text-sm text-danger">{t(error)}</p>}
      {suggestion && (
        <div className="space-y-2 rounded-xl border border-gold/40 bg-[#fbf6ee] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t("Vorschlag")}</p>
          <p className="whitespace-pre-line text-sm">{suggestion}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm tap" onClick={() => { onApply(suggestion); setSuggestion(null); }}>{t("Übernehmen")}</button>
            <button type="button" className="btn-ghost btn-sm tap" onClick={() => setSuggestion(null)}>{t("Verwerfen")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DesignPicker({ data, photo, template, color, onTemplate, onColor, onLanguage, onClose }: { data: CvData; photo: string | null; template: TemplateKey; color: string; onTemplate: (t: TemplateKey) => void; onColor: (c: string) => void; onLanguage: (l: CvLanguageKey) => void; onClose: () => void }) {
  const tr = useT();
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2">{tr("Design und Farbe")}</h2>
        <button type="button" className="btn-ghost btn-sm tap" onClick={onClose}>{tr("Fertig")}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button key={c.hex} type="button" title={tr(c.name)} aria-label={`${tr("Farbe")} ${tr(c.name)}`} aria-pressed={color === c.hex} onClick={() => onColor(c.hex)} className={`size-8 rounded-full ring-offset-2 ring-offset-surface transition ${color === c.hex ? "ring-2 ring-ink" : "hover:scale-110"}`} style={{ background: c.hex }} />
        ))}
        <label className="ml-1 flex items-center gap-2 text-sm text-muted">
          {tr("Eigene Farbe")}
          <input type="color" value={color} onChange={(e) => onColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface" />
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{tr("Überschriften im Lebenslauf")}</span>
        <select className="input !w-auto !py-1.5" value={data.language} onChange={(e) => onLanguage(e.target.value === "tr" ? "tr" : "de")}>
          <option value="de">Deutsch</option>
          <option value="tr">Türkçe</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" onClick={() => onTemplate(t.key)} aria-pressed={template === t.key} className={`group space-y-2 rounded-xl p-2 text-left transition ${template === t.key ? "bg-tint ring-2 ring-accent" : "hover:bg-bg"}`}>
            <CvPreview html={renderCvHtml(data, { template: t.key, color, photo, fontCss: PREVIEW_FONTS })} showBreaks={false} className="pointer-events-none max-h-56 overflow-hidden" />
            <span className="block text-sm font-semibold">{tr(t.label)}</span>
            <span className="block text-xs text-muted">{tr(t.hint)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
