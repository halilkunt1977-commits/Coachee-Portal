"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SimliClient } from "simli-client";
import { finishTraining } from "@/app/actions/training";
import { useT } from "@/components/i18n/LangProvider";
import { goodbyeText, INTERVIEWER, MAX_ANSWER_SECONDS, welcomeText, type TrainingLang, type TrainingVoice } from "@/lib/jobs/training-shared";
import { createFaceMeter, type FaceMeter } from "./face";
import { Interviewer } from "./Interviewer";

/*
 * Probegespräch vor der Kamera: Das Gegenüber von Gründarium begrüßt und liest jede Frage vor, man antwortet laut. Hochgeladen wird je
 * Antwort nur der Ton (wird in Text umgewandelt und nicht gespeichert) und die Messwerte zur Mimik.
 */
type Phase = "intro" | "ready" | "recording" | "sending" | "finishing" | "error";

export function TrainingRoom({ trainingId, questions, lang, voice, startAt }: { trainingId: string; questions: string[]; lang: TrainingLang; voice: TrainingVoice; startAt: number }) {
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
      stopVoice();
      void simli.current?.stop().catch(() => undefined);
      void audio.current?.ctx.close().catch(() => undefined);
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

  /*
   * Stimme: Die MP3 vom Server läuft über Web Audio. Der Audio-Kontext wird im Klick auf „Gespräch beginnen“
   * freigeschaltet, sonst blockieren Browser (vor allem iPhone) den Ton, wenn er erst nach dem Laden startet.
   * Die Lautstärke hängt an einem Gain-Knoten (das iPhone ignoriert die Lautstärke von <audio>), der Analyser liefert
   * den Pegel für den Mund des Gegenübers. Ohne Server-Stimme liest der Browser vor.
   */
  const audio = useRef<{ ctx: AudioContext; gain: GainNode; analyser: AnalyserNode } | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const playId = useRef(0);
  const raf = useRef(0);
  const cache = useRef(new Map<number, Promise<ArrayBuffer | null>>());
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const [volume, setVolumeState] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const loud = useRef({ volume: 0.9, muted: false });
  // gemerkte Lautstärke erst im Browser lesen (sonst passt die erste Anzeige nicht zur Server-Fassung)
  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem("training-volume"));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(v) && v > 0 && v <= 1) setVolumeState(v);
    } catch {}
  }, []);
  useEffect(() => {
    loud.current = { volume, muted };
    if (audio.current) audio.current.gain.gain.value = muted ? 0 : volume;
    if (muted) window.speechSynthesis?.cancel();
  }, [volume, muted]);
  const setVolume = (v: number) => {
    setVolumeState(v);
    setMuted(v === 0);
    try {
      window.localStorage.setItem("training-volume", String(v || 0.9));
    } catch {}
  };

  /*
   * Echt wirkendes Gegenüber über Simli (nur wenn auf dem Server ein Schlüssel gesetzt ist). Die Stimme wird als
   * 16-kHz-PCM an Simli geschickt, zurück kommt Video mit passenden Lippen und derselbe Ton. Der Ton läuft über
   * unseren Audio-Kontext (Lautstärke, iPhone), das Audio-Element selbst bleibt stumm. Klappt etwas nicht, bleibt
   * die gezeichnete Person.
   */
  const simli = useRef<SimliClient | null>(null);
  const simliVideo = useRef<HTMLVideoElement>(null);
  const simliAudio = useRef<HTMLAudioElement>(null);
  const simliRouted = useRef<MediaStream | null>(null);
  const simliTimer = useRef(0);
  const [avatar, setAvatar] = useState<"off" | "connecting" | "on">("off");
  const avatarOn = useRef(false);
  const simliModule = useRef<Promise<typeof import("simli-client") | null> | null>(null);
  useEffect(() => {
    simliModule.current = import("simli-client").catch(() => null);
  }, []);

  function avatarOff() {
    avatarOn.current = false;
    setAvatar("off");
    const c = simli.current;
    simli.current = null;
    void c?.stop().catch(() => undefined);
  }

  /** Simli-Sitzung aufbauen; false = keine (kein Schlüssel, Fehler oder zu langsam) */
  async function connectAvatar(): Promise<boolean> {
    try {
      const res = await fetch(`/api/training/${trainingId}/avatar`, { method: "POST" });
      if (!res.ok) return false;
      const { token } = (await res.json()) as { token: string };
      const mod = await simliModule.current;
      if (!mod || !simliVideo.current || !simliAudio.current) return false;
      setAvatar("connecting");
      simliAudio.current.muted = true;
      const c = new mod.SimliClient(token, simliVideo.current, simliAudio.current, null, mod.LogLevel.ERROR, "livekit");
      simli.current = c;
      c.on("stop", avatarOff);
      c.on("error", avatarOff);
      await Promise.race([c.start(), new Promise((_, no) => window.setTimeout(() => no(new Error("timeout")), 15000))]);
      if (simli.current !== c) return false;
      avatarOn.current = true;
      setAvatar("on");
      return true;
    } catch {
      avatarOff();
      return false;
    }
  }

  /** Ton von Simli einmalig über den Audio-Kontext leiten */
  function routeAvatarAudio() {
    const el = simliAudio.current;
    const a = audio.current;
    const src = el?.srcObject;
    if (!el || !a || !(src instanceof MediaStream) || simliRouted.current === src || !src.getAudioTracks().length) return;
    el.muted = true;
    void el.play().catch(() => undefined);
    a.ctx.createMediaStreamSource(src).connect(a.gain);
    simliRouted.current = src;
  }

  /** MP3 in 16-kHz-Mono-PCM16 umwandeln, wie Simli es braucht */
  async function toPcm16(data: ArrayBuffer) {
    const a = audio.current!;
    const buf = await a.ctx.decodeAudioData(data.slice(0));
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
    const s = off.createBufferSource();
    s.buffer = buf;
    s.connect(off.destination);
    s.start();
    const f = (await off.startRendering()).getChannelData(0);
    const pcm = new Int16Array(f.length);
    for (let k = 0; k < f.length; k++) pcm[k] = Math.max(-1, Math.min(1, f[k])) * 0x7fff;
    return { bytes: new Uint8Array(pcm.buffer), seconds: buf.duration };
  }

  /** Text über das Gegenüber sprechen lassen; true = gesprochen */
  async function avatarSay(data: ArrayBuffer, id: number): Promise<boolean> {
    const c = simli.current;
    if (!c || !audio.current) return false;
    try {
      if (audio.current.ctx.state !== "running") await audio.current.ctx.resume();
      routeAvatarAudio();
      const { bytes, seconds } = await toPcm16(data);
      if (id !== playId.current || simli.current !== c) return true;
      setNoVoice(false);
      setSpeaking(true);
      // gut eine Sekunde vorweg, danach etwas schneller als Echtzeit nachschieben
      const CHUNK = 6000;
      let pos = 0;
      const send = () => {
        if (id !== playId.current || simli.current !== c) return false;
        c.sendAudioData(bytes.slice(pos, pos + CHUNK));
        pos += CHUNK;
        return pos < bytes.length;
      };
      for (let k = 0; k < 6 && send(); k++);
      await new Promise<void>((done) => {
        const t0 = Date.now();
        simliTimer.current = window.setInterval(() => {
          if (pos < bytes.length && !send()) {
            /* alles geschickt */
          }
          if (id !== playId.current || simli.current !== c || Date.now() - t0 > seconds * 1000 + 900) {
            window.clearInterval(simliTimer.current);
            done();
          }
        }, 150);
      });
      if (id === playId.current) setSpeaking(false);
      return true;
    } catch {
      return false;
    }
  }

  /** MP3 holen (einmal je Text), null = keine Stimme vom Server */
  function fetchVoice(i: number) {
    let p = cache.current.get(i);
    if (!p) {
      p = fetch(`/api/training/${trainingId}/stimme?i=${i}`)
        .then((r) => (r.status === 200 ? r.arrayBuffer() : null))
        .catch(() => null);
      cache.current.set(i, p);
    }
    return p;
  }
  // Begrüßung und erste Frage schon beim Öffnen der Seite laden
  useEffect(() => {
    if (startAt === 0) void fetchVoice(-1);
    void fetchVoice(Math.min(startAt, questions.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Muss direkt im Klick laufen: Audio-Kontext anlegen/fortsetzen, Browser-Stimme vorwärmen */
  function unlockAudio() {
    try {
      if (!audio.current) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        gain.connect(analyser);
        analyser.connect(ctx.destination);
        gain.gain.value = loud.current.muted ? 0 : loud.current.volume;
        audio.current = { ctx, gain, analyser };
      }
      const { ctx } = audio.current;
      void ctx.resume();
      // ein winziger stiller Ton schaltet den Kontext auf dem iPhone endgültig frei
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(ctx.destination);
      b.start(0);
    } catch {}
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
      }
    } catch {}
  }

  function stopVoice() {
    playId.current++;
    window.clearInterval(simliTimer.current);
    try {
      simli.current?.ClearBuffer();
    } catch {}
    try {
      source.current?.stop();
    } catch {}
    source.current = null;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(raf.current);
    setSpeaking(false);
    setLevel(0);
  }

  function textFor(i: number) {
    return i === -1 ? welcomeText(lang, voice) : i === -2 ? goodbyeText(lang) : questions[i];
  }

  /** Text i vorlesen (-1 Begrüßung, -2 Abschied); fertig, wenn zu Ende gesprochen oder abgebrochen */
  async function say(i: number): Promise<void> {
    stopVoice();
    if (!speak || loud.current.muted) return;
    const id = playId.current;
    const data = await fetchVoice(i);
    if (i >= 0 && i + 1 < questions.length) void fetchVoice(i + 1);
    if (id !== playId.current) return;
    if (data && avatarOn.current && (await avatarSay(data, id))) return;
    const a = audio.current;
    if (data && a) {
      try {
        if (a.ctx.state !== "running") await a.ctx.resume();
        const buf = await a.ctx.decodeAudioData(data.slice(0));
        if (id !== playId.current) return;
        if (a.ctx.state === "running") {
          setNoVoice(false);
          await new Promise<void>((done) => {
            const src = a.ctx.createBufferSource();
            src.buffer = buf;
            src.connect(a.gain);
            src.onended = () => done();
            source.current = src;
            src.start();
            setSpeaking(true);
            const bins = new Uint8Array(a.analyser.fftSize);
            const tick = () => {
              a.analyser.getByteTimeDomainData(bins);
              let sum = 0;
              for (const v of bins) sum += ((v - 128) / 128) ** 2;
              setLevel(Math.min(1, Math.sqrt(sum / bins.length) * 4.5));
              raf.current = requestAnimationFrame(tick);
            };
            tick();
          });
          if (id === playId.current) {
            cancelAnimationFrame(raf.current);
            setSpeaking(false);
            setLevel(0);
          }
          return;
        }
      } catch {}
    }
    await browserSay(textFor(i), id);
  }

  /** Stimme des Browsers; der Mund bewegt sich dann gleichmäßig mit */
  function browserSay(text: string, id: number) {
    const synth = window.speechSynthesis;
    if (!synth || !text) {
      setNoVoice(true);
      return Promise.resolve();
    }
    return new Promise<void>((done) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "tr" ? "tr-TR" : "de-DE";
      const v = synth.getVoices().filter((x) => x.lang.toLowerCase().startsWith(lang));
      const pick = v.find((x) => /natural|online|premium|enhanced|neural/i.test(x.name)) ?? v[0];
      if (pick) u.voice = pick;
      u.rate = 1.08;
      u.volume = loud.current.volume;
      let began = false;
      const end = () => {
        cancelAnimationFrame(raf.current);
        if (id === playId.current) {
          setSpeaking(false);
          setLevel(0);
        }
        done();
      };
      u.onstart = () => {
        began = true;
        setNoVoice(false);
        setSpeaking(true);
        const t0 = performance.now();
        const tick = () => {
          const x = (performance.now() - t0) / 1000;
          setLevel(0.25 + 0.35 * Math.abs(Math.sin(x * 9)) * (0.6 + 0.4 * Math.sin(x * 2.3)));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      };
      u.onend = end;
      u.onerror = end;
      synth.speak(u);
      // spricht der Browser nach 3 Sekunden noch nicht, Hinweis zeigen
      window.setTimeout(() => {
        if (!began && id === playId.current && !synth.speaking) {
          setNoVoice(true);
          done();
        }
      }, 3000);
    });
  }

  async function openCamera() {
    setError(null);
    unlockAudio();
    const avatarReady = connectAvatar();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setPhase("ready");
      void createFaceMeter(video.current!).then((m) => {
        meter.current = m;
        setFaceOk(Boolean(m));
      });
      await avatarReady;
      if (index === 0) await say(-1);
      // schon mit der Antwort angefangen? Dann die Frage nicht mehr hineinsprechen
      if (rec.current?.state !== "recording") void say(index);
    } catch {
      setError(t("Kein Zugriff auf Kamera oder Mikrofon. Bitte im Browser erlauben und die Seite neu laden."));
      setPhase("error");
    }
  }

  function startAnswer() {
    if (!stream.current) return;
    stopVoice();
    const mic = new MediaStream(stream.current.getAudioTracks());
    const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((x) => MediaRecorder.isTypeSupported(x)) ?? "";
    const r = new MediaRecorder(mic, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
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
      void say(index + 1);
    } else {
      await finish();
    }
  }

  async function finish() {
    setPhase("finishing");
    meter.current?.stop();
    stream.current?.getTracks().forEach((x) => x.stop());
    const [res] = await Promise.all([
      finishTraining(trainingId).catch(() => ({ ok: false as const, error: "Gerade keine Verbindung. Bitte noch einmal versuchen." })),
      say(-2),
    ]);
    avatarOff();
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
      <div className="relative overflow-hidden rounded-2xl bg-line-soft" style={{ aspectRatio: "4 / 3" }}>
        <Interviewer voice={voice} level={level} speaking={speaking} />
        {/* echt wirkendes Gegenüber (Simli) liegt über der Zeichnung, sobald es verbunden ist */}
        <video ref={simliVideo} muted playsInline autoPlay className={`absolute inset-0 size-full bg-line-soft object-cover transition-opacity duration-500 ${avatar === "on" ? "opacity-100" : "pointer-events-none opacity-0"}`} />
        <audio ref={simliAudio} muted autoPlay className="hidden" />
        {avatar === "connecting" && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{t("Verbindung wird aufgebaut …")}</span>}
        <span className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1 text-xs text-white">
          <b>{INTERVIEWER[voice][lang]}</b> · Gründarium{speaking && <span className="ml-1.5 inline-block size-2 animate-pulse rounded-full bg-emerald-400 align-middle" />}
        </span>
        {/* eigenes Bild klein in der Ecke; bleibt immer im DOM, weil die Mimik daraus gemessen wird */}
        <div className={`absolute right-3 bottom-3 w-[30%] min-w-24 overflow-hidden rounded-xl border-2 border-white/80 bg-ink shadow-lg ${phase === "intro" ? "opacity-0" : ""}`} style={{ aspectRatio: "4 / 3" }}>
          <video ref={video} muted playsInline className="size-full -scale-x-100 object-cover" />
          {phase === "recording" && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
              <span className="size-2 animate-pulse rounded-full bg-red-500" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        {phase === "intro" && (
          <div className="absolute inset-0 grid place-items-center bg-ink/55 p-6 text-center text-white">
            <div className="max-w-sm space-y-3">
              <p className="text-lg font-semibold">{t("{name} von Gründarium führt das Gespräch mit dir", { name: INTERVIEWER[voice][lang] })}</p>
              <p className="text-sm text-white/85">{t("Mach den Ton an. Dein Bild bleibt auf deinem Gerät und wird nicht übertragen oder gespeichert. Deine Antworten werden in Text umgewandelt, die Aufnahme selbst wird nicht gespeichert.")}</p>
              <button type="button" className="btn" onClick={() => void openCamera()}>{t("Gespräch beginnen")}</button>
            </div>
          </div>
        )}
        {phase !== "intro" && (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-white">
            <button type="button" className="tap grid size-7 place-items-center text-base" aria-label={muted ? t("Ton an") : t("Ton aus")} onClick={() => setMuted((m) => !m)}>
              {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label={t("Lautstärke")} className="w-24 accent-white sm:w-32" onChange={(e) => setVolume(Number(e.target.value))} />
          </div>
        )}
        {noVoice && phase !== "intro" && <span className="absolute left-3 right-3 top-14 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white">{t("Die Stimme lässt sich auf diesem Gerät gerade nicht abspielen. Prüfe den Ton (Lautlos-Schalter am Handy) oder lies die Frage mit.")}</span>}
        {faceOk === false && phase !== "intro" && <span className="absolute left-3 right-3 top-24 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">{t("Die Mimik kann auf diesem Gerät nicht gemessen werden. Die Antworten werden trotzdem ausgewertet.")}</span>}
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
            <button type="button" className="btn-ghost" onClick={() => void say(index)}>{t("Noch einmal vorlesen")}</button>
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
