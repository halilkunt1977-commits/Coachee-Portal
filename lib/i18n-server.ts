import "server-only";
import { cache } from "react";
import { getSession } from "./auth";
import { one } from "./db";
import { translator, type Lang } from "./i18n";

/** Sprache der angemeldeten Person: beim Coachee die vom Coach gewählte, sonst Deutsch */
export const serverLang = cache(async (): Promise<Lang> => {
  const s = await getSession();
  if (!s || s.user.role !== "coachee") return "de";
  const row = await one<{ language: Lang }>("SELECT language FROM coachees WHERE user_id = $1", [s.user.id]);
  return row?.language === "tr" ? "tr" : "de";
});

/** Übersetzer für Server-Komponenten und Aktionen */
export const getT = async () => translator(await serverLang());

/** Sprache eines bestimmten Nutzers, z. B. für Meldungen aufs Handy */
export async function langOfUser(userId: string | null | undefined): Promise<Lang> {
  if (!userId) return "de";
  const row = await one<{ language: Lang }>("SELECT language FROM coachees WHERE user_id = $1", [userId]);
  return row?.language === "tr" ? "tr" : "de";
}
