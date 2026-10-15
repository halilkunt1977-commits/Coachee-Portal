"use client";
import { CoacheeFields } from "@/components/CoacheeFields";
import { ActionForm } from "@/components/akte/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui";
import type { Coachee } from "@/lib/access";
import { updateCoachee } from "../../actions";

export default function StammdatenForm({ c }: { c: Coachee }) {
  return (
    <ActionForm action={updateCoachee.bind(null, c.id)} className="space-y-6">
      <Select label="Status" name="status" defaultValue={c.status}>
        <option value="aktiv">Aktiv</option>
        <option value="pausiert">Pausiert</option>
        <option value="abgeschlossen">Abgeschlossen</option>
      </Select>
      <CoacheeFields c={c} />
      <SubmitButton>Speichern</SubmitButton>
    </ActionForm>
  );
}
