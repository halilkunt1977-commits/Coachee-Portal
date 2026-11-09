"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quellen } from "@/lib/mappe";
import { openFile } from "../bp/openFile";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Mehrere Dokumente zu einer PDF: Stelle wählen (dann kommt das Anschreiben dazu), Lebenslauf, Zeugnisse und
 * eigene Dateien anhaken oder hochladen, Reihenfolge festlegen, PDF erstellen, ansehen und herunterladen.
 */

type Item = { key: string; art: "anschreiben" | "lebenslauf" | "dokument" | "datei"; id: string; title: string; sub: string; file?: File };
type Done = { fileId: string; title: string; pages: number };

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function MappeBuilder({ coacheeId, coach }: { coacheeId: string; coach: boolean }) {
  const t = useT();
  const router = useRouter();
  const href = `/api/mappe/${coacheeId}`;
  const [q, setQ] = useState<Quellen | null>(null);
  const [stelle, setStelle] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch(href)
      .then((r) => r.json())
      .then((res: Quellen & { error?: string }) => {
        if (!live) return;
        if (res.error) return setError(res.error);
        setQ(res);
        // Vorschlag: Anschreiben zur neuesten Stelle, dann der neueste Lebenslauf
        const first = res.anschreiben[0];
        const cv = res.lebenslaeufe[0];
        setStelle(first?.id ?? "");
        setItems([
          ...(first ? [{ key: `anschreiben:${first.id}`, art: "anschreiben" as const, id: first.id, title: "Anschreiben", sub: first.title }] : []),
          ...(cv ? [{ key: `lebenslauf:${cv.id}`, art: "lebenslauf" as const, id: cv.id, title: "Lebenslauf", sub: cv.title }] : []),
        ]);
      })
      .catch(() => live && setError("Keine Verbindung."));
    return () => {
      live = false;
    };
  }, [href]);

  const has = (key: string) => items.some((i) => i.key === key);
  const toggle = (it: Item) => {
    setDone(null);
    setItems((x) => (x.some((i) => i.key === it.key) ? x.filter((i) => i.key !== it.key) : [...x, it]));
  };
  const move = (i: number, d: -1 | 1) =>
    setItems((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const n = [...x];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  function chooseStelle(id: string) {
    setStelle(id);
    setDone(null);
    const a = q?.anschreiben.find((x) => x.id === id);
    setItems((x) => {
      const pos = x.findIndex((i) => i.art === "anschreiben");
      const rest = x.filter((i) => i.art !== "anschreiben");
      if (!a) return rest;
      const it: Item = { key: `anschreiben:${a.id}`, art: "anschreiben", id: a.id, title: "Anschreiben", sub: a.title };
      rest.splice(pos < 0 ? 0 : pos, 0, it);
      return rest;
    });
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setDone(null);
    const add = [...list].map((f, n) => ({ key: `datei:${Date.now()}-${n}-${f.name}`, art: "datei" as const, id: "", title: f.name, sub: "Neu hochgeladen", file: f }));
    setItems((x) => [...x, ...add]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function build() {
    setBusy(true);
    setError(null);
    setDone(null);
    const fd = new FormData();
    const files = items.filter((i) => i.file);
    fd.set("teile", JSON.stringify(items.map((i) => (i.file ? { art: "datei", index: files.indexOf(i) } : { art: i.art, id: i.id }))));
    files.forEach((i) => fd.append("datei", i.file!));
    if (stelle && items.some((i) => i.art === "anschreiben")) fd.set("stelle", stelle);
    const res = (await fetch(href, { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: t("Keine Verbindung.") }))) as Done & { error?: string };
    setBusy(false);
    if (res.error) return setError(t(res.error));
    setDone(res);
    // hochgeladene Dateien liegen jetzt bei den Dokumenten
    if (files.length) {
      const fresh = (await fetch(href).then((r) => r.json()).catch(() => null)) as Quellen | null;
      if (fresh) setQ(fresh);
      setItems((x) => x.filter((i) => !i.file));
    }
    router.refresh();
  }

  if (!q) return <p className="text-sm text-muted">{t(error ?? "Wird geladen …")}</p>;

  const fileUrl = done ? `/api/dateien/${done.fileId}` : "";

  return (
    <div className="space-y-5">
      {q.anschreiben.length > 0 && (
        <label className="block space-y-1">
          <span className="text-sm font-semibold">{t("Für welche Stelle?")}</span>
          <select className="input" value={stelle} onChange={(e) => chooseStelle(e.target.value)}>
            <option value="">{t("Ohne Anschreiben")}</option>
            {q.anschreiben.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <span className="block text-xs text-muted">{t("Das Anschreiben zu dieser Stelle kommt automatisch in die Mappe.")}</span>
        </label>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {q.lebenslaeufe.length > 0 && (
          <fieldset className="min-w-0 space-y-1.5">
            <legend className="mb-1 text-sm font-semibold">{t("Lebenslauf")}</legend>
            {q.lebenslaeufe.map((c) => {
              const it: Item = { key: `lebenslauf:${c.id}`, art: "lebenslauf", id: c.id, title: "Lebenslauf", sub: c.title };
              return (
                <label key={c.id} className="tap flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2 text-sm">
                  <input type="checkbox" className="size-4" checked={has(it.key)} onChange={() => toggle(it)} />
                  <span className="min-w-0 truncate">{c.title}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="mb-1 text-sm font-semibold">{coach ? t("Dokumente") : t("Meine Dokumente")}</legend>
          {!q.dokumente.length && <p className="text-sm text-muted">{t("Noch keine Dokumente im Portal. Lade unten Zeugnisse oder Nachweise hoch.")}</p>}
          {q.dokumente.map((d) => {
            const it: Item = { key: `dokument:${d.id}`, art: "dokument", id: d.id, title: d.title, sub: d.name };
            return (
              <label key={d.id} className={`tap flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2 text-sm ${d.geeignet ? "" : "opacity-60"}`}>
                <input type="checkbox" className="size-4" disabled={!d.geeignet} checked={has(it.key)} onChange={() => toggle(it)} />
                <span className="min-w-0">
                  <span className="block truncate">{d.title}</span>
                  {!d.geeignet && <span className="block text-xs text-muted">{t("Nur PDF und Fotos lassen sich einfügen.")}</span>}
                </span>
              </label>
            );
          })}
          <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => fileInput.current?.click()}>+ {t("Datei hochladen (PDF oder Foto)")}</button>
          <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </fieldset>
      </div>

      <section className="space-y-2 rounded-xl bg-bg p-3">
        <p className="text-sm font-semibold">{t("Reihenfolge in der PDF")}</p>
        {!items.length ? (
          <p className="text-sm text-muted">{t("Noch nichts ausgewählt.")}</p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((i, n) => (
              <li key={i.key} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm shadow-sm">
                <span className="w-5 shrink-0 text-muted">{n + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.art === "anschreiben" || i.art === "lebenslauf" ? t(i.title) : i.title}</span>
                  <span className="block truncate text-xs text-muted">{i.file ? t(i.sub) : i.sub}</span>
                </span>
                <button type="button" className="tap grid size-8 place-items-center rounded-lg text-muted hover:text-accent disabled:opacity-30" disabled={n === 0} aria-label={t("Nach oben")} onClick={() => move(n, -1)}>↑</button>
                <button type="button" className="tap grid size-8 place-items-center rounded-lg text-muted hover:text-accent disabled:opacity-30" disabled={n === items.length - 1} aria-label={t("Nach unten")} onClick={() => move(n, 1)}>↓</button>
                <button type="button" className="tap grid size-8 place-items-center rounded-lg text-muted hover:text-danger" aria-label={t("Entfernen")} onClick={() => setItems((x) => x.filter((y) => y.key !== i.key))}>✕</button>
              </li>
            ))}
          </ol>
        )}
        {items.some((i) => i.file) && <p className="text-xs text-muted">{t("Hochgeladene Dateien werden auch bei den Dokumenten gespeichert.")}</p>}
      </section>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={busy || !items.length} onClick={() => void build()}>{busy ? t("PDF wird erstellt …") : t("Zu einer PDF zusammenführen")}</button>
      </div>
      {done && (
        <div className="space-y-2 rounded-xl border border-ok/40 bg-ok-soft p-3 text-sm" role="status">
          <p className="font-semibold text-ok">✓ {t("Fertig: {title} ({n} Seiten)", { title: done.title, n: done.pages })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => void openFile(fileUrl, undefined, true)}>{t("Ansehen")}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => void openFile(`${fileUrl}?download=1`)}>{t("Herunterladen")}</button>
          </div>
          <p className="text-xs text-muted">{t("Die PDF liegt jetzt auch bei den Dokumenten.")}</p>
        </div>
      )}
    </div>
  );
}
