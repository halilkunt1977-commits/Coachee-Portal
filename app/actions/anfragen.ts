"use server";
import { revalidatePath } from "next/cache";
import { audit, requireCoach } from "@/lib/auth";
import { query } from "@/lib/db";
import { dateOrNull, text, type FormState } from "@/lib/forms";

const refresh = () => revalidatePath("/coach", "layout");

const STEPS = {
  angerufen: { status: "kontaktiert", log: "Angerufen und gesprochen", days: 2 },
  mail: { status: "kontaktiert", log: "Mail geschrieben", days: 2 },
  nicht_erreicht: { status: null, log: "Angerufen, nicht erreicht", days: 1 },
  termin: { status: "termin", log: "Erstgespräch vereinbart", days: null },
  absagen: { status: "abgesagt", log: "Abgeschlossen ohne Coaching", days: null },
  wieder_offen: { status: "neu", log: "Wieder geöffnet", days: 0 },
} as const;
export type LeadStep = keyof typeof STEPS;

const berlinDay = (plusDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + plusDays * 86_400_000));

/** Ein Schritt im Nachfassen: Status, nächstes Nachfassen und ein Eintrag im Verlauf */
export async function leadStep(id: string, step: LeadStep) {
  const coach = await requireCoach();
  const s = STEPS[step];
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return;
  await query(
    `UPDATE leads SET status = COALESCE($3, status), follow_up_on = $4, updated_at = now(),
            log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', $5::text))
      WHERE id = $1 AND coach_id = $2`,
    [id, coach.id, s.status, s.days == null ? null : berlinDay(s.days), s.log],
  );
  await audit(coach.id, "lead_step", null, { leadId: id, step });
  refresh();
}

export async function saveLead(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const coach = await requireCoach();
  const first = text(fd, "first_name", 80);
  const last = text(fd, "last_name", 80);
  if (!first && !last) return { error: "Bitte einen Namen eingeben." };
  const type = text(fd, "coaching_type", 20);
  const source = text(fd, "source", 20);
  const vals = [
    first,
    last,
    text(fd, "email", 200) || null,
    text(fd, "phone", 40) || null,
    text(fd, "city", 80) || null,
    type === "job" || type === "gruendung" ? type : null,
    text(fd, "note", 5000),
    dateOrNull(fd, "follow_up_on"),
  ];
  if (id) {
    await query(
      `UPDATE leads SET first_name=$3, last_name=$4, email=$5, phone=$6, city=$7, coaching_type=$8, note=$9, follow_up_on=$10, updated_at=now() WHERE id = $1 AND coach_id = $2`,
      [id, coach.id, ...vals],
    );
  } else {
    await query(
      `INSERT INTO leads (coach_id, source, first_name, last_name, email, phone, city, coaching_type, note, follow_up_on, log)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, CURRENT_DATE), jsonb_build_array(jsonb_build_object('at', now(), 'what', 'Anfrage selbst erfasst')))`,
      [coach.id, ["avocons", "erfolgspfad", "telefon", "empfehlung", "sonstige"].includes(source) ? source : "sonstige", ...vals],
    );
  }
  refresh();
  return { ok: id ? "Gespeichert." : "Anfrage angelegt." };
}
