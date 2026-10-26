import "server-only";
import type { Coachee } from "../access";
import { normalizeCv } from "../cv/types";
import { one, query } from "../db";
import { findeHebesatz } from "../tax/hebesaetze";
import { translator, type Lang } from "../i18n";
import { buildHandbook, checkItems, type HandbookContext } from "./content";

const portalHost = () => {
  try {
    return new URL(process.env.PORTAL_URL || "https://portal.gruendarium.de").host;
  } catch {
    return "portal.gruendarium.de";
  }
};

/** Handbuch eines Coachees mit den abgehakten Schritten. Nur Akte und Lebenslauf (Ort), keine internen Angaben. */
export async function handbookFor(c: Coachee, lang: Lang = "de") {
  const [coach, cv, rows] = await Promise.all([
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    c.city?.trim() ? null : one<{ data: unknown }>("SELECT data FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1", [c.id]),
    query<{ item: string }>("SELECT item FROM handbook_checks WHERE coachee_id = $1", [c.id]),
  ]);
  const city = c.city?.trim() || (cv ? normalizeCv(cv.data).personal.city.trim() : "") || null;
  const h = c.coaching_type === "gruendung" ? findeHebesatz(city)?.treffer : null;
  const ctx: HandbookContext = {
    firstName: c.first_name,
    lastName: c.last_name,
    type: c.coaching_type,
    foerderart: c.coaching_type === "gruendung" ? c.foerderart : null,
    city,
    hebesatz: h ? { gemeinde: h.gemeinde, hebesatz: h.hebesatz } : null,
    goal: c.goal?.trim() || null,
    coachName: coach?.name ?? translator(lang)("deinem Coach"),
    closed: c.status === "abgeschlossen",
    portal: portalHost(),
  };
  const book = buildHandbook(ctx, lang);
  const valid = new Set(checkItems(book).map((i) => i.key));
  const done = rows.map((r) => r.item).filter((k) => valid.has(k));
  return { book, ctx, done, total: valid.size };
}
