import "server-only";
import { notFound } from "next/navigation";
import { one } from "./db";
import type { User } from "./auth";

export type Coachee = {
  id: string;
  user_id: string | null;
  coach_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  coaching_type: "job" | "gruendung";
  funding: "avgs" | "selbstzahler" | "sonstiges";
  voucher_number: string | null;
  start_date: string | null;
  end_date: string | null;
  units_total: number | null;
  traeger: "erfolgspfad" | "avocons" | "sonstige" | null;
  city: string | null;
  status: "aktiv" | "pausiert" | "abgeschlossen";
  goal: string | null;
  internal_note: string | null;
  consent_at: string | null;
  consent_special_at: string | null;
  archived_at: string | null;
  created_at: string;
};

/**
 * Die eine Stelle, die entscheidet, wer welche Akte sehen darf:
 * Coach nur seine eigenen Coachees, Coachee nur sich selbst. Alles andere ist "nicht gefunden".
 */
export async function coacheeFor(user: User, coacheeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(coacheeId)) notFound();
  const row =
    user.role === "coach"
      ? await one<Coachee>("SELECT * FROM coachees WHERE id = $1 AND coach_id = $2", [coacheeId, user.id])
      : await one<Coachee>("SELECT * FROM coachees WHERE id = $1 AND user_id = $2", [coacheeId, user.id]);
  if (!row) notFound();
  if (user.role !== "coach") row.internal_note = null;
  return row;
}

export async function ownCoachee(user: User) {
  return one<Coachee>("SELECT * FROM coachees WHERE user_id = $1", [user.id]);
}

export const fullName = (c: { first_name: string; last_name: string }) => `${c.first_name} ${c.last_name}`;
export const typeLabel = { job: "Jobcoaching", gruendung: "Gründungscoaching" } as const;
export const fundingLabel = { avgs: "AVGS", selbstzahler: "Selbstzahler", sonstiges: "Sonstiges" } as const;
export const statusLabel = { aktiv: "Aktiv", pausiert: "Pausiert", abgeschlossen: "Abgeschlossen" } as const;
