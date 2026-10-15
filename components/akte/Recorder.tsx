"use client";
import { useEffect, useRef, useState } from "react";

/** Aufnahme im Browser, Umwandlung in Text auf dem Server. Die Aufnahme selbst wird nirgends gespeichert. */
export function Recorder({ coacheeId, onText }: { coacheeId: string; onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = upload;
      r.start(1000);
      rec.current = r;
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setError("Kein Zugriff aufs Mikrofon. Bitte im Browser erlauben.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stop();
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    setState("working");
  }

  async function upload() {
    const mime = rec.current?.mimeType || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("audio", new File(chunks.current, `aufnahme.${ext}`, { type: mime }));
    fd.append("coacheeId", coacheeId);
    chunks.current = [];
    try {
      const res = await fetch("/api/transkription", { method: "POST", body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || "Die Umwandlung hat nicht geklappt.");
      onText(data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setState("idle");
    }
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {state === "idle" && (
        <button type="button" onClick={start} className="btn-ghost btn-sm">
          <span className="size-2.5 rounded-full bg-danger" /> Einsprechen oder Gespräch aufnehmen
        </button>
      )}
      {state === "recording" && (
        <button type="button" onClick={stop} className="btn btn-sm bg-danger hover:bg-danger">
          <span className="size-2.5 animate-pulse rounded-sm bg-white" /> Stopp · {mm}
        </button>
      )}
      {state === "working" && <span className="text-muted">Wird in Text umgewandelt …</span>}
      {state !== "working" && <span className="text-xs text-muted">Gespräche nur mit Einverständnis aufnehmen. Die Aufnahme wird nicht gespeichert.</span>}
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </div>
  );
}
