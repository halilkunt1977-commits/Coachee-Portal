"use client";
import { useRef, useState } from "react";
import { importDocument, importPlanFile } from "@/app/actions/businessplan";
import type { ImportResult } from "@/lib/bp/apply-import";

/** Ergebnis einer Übernahme: kurze Meldung, darunter die Einzelheiten (Kapitel, Wörter, Summen) */
function ResultBox({ res }: { res: ImportResult }) {
  if (!res.ok) return <p className="rounded-lg bg-[#f8e6e3] px-3 py-2 text-sm text-danger" role="alert">{res.error}</p>;
  return (
    <div className="space-y-1 rounded-lg bg-[#e5f2ea] px-3 py-2 text-sm text-ok" role="status">
      <p className="font-semibold">{res.message}</p>
      {res.details.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink">
          {res.details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * „Aus Word/Excel übernehmen“ im Businessplan oder Finanzplan (nur Coach). Ist dort schon etwas eingetragen,
 * wird erst nachgefragt. Nach der Übernahme lädt die Seite neu, damit der Editor den neuen Stand zeigt.
 */
export function ImportFileButton({ coacheeId, accept, filled, label }: { coacheeId: string; accept: string; filled: boolean; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);

  async function run(f: File) {
    setBusy(true);
    setRes(null);
    const fd = new FormData();
    fd.set("file", f);
    const r = await importPlanFile(coacheeId, fd).catch((): ImportResult => ({ ok: false, error: "Hochladen fehlgeschlagen. Bitte noch einmal versuchen." }));
    setBusy(false);
    setFile(null);
    if (input.current) input.current.value = "";
    setRes(r);
  }

  return (
    <div className="space-y-2">
      <label className={`btn-ghost btn-sm cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Wird übernommen …" : label}
        <input
          ref={input}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (filled) setFile(f);
            else void run(f);
          }}
        />
      </label>
      {file && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#fbf1e3] px-3 py-2 text-sm">
          <span>„{file.name}“ ersetzt die vorhandenen Eingaben. Kapitel, die in der Datei leer sind, bleiben erhalten.</span>
          <button type="button" className="btn btn-sm" onClick={() => void run(file)}>Übernehmen</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>Abbrechen</button>
        </div>
      )}
      {res && (
        <div className="space-y-2">
          <ResultBox res={res} />
          {res.ok && <button type="button" className="btn btn-sm" onClick={() => location.reload()}>Übernommenen Stand anzeigen</button>}
        </div>
      )}
    </div>
  );
}

/** Knopf an einem Dokument unter Dokumente: in Businessplan oder Finanzplan übernehmen */
export function ImportDocumentButton({ coacheeId, docId, target, filled, done }: { coacheeId: string; docId: string; target: "plan" | "finance"; filled: boolean; done: string | null }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);
  const label = target === "plan" ? "In den Businessplan übernehmen" : "In den Finanzplan übernehmen";
  async function run() {
    setBusy(true);
    setArmed(false);
    setRes(await importDocument(coacheeId, docId).catch((): ImportResult => ({ ok: false, error: "Das hat gerade nicht geklappt. Bitte noch einmal versuchen." })));
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      {done && !res && <p className="text-xs text-ok">✓ {done}</p>}
      {armed ? (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{target === "plan" ? "Der Businessplan" : "Der Finanzplan"} im Portal ist schon ausgefüllt und wird ersetzt.</span>
          <button type="button" className="btn btn-sm" onClick={() => void run()}>Ja, übernehmen</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)}>Abbrechen</button>
        </span>
      ) : (
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => (filled ? setArmed(true) : void run())}>{busy ? "Wird übernommen …" : done ? `${label} (erneut)` : label}</button>
      )}
      {res && <ResultBox res={res} />}
    </div>
  );
}
