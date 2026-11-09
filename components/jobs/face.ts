"use client";
import type { FaceMetrics } from "@/lib/jobs/training-shared";

/*
 * Mimik im Browser messen (MediaPipe Face Landmarker, Dateien liegen im Portal unter /mediapipe). Das Kamerabild
 * verlässt das Gerät nicht; heraus kommen nur Anteile: Gesicht sichtbar, Blick in die Kamera, Lächeln, Kopfbewegung.
 */
type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, t: number) => {
    faceLandmarks: { x: number; y: number }[][];
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  };
  close: () => void;
};

export type FaceMeter = { reset: () => void; read: () => FaceMetrics; stop: () => void };

const EYE_KEYS = ["eyeLookOutLeft", "eyeLookInLeft", "eyeLookUpLeft", "eyeLookDownLeft", "eyeLookOutRight", "eyeLookInRight", "eyeLookUpRight", "eyeLookDownRight"];

export async function createFaceMeter(video: HTMLVideoElement): Promise<FaceMeter | null> {
  let lm: Landmarker;
  try {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
    lm = (await make("GPU").catch(() => make("CPU"))) as unknown as Landmarker;
  } catch (e) {
    console.warn("Gesichtserkennung nicht verfügbar", e);
    return null;
  }

  let frames = 0, faces = 0, eye = 0, smile = 0, moveSum = 0, moveN = 0;
  let last: { x: number; y: number } | null = null;
  let lastT = -1;

  const timer = window.setInterval(() => {
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const now = performance.now();
    if (now <= lastT) return;
    lastT = now;
    let r: ReturnType<Landmarker["detectForVideo"]>;
    try {
      r = lm.detectForVideo(video, now);
    } catch {
      return;
    }
    frames++;
    const pts = r.faceLandmarks[0];
    if (!pts) {
      last = null;
      return;
    }
    faces++;
    const score = Object.fromEntries((r.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
    // Kopf zur Seite gedreht? Nasenspitze (1) gegenüber der Mitte zwischen den Wangen (234, 454)
    const left = pts[234], right = pts[454], nose = pts[1];
    const width = Math.abs(right.x - left.x) || 1;
    const yaw = Math.abs((nose.x - (left.x + right.x) / 2) / width);
    const gaze = Math.max(0, ...EYE_KEYS.map((k) => score[k] ?? 0));
    if (yaw < 0.12 && gaze < 0.5) eye++;
    if (((score.mouthSmileLeft ?? 0) + (score.mouthSmileRight ?? 0)) / 2 > 0.35) smile++;
    const p = { x: nose.x / width, y: nose.y / width };
    if (last) {
      moveSum += Math.hypot(p.x - last.x, p.y - last.y);
      moveN++;
    }
    last = p;
  }, 200);

  return {
    reset() {
      frames = faces = eye = smile = moveSum = moveN = 0;
      last = null;
    },
    read() {
      const avg = moveN ? moveSum / moveN : 0;
      return {
        ok: frames > 5,
        face: frames ? faces / frames : 0,
        eye: faces ? eye / faces : 0,
        smile: faces ? smile / faces : 0,
        // ruhig sitzen ≈ 0,01 je Messung, deutliches Wackeln ≈ 0,06 und mehr
        motion: Math.max(0, Math.min(1, (avg - 0.01) / 0.06)),
      };
    },
    stop() {
      window.clearInterval(timer);
      try {
        lm.close();
      } catch {}
    },
  };
}
