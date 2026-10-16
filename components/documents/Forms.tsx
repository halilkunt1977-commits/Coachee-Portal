"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { importReportRows, updateDocument, uploadDocument } from "@/app/actions/dokumente";
import { DOC_CATEGORIES, DOC_TYPES, MAX_DOC_BYTES, extOf, guessCategory } from "@/lib/documents";
import { ActionForm } from "../akte/ActionForm";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";

type Result = { name: string; ok?: string; error?: string };

/** Mehrere Dateien auf einmal: Art je Datei am Namen erraten oder für alle festlegen, dann nacheinander hochladen. */
export function UploadForm({ coacheeId }: { coacheeId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [drag, setDrag] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    setResults([]);
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  };

  async function upload() {
    const out: Result[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setBusy(i);
      if (!DOC_TYPES[extOf(f.name)]) { out.push({ name: f.name, error: `${f.name}: Dieses Dateiformat geht nicht. Erlaubt sind PDF, Word, Excel, Bilder und Text.` }); setResults([...out]); continue; }
      if (f.size > MAX_DOC_BYTES) { out.push({ name: f.name, error: `${f.name}: Die Datei ist größer als 25 MB.` }); setResults([...out]); continue; }
      const fd = new FormData();
      fd.set("file", f);
      fd.set("category", category);
      try {
        const r = await uploadDocument(coacheeId, fd);
        out.push({ name: f.name, ...r });
      } catch {
        out.push({ name: f.name, error: `${f.name}: Hochladen fehlgeschlagen. Bitte noch einmal versuchen.` });
      }
      setResults([...out]);
    }
    setBusy(null);
    setFiles([]);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const label = (k: string) => DOC_CATEGORIES.find((c) => c.key === k)?.label;
  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm ${drag ? "border-accent bg-accent/5" : "border-line hover:border-accent"}`}
      >
        <span className="font-medium">Dateien hierher ziehen oder klicken</span>
        <span className="text-xs text-muted">PDF, Word, Excel, Bilder · bis 25 MB je Datei · mehrere auf einmal</span>
        <input ref={input} type="file" multiple className="sr-only" accept={Object.keys(DOC_TYPES).map((e) => `.${e}`).join(",")} onChange={(e) => add(e.target.files)} />
      </label>
      {files.length > 0 && (
        <>
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}${f.size}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{busy === i ? "⏳ " : ""}{f.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {label(category || guessCategory(f.name))}
                  {busy === null && <button type="button" className="hover:text-danger" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Entfernen">✕</button>}
                </span>
              </li>
            ))}
          </ul>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input text-sm" aria-label="Art">
            <option value="">Art automatisch am Dateinamen erkennen</option>
            {DOC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>Alle als {c.label}</option>)}
          </select>
          <button type="button" className="btn w-full" disabled={busy !== null} onClick={upload}>
            {busy !== null ? `Lädt hoch … ${busy + 1} von ${files.length}` : `${files.length} Datei${files.length > 1 ? "en" : ""} hochladen`}
          </button>
        </>
      )}
      {results.map((r) => <Notice key={r.name} tone={r.error ? "error" : "ok"}>{r.error ?? r.ok}</Notice>)}
    </div>
  );
}

export function EditDocument({ coacheeId, doc }: { coacheeId: string; doc: { id: string; title: string; category: string; shared: boolean } }) {
  return (
    <ActionForm action={updateDocument.bind(null, coacheeId, doc.id)} className="grid gap-3 sm:grid-cols-[1fr_200px]">
      <input name="title" defaultValue={doc.title} className="input text-sm" aria-label="Titel" />
      <select name="category" defaultValue={doc.category} className="input text-sm" aria-label="Art">
        {DOC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shared" defaultChecked={doc.shared} /> Für den Coachee sichtbar
      </label>
      <SubmitButton className="btn btn-sm">Speichern</SubmitButton>
    </ActionForm>
  );
}

export function ImportRows({ coacheeId, docId, rows }: { coacheeId: string; docId: string; rows: { index: number; label: string }[] }) {
  return (
    <ActionForm action={importReportRows.bind(null, coacheeId, docId)} className="space-y-2">
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.index}>
            <label className="flex items-center gap-2"><input type="checkbox" name="row" value={r.index} defaultChecked /> {r.label}</label>
          </li>
        ))}
      </ul>
      <SubmitButton className="btn btn-sm">Ausgewählte in die Anwesenheit übernehmen</SubmitButton>
    </ActionForm>
  );
}
