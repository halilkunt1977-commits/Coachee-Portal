"use client";
import { useRef } from "react";
import { saveMeeting } from "@/app/actions/akte";
import { SubmitButton } from "../SubmitButton";
import { Field, Select, TextArea } from "../ui";
import { ActionForm } from "./ActionForm";
import { Recorder } from "./Recorder";

type Meeting = { id: string; held_on: string; units: number; format: string; title: string; notes: string; results: string; next_steps: string; internal_note: string; shared: boolean };

export function MeetingForm({ coacheeId, meeting, ai }: { coacheeId: string; meeting?: Meeting; ai: boolean }) {
  const notes = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={saveMeeting.bind(null, coacheeId, meeting?.id ?? null)} resetOnOk={!meeting}>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Thema" name="title" defaultValue={meeting?.title} placeholder="z. B. Stärkenanalyse" required /></div>
        <Field label="Datum" name="held_on" type="date" defaultValue={meeting?.held_on ?? today} required />
        <Field label="Unterrichtseinheiten" name="units" inputMode="decimal" defaultValue={meeting?.units ?? 2} />
      </div>
      <Select label="Form" name="format" defaultValue={meeting?.format ?? "praesenz"}>
        <option value="praesenz">Vor Ort</option>
        <option value="online">Online</option>
        <option value="telefon">Telefon</option>
      </Select>
      <div className="space-y-2">
        <label className="block">
          <span className="label">Gesprächsnotizen</span>
          <textarea ref={notes} name="notes" defaultValue={meeting?.notes} rows={8} className="input min-h-24" placeholder="Was wurde besprochen? Stichpunkte reichen. Alles, was du über den Coachee erfährst, gehört hier hinein." />
        </label>
        {ai && (
          <Recorder
            coacheeId={coacheeId}
            onText={(t) => {
              if (!notes.current) return;
              notes.current.value = notes.current.value.trim() ? `${notes.current.value.trim()}\n\n${t}` : t;
            }}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea label="Ergebnisse" name="results" defaultValue={meeting?.results} rows={3} />
        <TextArea label="Nächste Schritte" name="next_steps" defaultValue={meeting?.next_steps} rows={3} />
      </div>
      <TextArea label="Interne Notiz (nur für dich)" name="internal_note" defaultValue={meeting?.internal_note} rows={2} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="shared" defaultChecked={meeting?.shared ?? true} className="size-4 accent-[var(--accent)]" />
        Notizen, Ergebnisse und nächste Schritte für den Coachee sichtbar machen
      </label>
      <SubmitButton>{meeting ? "Änderungen speichern" : "Gespräch speichern"}</SubmitButton>
    </ActionForm>
  );
}
