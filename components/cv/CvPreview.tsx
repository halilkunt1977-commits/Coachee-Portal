"use client";
import { useEffect, useRef, useState } from "react";

const PAGE_W = 794; // 210 mm in CSS-Pixeln
const PAGE_H = 1123; // 297 mm

/**
 * Zeigt das Lebenslauf-HTML als verkleinerte A4-Seite. Das iframe darf kein JavaScript ausführen;
 * der Inhalt wird direkt hineingeschrieben, damit beim Tippen nichts flackert.
 */
export function CvPreview({ html, width, showBreaks = true, className = "" }: { html: string; width?: number; showBreaks?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [boxW, setBoxW] = useState(width ?? 0);
  const [height, setHeight] = useState(PAGE_H);

  useEffect(() => {
    if (width || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const measure = () => setHeight(Math.max(PAGE_H, doc.documentElement.scrollHeight));
    measure();
    const t = window.setTimeout(measure, 150);
    doc.fonts?.ready.then(measure).catch(() => {});
    const imgs = Array.from(doc.images);
    imgs.forEach((i) => i.addEventListener("load", measure));
    return () => {
      window.clearTimeout(t);
      imgs.forEach((i) => i.removeEventListener("load", measure));
    };
  }, [html]);

  const scale = boxW ? boxW / PAGE_W : 0.5;
  const pages = Math.max(1, Math.ceil((height - 4) / PAGE_H));
  return (
    <div ref={box} className={className} style={width ? { width } : undefined}>
      <div className="relative overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(22,24,29,.12),0_8px_24px_rgba(22,24,29,.08)]" style={{ height: pages * PAGE_H * scale }}>
        <iframe
          ref={frame}
          title="Vorschau des Lebenslaufs"
          sandbox="allow-same-origin"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: PAGE_W, height: pages * PAGE_H, transform: `scale(${scale})` }}
        />
        {showBreaks &&
          Array.from({ length: pages - 1 }, (_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-dashed border-gold/70" style={{ top: (i + 1) * PAGE_H * scale }}>
              <span className="absolute right-2 top-1 rounded bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-white">Seite {i + 2}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
