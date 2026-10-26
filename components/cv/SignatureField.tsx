"use client";
import { useEffect, useRef, useState } from "react";
import { removeSignature, saveSignature } from "@/app/actions/unterschrift";
import { SIGNATURE_FONTS, SIGNATURE_SUBSETS, SUBSET_RANGE, signatureFontUrl } from "@/lib/signature-fonts";
import { useT } from "@/components/i18n/LangProvider";

const INK = "#17233d";

/**
 * Digitale Unterschrift: mit Finger oder Maus zeichnen, ein Foto der Unterschrift hochladen oder einen Vorschlag
 * in Handschrift aus dem Namen wählen. Alles wird im Browser zu einem PNG mit durchsichtigem Hintergrund, eng um die Schrift zugeschnitten.
 */
export function SignatureField({ coacheeId, name, value, onChange }: { coacheeId: string; name: string; value: string | null; onChange: (id: string | null) => void }) {
  const t = useT();
  const [drawing, setDrawing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("unterschrift", new File([blob], "unterschrift.png", { type: "image/png" }));
    const res = await saveSignature(coacheeId, fd).catch(() => ({ ok: false as const, error: t("Die Unterschrift konnte nicht gespeichert werden.") }));
    setBusy(false);
    if (!res.ok) return setError(t(res.error));
    onChange(res.id);
  }

  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError(t("Bitte ein Bild als JPG, PNG oder WebP."));
    try {
      const blob = await cutOutSignature(file);
      if (!blob) return setError(t("Auf dem Bild ist keine Unterschrift zu erkennen. Am besten mit dunklem Stift auf weißem Papier fotografieren."));
      await upload(blob);
    } catch {
      setError(t("Das Bild konnte nicht gelesen werden."));
    }
  }

  return (
    <div className="space-y-2">
      <span className="label !mb-0">{t("Digitale Unterschrift")}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-20 w-56 max-w-full place-items-center rounded-xl border border-line bg-white px-3">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/dateien/${value}`} alt={t("Deine Unterschrift")} className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">{t("Noch keine Unterschrift")}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDrawing(true)}>{value ? t("Neu unterschreiben") : t("Unterschreiben")}</button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? t("Speichert …") : t("Bild hochladen")}</button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setSuggesting(true)}>{t("Vorschläge")}</button>
          {value &&
            (confirm ? (
              <span className="flex items-center gap-2 text-xs">
                Entfernen?
                <button
                  type="button"
                  className="font-semibold text-danger hover:underline"
                  onClick={async () => {
                    setConfirm(false);
                    await removeSignature(coacheeId);
                    onChange(null);
                  }}
                >
                  Ja
                </button>
                <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirm(false)}>{t("Nein")}</button>
              </span>
            ) : (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(true)}>{t("Entfernen")}</button>
            ))}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
      <p className="text-xs text-muted">{t("Gilt für Lebenslauf und Anschreiben. Beim Hochladen wird der Papierhintergrund automatisch entfernt. Unter „Vorschläge“ gibt es deinen Namen in verschiedenen Handschriften zum Auswählen.")}</p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {suggesting && (
        <SuggestDialog
          name={name}
          onCancel={() => setSuggesting(false)}
          onSave={async (blob) => {
            setSuggesting(false);
            await upload(blob);
          }}
        />
      )}
      {drawing && (
        <SignatureDialog
          onCancel={() => setDrawing(false)}
          onSave={async (blob) => {
            setDrawing(false);
            await upload(blob);
          }}
        />
      )}
    </div>
  );
}

function SignatureDialog({ onCancel, onSave }: { onCancel: () => void; onSave: (png: Blob) => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    dialog.current?.showModal();
    // Zeichenfläche in Gerätepixeln, damit die Linie auch auf dem Handy scharf ist
    const c = canvas.current!;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 2.6;
  }, []);

  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    last.current = p;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    setEmpty(false);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    // Zwischenpunkte (getCoalescedEvents) machen schnelle Striche glatt
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = point(ev);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }
  }

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }

  async function save() {
    const blob = await trimToPng(canvas.current!);
    if (blob) onSave(blob);
  }

  return (
    <dialog ref={dialog} onCancel={onCancel} className="m-auto w-[min(94vw,560px)] rounded-2xl border border-line-soft bg-surface p-0 text-ink backdrop:bg-ink/40">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="h2">{t("Unterschreiben")}</h2>
          <p className="text-sm text-muted">{t("Mit dem Finger oder der Maus im Feld unterschreiben. Am Handy geht es quer etwas leichter.")}</p>
        </div>
        <div className="relative rounded-xl bg-white ring-1 ring-line">
          <canvas
            ref={canvas}
            className="block h-48 w-full touch-none cursor-crosshair sm:h-56"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={() => (last.current = null)}
            onPointerCancel={() => (last.current = null)}
            aria-label={t("Feld für die Unterschrift")}
          />
          <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-line" />
          {empty && <span className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-muted/70">{t("Hier unterschreiben")}</span>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={clear} disabled={empty}>{t("Neu anfangen")}</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onCancel}>{t("Abbrechen")}</button>
            <button type="button" className="btn" onClick={save} disabled={empty}>{t("Übernehmen")}</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** Handschriften einmal pro Seite laden (lateinisch und erweitert, damit auch ä, ß, ş, ğ, İ passen) */
let fontsReady: Promise<void> | null = null;
function loadSignatureFonts() {
  fontsReady ??= Promise.all(
    SIGNATURE_FONTS.flatMap((f) =>
      SIGNATURE_SUBSETS.map(async (subset) => {
        const face = new FontFace(f.family, `url(${signatureFontUrl(f.key, subset)}) format("woff2")`, { weight: String(f.weight), unicodeRange: SUBSET_RANGE[subset] });
        document.fonts.add(await face.load());
      }),
    ),
  ).then(() => undefined);
  fontsReady.catch(() => (fontsReady = null));
  return fontsReady;
}

const SUGGEST_W = 900;
const SUGGEST_H = 220;

/** Name in die Fläche schreiben, so groß wie möglich, aber nie breiter als die Fläche */
function drawName(c: HTMLCanvasElement, text: string, font: (typeof SIGNATURE_FONTS)[number]) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!text) return;
  let px = Math.round(96 * font.size);
  ctx.font = `${font.weight} ${px}px "${font.family}"`;
  const max = c.width - 80;
  const w = ctx.measureText(text).width;
  if (w > max) {
    px = Math.max(24, Math.floor((px * max) / w));
    ctx.font = `${font.weight} ${px}px "${font.family}"`;
  }
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
}

function SuggestDialog({ name, onCancel, onSave }: { name: string; onCancel: () => void; onSave: (png: Blob) => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [text, setText] = useState(name.trim());
  const [picked, setPicked] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    loadSignatureFonts().then(() => setReady(true), () => setFailed(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    SIGNATURE_FONTS.forEach((f, i) => {
      const c = canvases.current[i];
      if (c) drawName(c, text.trim(), f);
    });
  }, [ready, text]);

  const parts = name.trim().split(/\s+/);
  const short = parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : null;

  async function save() {
    const c = canvases.current[picked];
    if (!c || !text.trim()) return;
    const blob = await trimToPng(c);
    if (blob) onSave(blob);
  }

  return (
    <dialog ref={dialog} onCancel={onCancel} className="m-auto w-[min(94vw,640px)] rounded-2xl border border-line-soft bg-surface p-0 text-ink backdrop:bg-ink/40">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="h2">{t("Unterschrift auswählen")}</h2>
          <p className="text-sm text-muted">{t("Dein Name in verschiedenen Handschriften. Tippe die an, die dir am besten gefällt.")}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="sig-name" className="label !mb-0">{t("So soll die Unterschrift lauten")}</label>
          <input id="sig-name" className="input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
          {short && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="rounded-full bg-surface-2 px-3 py-1.5 hover:bg-line-soft" onClick={() => setText(name.trim())}>{name.trim()}</button>
              <button type="button" className="rounded-full bg-surface-2 px-3 py-1.5 hover:bg-line-soft" onClick={() => setText(short)}>{short}</button>
              <button type="button" className="rounded-full bg-surface-2 px-3 py-1.5 hover:bg-line-soft" onClick={() => setText(parts[parts.length - 1])}>{parts[parts.length - 1]}</button>
            </div>
          )}
        </div>
        {failed ? (
          <p className="text-sm text-danger" role="alert">{t("Die Schriften konnten nicht geladen werden. Bitte später noch einmal versuchen.")}</p>
        ) : (
          <div role="radiogroup" aria-label={t("Vorschläge für die Unterschrift")} className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {SIGNATURE_FONTS.map((f, i) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={picked === i}
                aria-label={`Handschrift ${i + 1}`}
                onClick={() => setPicked(i)}
                className={`relative rounded-xl bg-white p-1 ring-1 transition ${picked === i ? "ring-2 ring-accent" : "ring-line hover:ring-ink/30"}`}
              >
                <canvas ref={(el) => { canvases.current[i] = el; }} width={SUGGEST_W} height={SUGGEST_H} className="block h-auto w-full" aria-hidden />
                {!ready && <span className="absolute inset-0 grid place-items-center text-xs text-muted">{t("Einen Moment …")}</span>}
                {picked === i && <span className="absolute top-1.5 right-2 text-xs font-semibold text-accent">✓</span>}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>{t("Abbrechen")}</button>
          <button type="button" className="btn" onClick={save} disabled={!ready || !text.trim()}>{t("Übernehmen")}</button>
        </div>
      </div>
    </dialog>
  );
}

/** Auf die gezeichneten Pixel zuschneiden (mit etwas Rand) und als PNG liefern */
async function trimToPng(src: HTMLCanvasElement, pad = 12): Promise<Blob | null> {
  const ctx = src.getContext("2d")!;
  const { width: w, height: h } = src;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
}

/** Foto einer Unterschrift auf Papier: Hintergrund durchsichtig machen, Schrift behalten */
async function cutOutSignature(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * scale));
  c.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // Helligkeit des Papiers: Mittel der Randpixel. Bild mit Transparenz bleibt, wie es ist.
  let sum = 0, n = 0, hasAlpha = false;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 250) hasAlpha = true;
  if (!hasAlpha) {
    for (let x = 0; x < c.width; x += 4) for (const y of [0, c.height - 1]) { sum += lum((y * c.width + x) * 4); n++; }
    for (let y = 0; y < c.height; y += 4) for (const x of [0, c.width - 1]) { sum += lum((y * c.width + x) * 4); n++; }
    const paper = sum / n;
    let ink = 255;
    for (let i = 0; i < d.length; i += 16) ink = Math.min(ink, lum(i));
    const span = Math.max(40, paper - ink);
    for (let i = 0; i < d.length; i += 4) {
      const t = (paper - lum(i)) / span; // 0 = Papier, 1 = dunkelste Stelle
      const a = Math.min(1, Math.max(0, (t - 0.25) / 0.4));
      d[i + 3] = Math.round(a * 255);
      // Schrift etwas kräftiger, damit sie auf weißem Papier gut aussieht
      d[i] = Math.round(d[i] * 0.6);
      d[i + 1] = Math.round(d[i + 1] * 0.6);
      d[i + 2] = Math.round(d[i + 2] * 0.6);
    }
    ctx.putImageData(img, 0, 0);
  }
  return trimToPng(c, 8);
}
