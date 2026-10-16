"use client";
import { useActionState, useState } from "react";
import { startEmptySurvey, startSurvey } from "@/app/actions/erfahrung";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";

/** Bogen anlegen: Lebenslauf hochladen oder einen aus dem Portal nehmen */
export function StartSurvey({ coacheeId, cvs, coach }: { coacheeId: string; cvs: { id: string; name: string }[]; coach: boolean }) {
  const [state, action] = useActionState(startSurvey.bind(null, coacheeId), undefined);
  const [from, setFrom] = useState("datei");
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {cvs.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="label">Welcher Lebenslauf?</legend>
            {[{ id: "datei", name: coach ? "Neue Datei hochladen" : "Meinen Lebenslauf hochladen" }, ...cvs.map((c) => ({ id: c.id, name: `${c.name} (schon im Portal)` }))].map((o) => (
              <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${from === o.id ? "border-accent bg-tint/50" : "border-line-soft hover:border-line"}`}>
                <input type="radio" name="from" value={o.id} checked={from === o.id} onChange={() => setFrom(o.id)} className="size-4 accent-[var(--accent)]" />
                {o.name}
              </label>
            ))}
          </fieldset>
        )}
        {from === "datei" && (
          <label className="block">
            <span className="label">Lebenslauf (PDF oder Word)</span>
            <input type="file" name="datei" required accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-tint file:px-3 file:py-1 file:text-sm file:font-semibold file:text-accent" />
          </label>
        )}
        <SubmitButton pendingText="Dein Bogen wird vorbereitet, das dauert etwa eine Minute …">Bogen erstellen</SubmitButton>
      </form>
      <form action={startEmptySurvey.bind(null, coacheeId)}>
        <button className="text-sm text-muted hover:text-ink">Ohne Lebenslauf starten und Stationen selbst eintragen</button>
      </form>
    </div>
  );
}
