"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cleanFirstName, greetingAudioHref, greetingText, PLAYER_TEXT, TITLE_SLOT, videoFiles, type CoachingType, type VideoLanguage } from "@/lib/erklaervideo";

/*
 * Erklärvideo mit persönlicher Begrüßung:
 * 1. Titelkarte mit dem Vornamen (als HTML über der freien Stelle der Karte) und großem Abspielknopf, nichts startet von selbst.
 * 2. Nach dem Klick die gesprochene Begrüßung „Hallo Stefan, …“; ohne Ton bleibt die Karte gut vier Sekunden stehen.
 * 3. Danach startet das Hauptvideo (ohne Namen) automatisch.
 * Bedienung: Pause/Weiter, Von vorn, Begrüßung überspringen; im Hauptvideo zusätzlich die Leiste des Browsers.
 */

type Phase = "ready" | "greeting" | "main" | "ended";
type Audio = "loading" | "ready" | "none";

const GREETING_MS = 4200;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const SLOT_STYLE: CSSProperties = {
  left: pct(TITLE_SLOT.x, TITLE_SLOT.width),
  top: pct(TITLE_SLOT.y, TITLE_SLOT.height),
  width: pct(TITLE_SLOT.w, TITLE_SLOT.width),
  height: pct(TITLE_SLOT.h, TITLE_SLOT.height),
  color: TITLE_SLOT.color,
};

export function ExplainerPlayer({ coacheeId, firstName, type, lang, voice, onEnded }: {
  coacheeId: string;
  firstName: string;
  type: CoachingType;
  lang: VideoLanguage;
  /** Sprachausgabe eingerichtet: dann die Begrüßung als Ton laden, sonst gleich die Text-Fassung */
  voice: boolean;
  /** Hauptvideo bis zum Ende gesehen */
  onEnded?: () => void;
}) {
  const t = PLAYER_TEXT[lang];
  const files = videoFiles(type, lang);
  const name = cleanFirstName(firstName);
  const [phase, setPhase] = useState<Phase>("ready");
  const [audio, setAudio] = useState<Audio>(voice ? "loading" : "none");
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioState = useRef<Audio>(audio);
  // Text-Fassung der Begrüßung: Restzeit, damit Pause und Weiter auch ohne Ton funktionieren
  const timer = useRef<{ id: number | null; left: number; since: number }>({ id: null, left: GREETING_MS, since: 0 });
  const endedOnce = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Begrüßung im Hintergrund laden, damit sie nach dem Klick sofort kommt
  useEffect(() => {
    if (!voice) return;
    let url: string | null = null;
    let live = true;
    fetch(greetingAudioHref(coacheeId, lang), { credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status !== 200 || !res.headers.get("content-type")?.startsWith("audio/")) throw new Error("ohne Ton");
        url = URL.createObjectURL(await res.blob());
        if (!live || !audioRef.current) return;
        audioRef.current.src = url;
        audioState.current = "ready";
        setAudio("ready");
      })
      .catch(() => {
        if (!live) return;
        audioState.current = "none";
        setAudio("none");
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [coacheeId, lang, voice]);

  const clearTimer = () => {
    if (timer.current.id != null) window.clearTimeout(timer.current.id);
    timer.current.id = null;
  };

  const startMain = () => {
    clearTimer();
    setWaiting(false);
    const a = audioRef.current;
    if (a) a.pause();
    const v = videoRef.current;
    setPhase("main");
    setPaused(false);
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => setPaused(true));
  };

  const runTimer = (ms: number) => {
    clearTimer();
    timer.current = { id: window.setTimeout(startMain, ms), left: ms, since: Date.now() };
  };

  /** Begrüßung starten: mit Ton, falls vorhanden, sonst als stehende Karte */
  const greet = async () => {
    setPhase("greeting");
    setPaused(false);
    const a = audioRef.current;
    if (audioState.current === "loading") {
      // Erste Aufnahme kann ein paar Sekunden dauern: höchstens 6 Sekunden warten, dann ohne Ton weiter
      setWaiting(true);
      const until = Date.now() + 6000;
      while (audioState.current === "loading" && Date.now() < until) await new Promise((r) => setTimeout(r, 150));
      setWaiting(false);
    }
    if (audioState.current === "ready" && a) {
      a.currentTime = 0;
      try {
        await a.play();
        return;
      } catch {
        // Browser lässt den Ton nicht zu: Text-Fassung
      }
    }
    runTimer(GREETING_MS);
  };

  const play = () => {
    // Am Handy darf ein Video später nur mit Ton starten, wenn es einmal durch einen Tipp angestoßen wurde
    const v = videoRef.current;
    if (v && v.paused) {
      v.muted = true;
      v.play().then(() => { if (phaseRef.current !== "main") v.pause(); }).catch(() => {});
    }
    void greet();
  };

  useEffect(() => () => clearTimer(), []);

  const togglePause = () => {
    if (phase === "main") {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) void v.play(); else v.pause();
      return;
    }
    if (phase !== "greeting") return;
    const a = audioRef.current;
    const withSound = a && audio === "ready" && a.currentTime > 0 && !a.ended;
    if (paused) {
      setPaused(false);
      if (withSound) void a.play().catch(() => runTimer(GREETING_MS));
      else runTimer(timer.current.left);
    } else {
      setPaused(true);
      if (withSound) a.pause();
      else {
        const left = Math.max(300, timer.current.left - (Date.now() - timer.current.since));
        clearTimer();
        timer.current.left = left;
      }
    }
  };

  const replay = () => {
    clearTimer();
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
    void greet();
  };

  const onVideoEnded = () => {
    setPhase("ended");
    if (!endedOnce.current) {
      endedOnce.current = true;
      onEnded?.();
    }
  };

  const showCard = phase === "ready" || phase === "greeting";
  const chars = [...name].length + 1;
  // Lange Vornamen kleiner setzen, damit sie in die freie Stelle passen (Schrift ~0,6 em breit je Zeichen)
  const nameSize = `${(TITLE_SLOT.sizePx / TITLE_SLOT.width) * 100 * Math.min(1, 15 / chars)}cqw`;
  const btn = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition disabled:opacity-40";

  return (
    <section aria-label={t.region} className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-night shadow-[0_24px_60px_-30px_rgba(10,22,40,.9)] [container-type:inline-size]">
        <video
          ref={videoRef}
          src={files.video}
          poster={files.poster}
          preload="metadata"
          playsInline
          controls={phase === "main"}
          onPlay={() => setPaused(false)}
          onPause={() => { if (phaseRef.current === "main") setPaused(true); }}
          onEnded={onVideoEnded}
          onError={() => setFailed(true)}
          className={`absolute inset-0 size-full bg-night object-contain ${showCard ? "invisible" : ""}`}
        />
        <audio ref={audioRef} preload="auto" onEnded={startMain} onError={() => { audioState.current = "none"; setAudio("none"); }} />

        {showCard && (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${files.titleCard})` }}>
            <p className="absolute flex items-center justify-center whitespace-nowrap font-bold leading-none tracking-tight" style={{ ...SLOT_STYLE, fontSize: nameSize }} data-name-slot>
              <span className="rise">{name}!</span>
            </p>
            <p className="sr-only" aria-live="polite">{phase === "greeting" ? greetingText(name, lang) : ""}</p>
            {phase === "ready" && (
              <button type="button" onClick={play} aria-label={t.play}
                className="group absolute inset-0 grid place-items-end justify-center pb-[2cqw] focus-visible:outline-none">
                <span className="grid size-[max(44px,8cqw)] place-items-center rounded-full bg-gradient-to-br from-[#f3d9a6] to-[#d6a35b] text-night shadow-[0_12px_40px_-8px_rgba(214,163,91,.9)] ring-4 ring-white/15 transition group-hover:scale-105 group-focus-visible:ring-white">
                  <svg viewBox="0 0 24 24" className="ml-[8%] size-[45%]" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5" /></svg>
                </span>
              </button>
            )}
            {phase === "greeting" && waiting && (
              <p className="absolute inset-x-0 bottom-[6%] text-center text-xs text-white/70 sm:text-sm">{t.loading}</p>
            )}
          </div>
        )}

        {phase === "ended" && (
          <div className="absolute inset-0 grid place-items-center bg-night/80 p-4 text-center text-white backdrop-blur-sm">
            <div className="space-y-3">
              <p className="mx-auto max-w-md text-sm sm:text-base">{t.ended}</p>
              <button type="button" onClick={replay} className="btn">{t.again}</button>
            </div>
          </div>
        )}

        {failed && phase === "main" && (
          <div className="absolute inset-0 grid place-items-center bg-night/90 p-4 text-center text-sm text-white">{t.noVideo}</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={phase === "ready" ? play : togglePause} disabled={phase === "ended"} className={`${btn} bg-accent text-white hover:brightness-110`}>
          {phase === "ready" ? <>▶ {t.play}</> : paused ? <>▶ {t.resume}</> : <>❚❚ {t.pause}</>}
        </button>
        <button type="button" onClick={replay} disabled={phase === "ready"} className={`${btn} bg-surface-2 hover:bg-line-soft`}>↺ {t.replay}</button>
        {phase === "greeting" && (
          <button type="button" onClick={startMain} className={`${btn} text-accent hover:underline`}>{t.skip} →</button>
        )}
      </div>
    </section>
  );
}
