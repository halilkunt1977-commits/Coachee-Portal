import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "../auth";
import { loadSignature } from "../signature";
import { letterFor } from "./store";
import { resolveLetter } from "./types";

/** Gemeinsamer Anfang der Download-Routen (PDF und Word): anmelden, Bewerbung prüfen, Brief zusammensetzen */
export async function letterForDownload(id: string) {
  const session = await getSession();
  if (!session || (session.user.totp_enabled && !session.mfaPassed)) return { error: new NextResponse("Nicht angemeldet", { status: 401 }) };
  const { app, coachee, stored, auto, color } = await letterFor(session.user, id);
  const view = resolveLetter(auto, stored);
  const signature = view.signature ? await loadSignature(coachee.id) : null;
  return { user: session.user, app, coachee, view, color, signature };
}

/** Dateiname wie „Anschreiben Stefan Schmidt - Lagerist.pdf“ */
export const letterFileName = (name: string, title: string, ext: string) =>
  `${["Anschreiben", name].filter(Boolean).join(" ")}${title ? ` - ${title.replace(/\s*\([mwdfx/|,\s]+\)/gi, "")}` : ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 120).trim() + `.${ext}`;
