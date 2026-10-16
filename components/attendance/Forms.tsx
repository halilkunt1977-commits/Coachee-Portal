"use client";
import { addAttendance, assignMail, fetchMailboxNow, pasteMail } from "@/app/actions/anwesenheit";
import { ActionForm } from "../akte/ActionForm";
import { SubmitButton } from "../SubmitButton";
import { Field, TextArea } from "../ui";

export function AttendanceForm({ coacheeId, avocons }: { coacheeId: string; avocons: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={addAttendance.bind(null, coacheeId)} resetOnOk>
      <Field label="Datum" name="held_on" type="date" defaultValue={today} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Beginn" name="starts_at" type="time" />
        <Field label="Ende" name="ends_at" type="time" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="UE" name="units" inputMode="decimal" placeholder="z. B. 2" hint="Leer lassen: aus Beginn und Ende (45 Min. = 1 UE)" />
        <Field label="Rest-UE laut Träger" name="rest_units" inputMode="decimal" placeholder="optional" />
      </div>
      <Field label="Notiz" name="note" placeholder={avocons ? "z. B. im AVOCONS-Portal bestätigt" : "optional"} />
      <SubmitButton>Anwesenheit eintragen</SubmitButton>
    </ActionForm>
  );
}

export function AssignForm({ mailId, options, suggested }: { mailId: string; options: { id: string; name: string }[]; suggested?: string | null }) {
  return (
    <ActionForm action={assignMail.bind(null, mailId)} className="flex flex-wrap items-start gap-2">
      <select name="coachee_id" defaultValue={suggested ?? ""} className="input w-auto min-w-48 flex-1 py-1.5 text-sm" aria-label="Coachee">
        <option value="">Coachee wählen …</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <SubmitButton className="btn btn-sm">Zuordnen</SubmitButton>
    </ActionForm>
  );
}

export function PasteForm() {
  return (
    <ActionForm action={pasteMail} resetOnOk>
      <Field label="Betreff" name="subject" placeholder="Neue Anwesenheitserfassung Vorname Nachname" />
      <TextArea label="Text der Mail" name="body" rows={6} required placeholder={"Djamal Weise hat soeben folgenden Termin per Unterschrift bestätigt:\nDatum: 15.10.2026\nStart: 15:30:00\nEnde: 16:30:00\nDauer: 1,33 UE\n…"} />
      <SubmitButton className="btn-ghost">Übernehmen</SubmitButton>
    </ActionForm>
  );
}

export function FetchNow() {
  return (
    <ActionForm action={fetchMailboxNow} className="space-y-2">
      <SubmitButton className="btn" pendingText="Postfach wird abgerufen …">Postfach jetzt abrufen</SubmitButton>
    </ActionForm>
  );
}
