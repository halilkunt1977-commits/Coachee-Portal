"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Datei im Portal ansehen. Oben immer „Zurück“ und „Teilen oder sichern“ (öffnet auf dem Handy das Teilen-Menü:
 * in Excel, Word oder Dateien sichern). PDFs werden Seite für Seite angezeigt, andere Dateien nur zum Teilen oder Laden.
 */
export function FileViewer({ src, name }: { src: string | null; name: string }) {
  const t = useT();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"laedt" | "pdf" | "datei" | "fehler">("laedt");
  const [pages, setPages] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    let stop = false;
    void (async () => {
      try {
        const res = await fetch(src.includes("?") ? src : `${src}?ansehen`, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") ?? "";
        const fromHeader = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "");
        const f = new File([blob], name || fromHeader || "Datei", { type: blob.type });
        if (stop) return;
        setFile(f);
        if (!/pdf/.test(blob.type)) return setState("datei");
        setState("pdf");
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
        setPages(pdf.numPages);
        const width = Math.min(box.current?.clientWidth ?? 800, 900);
        for (let i = 1; i <= pdf.numPages && !stop; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const ratio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.className = "block rounded-md bg-white shadow-sm";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
          box.current?.appendChild(canvas);
        }
      } catch (e) {
        console.error("Datei ansehen", e);
        if (!stop) setState("fehler");
      }
    })();
    return () => {
      stop = true;
    };
  }, [src, name]);

  function back() {
    if (window.history.length > 1) window.history.back();
    else router.push("/");
  }

  async function share() {
    if (!file) return;
    const data = { files: [file], title: file.name };
    if (navigator.canShare?.(data)) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line-soft bg-accent px-3 pb-2.5 text-white" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <button type="button" onClick={back} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25">← {t("Zurück")}</button>
        <span className="min-w-0 flex-1 truncate text-sm">{file?.name ?? name}</span>
        <button type="button" onClick={() => void share()} disabled={!file} className="rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("Teilen oder sichern")}</button>
      </header>
      <main className="mx-auto max-w-[900px] px-3 py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {!src && <p className="card text-sm">{t("Diese Datei gibt es nicht.")}</p>}
        {src && state === "laedt" && <p className="card text-sm text-muted" role="status">{t("Datei wird geladen …")}</p>}
        {state === "fehler" && <p className="card text-sm text-danger" role="alert">{t("Die Datei konnte nicht geladen werden. Bitte noch einmal versuchen.")}</p>}
        {state === "datei" && (
          <div className="card space-y-3 text-sm">
            <p className="font-semibold">{file?.name}</p>
            <p className="text-muted">{t("Diese Datei kann hier nicht angezeigt werden. Mit „Teilen oder sichern“ öffnest du sie in Excel oder Word oder sicherst sie in deinen Dateien.")}</p>
            <button type="button" className="btn" onClick={() => void share()}>{t("Teilen oder sichern")}</button>
          </div>
        )}
        {state === "pdf" && pages === 0 && <p className="card text-sm text-muted" role="status">{t("Datei wird geladen …")}</p>}
        <div ref={box} className="space-y-3" />
      </main>
    </div>
  );
}
