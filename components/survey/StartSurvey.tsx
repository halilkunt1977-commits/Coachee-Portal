"use client";
import { useActionState, useState } from "react";
import { startEmptySurvey, startSurvey } from "@/app/actions/erfahrung";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";
import { useT } from "@/components/i18n/LangProvider";

/** Bogen anlegen: Lebenslauf hochladen oder einen aus dem Portal nehmen. Ohne upload (Hilfe nicht freigegeben) nur leer starten. */
export function StartSurvey({ coacheeId, cvs, coach, upload = true }: { coacheeId: string; cvs: { id: string; name: string }[]; coach: boolean; upload?: boolean }) {
  const t = useT();
  const [state, action] = useActionState(startSurvey.bind(null, coacheeId), undefined);
  const [from, setFrom] = useState("datei");
  if (!upload)
    return (
      <form action={startEmptySurvey.bind(null, coacheeId)}>
        <button className="btn">{t("Bogen beginnen")}</button>
      </form>
    );
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {state?.error && <Notice tone="error">{t(state.error)}</Notice>}
        {cvs.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="label">{t("Welcher Lebenslauf?")}</legend>
            {[{ id: "datei", name: coach ? t("Neue Datei hochladen") : t("Meinen Lebenslauf hochladen") }, ...cvs.map((c) => ({ id: c.id, name: t("{name} (schon im Portal)", { name: c.name }) }))].map((o) => (
              <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${from === o.id ? "border-accent bg-tint/50" : "border-line-soft hover:border-line"}`}>
                <input type="radio" name="from" value={o.id} checked={from === o.id} onChange={() => setFrom(o.id)} className="size-4 accent-[var(--accent)]" />
                {o.name}
              </label>
            ))}
          </fieldset>
        )}
        {from === "datei" && (
          <label className="block">
            <span className="label">{t("Lebenslauf (PDF oder Word)")}</span>
            <input type="file" name="datei" required accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-tint file:px-3 file:py-1 file:text-sm file:font-semibold file:text-accent" />
          </label>
        )}
        <SubmitButton pendingText={t("Dein Bogen wird vorbereitet, das dauert etwa eine Minute …")}>{t("Bogen erstellen")}</SubmitButton>
      </form>
      <form action={startEmptySurvey.bind(null, coacheeId)}>
        <button className="text-sm text-muted hover:text-ink">{t("Ohne Lebenslauf starten und Stationen selbst eintragen")}</button>
      </form>
    </div>
  );
}
