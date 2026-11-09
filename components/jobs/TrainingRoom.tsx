"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finishTraining } from "@/app/actions/training";
import { useT } from "@/components/i18n/LangProvider";
import { MAX_ANSWER_SECONDS, type TrainingLang } from "@/lib/jobs/training-shared";
import { createFaceMeter, type FaceMeter } from "./face";

/*
 * Probegespräch vor der Kamera: Frage lesen (auf Wunsch vorgelesen), laut antworten, weiter. Hochgeladen wird je
 * Antwort nur der Ton (wird in Text umgewandelt und nicht gespeichert) und die Messwerte zur Mimik.
 */
type Phase = "intro" | "ready" | "recording" | "sending" | "finishing" | "error";

export function TrainingRoom({ trainingId, questions, lang, startAt }: { trainingId: string; questions: string[]; lang: TrainingLang; startAt: number }) {
  const t = useT();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<FaceMeter | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(Math.min(startAt, questions.length - 1));
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [faceOk, setFaceOk] = useState<boolean | null>(null);
  const [speak, setSpeak] = useState(true);

  useEffect(
    () => () => {
      meter.current?.stop();
      stream.current?.getTracks().forEach((x) => x.stop());
      window.speechSynthesis?.cancel();
    },
    [],
  );

  // Laufende Antwort: Sekunden zählen, nach der Höchstdauer von selbst beenden
  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_ANSWER_SECONDS) stopAnswer();
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  function read(q: string) {
    if (!speak || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(q);
    u.lang = lang === "tr" ? "tr-TR" : "de-DE";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  async function openCamera() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setPhase("ready");
      read(questions[index]);
      meter.current = await createFaceMeter(video.current!);
      setFaceOk(Boolean(meter.current));
    } catch {
      setError(t("Kein Zugriff auf Kamera oder Mikrofon. Bitte im Browser erlauben und die Seite neu laden."));
      setPhase("error");
    }
  }

  function startAnswer() {
    if (!stream.current) return;
    window.speechSynthesis?.cancel();
    const audio = new MediaStream(stream.current.getAudioTracks());
    const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((x) => MediaRecorder.isTypeSupported(x)) ?? "";
    const r = new MediaRecorder(audio, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => void upload();
    r.start(1000);
    rec.current = r;
    meter.current?.reset();
    started.current = Date.now();
    setSeconds(0);
    setPhase("recording");
  }

  function stopAnswer() {
    if (rec.current?.state === "recording") {
      setPhase("sending");
      rec.current.stop();
    }
  }

  async function upload() {
    const secs = Math.round((Date.now() - started.current) / 1000);
    const mime = rec.current?.mimeType || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("index", String(index));
    fd.append("seconds", String(secs));
    fd.append("metrics", JSON.stringify(meter.current?.read() ?? null));
    fd.append("audio", new File(chunks.current, `antwort.${ext}`, { type: mime }));
    chunks.current = [];
    try {
      const res = await fetch(`/api/training/${trainingId}`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Die Antwort ließ sich nicht verarbeiten. Bitte noch einmal versuchen.");
    } catch (e) {
      setError(t((e as Error).message));
      setPhase("ready");
      return;
    }
    setError(null);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPhase("ready");
      read(questions[index + 1]);
    } else {
      await finish();
    }
  }

  async function finish() {
    setPhase("finishing");
    meter.current?.stop();
    stream.current?.getTracks().forEach((x) => x.stop());
    const res = await finishTraining(trainingId).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." }));
    if (!res.ok) {
      setError(t(res.error));
      setPhase("error");
      return;
    }
    router.refresh();
  }

  const q = questions[index];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden rounded-2xl bg-ink/90" style={{ aspectRatio: "4 / 3" }}>
        <video ref={video} muted playsInline className="size-full -scale-x-100 object-cover" />
        {phase === "intro" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div className="max-w-sm space-y-3">
              <p className="text-lg font-semibold">{t("Kamera und Mikrofon")}</p>
              <p className="text-sm text-white/80">{t("Dein Bild bleibt auf deinem Gerät und wird nicht übertragen oder gespeichert. Deine Antworten werden in Text umgewandelt, die Aufnahme selbst wird nicht gespeichert.")}</p>
              <button type="button" className="btn" onClick={() => void openCamera()}>{t("Kamera einschalten")}</button>
            </div>
          </div>
        )}
        {phase === "recording" && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        )}
        {faceOk === false && phase !== "intro" && <span className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">{t("Die Mimik kann auf diesem Gerät nicht gemessen werden. Die Antworten werden trotzdem ausgewertet.")}</span>}
      </div>

      <section className="card flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{t("Frage {n} von {m}", { n: index + 1, m: questions.length })}</span>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> {t("Frage vorlesen")}
          </label>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / questions.length) * 100}%` }} /></div>
        <p lang={lang} className="font-[family-name:var(--font-display)] text-xl font-semibold leading-snug">{q}</p>
        {phase === "ready" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={startAnswer}>● {t("Antwort starten")}</button>
            <button type="button" className="btn-ghost" onClick={() => read(q)}>{t("Noch einmal vorlesen")}</button>
          </div>
        )}
        {phase === "recording" && (
          <div className="space-y-2">
            <button type="button" className="btn" onClick={stopAnswer}>■ {index + 1 < questions.length ? t("Fertig, nächste Frage") : t("Fertig, Gespräch beenden")}</button>
            <p className="text-xs text-muted">{t("Sprich in Ruhe, schau in die Kamera. Gut sind 30 bis 90 Sekunden, höchstens {n} Minuten.", { n: Math.round(MAX_ANSWER_SECONDS / 60 * 10) / 10 })}</p>
          </div>
        )}
        {phase === "sending" && <p className="text-sm text-muted">{t("Antwort wird gespeichert …")}</p>}
        {phase === "finishing" && <p className="text-sm text-muted">{t("Dein Gespräch wird ausgewertet. Das dauert etwa eine Minute …")}</p>}
        {phase === "intro" && <p className="text-sm text-muted">{t("Du bekommst {m} Fragen wie im echten Gespräch. Lies jede Frage, starte die Antwort und antworte laut. Am Ende bekommst du eine Auswertung mit Tipps.", { m: questions.length })}</p>}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-danger" role="alert">{error}</p>
            {phase === "error" && stream.current === null && <button type="button" className="btn-ghost btn-sm" onClick={() => void openCamera()}>{t("Erneut versuchen")}</button>}
            {phase === "error" && stream.current !== null && <button type="button" className="btn-ghost btn-sm" onClick={() => void finish()}>{t("Auswertung erneut versuchen")}</button>}
          </div>
        )}
      </section>
    </div>
  );
}
