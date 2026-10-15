"use client";
import { addTask } from "@/app/actions/akte";
import { SubmitButton } from "../SubmitButton";
import { Field } from "../ui";
import { ActionForm } from "./ActionForm";

export function TaskForm({ coacheeId, coach }: { coacheeId: string; coach: boolean }) {
  return (
    <ActionForm action={addTask.bind(null, coacheeId)} resetOnOk className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <Field label="Neue Aufgabe" name="title" placeholder="z. B. Drei Stellenanzeigen heraussuchen" required />
      <Field label="Bis" name="due_on" type="date" />
      <div className="flex flex-col gap-2">
        {coach && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="notify" defaultChecked className="accent-[var(--accent)]" /> per Mail Bescheid geben
          </label>
        )}
        <SubmitButton>Hinzufügen</SubmitButton>
      </div>
    </ActionForm>
  );
}
