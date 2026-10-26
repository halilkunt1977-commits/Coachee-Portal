"use client";
import { useActionState, useState } from "react";
import { createCv } from "@/app/actions/lebenslauf";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";
import { useT } from "../i18n/LangProvider";

export function NewCvForm({ coacheeId, ai, coach, defaultName }: { coacheeId: string; ai: boolean; coach: boolean; /** z. B. „Lebenslauf 22.10.2026“, damit sich mehrere auseinanderhalten lassen */ defaultName: string }) {
  const t = useT();
  const [state, action] = useActionState(createCv.bind(null, coacheeId), undefined);
  const [start, setStart] = useState(ai ? "datei" : "akte");
  const options = [
    ai && { key: "datei", title: t("Bisherigen Lebenslauf hochladen"), text: coach ? "PDF oder Word. Die KI überträgt alles in die Felder, danach wird gemeinsam verbessert." : t("PDF oder Word. Alles wird in die Felder übertragen, danach verbessert ihr ihn gemeinsam.") },
    { key: "akte", title: coach ? "Mit den Daten aus der Akte" : t("Mit meinen Daten starten"), text: t("Name, Kontakt und die Kenntnisse aus dem Kompetenzprofil sind schon eingetragen.") },
    { key: "leer", title: t("Leer beginnen"), text: t("Nur der Name ist eingetragen.") },
  ].filter(Boolean) as { key: string; title: string; text: string }[];
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{t(state.error)}</Notice>}
      <label className="block">
        <span className="label">{t("Name")}</span>
        <input name="name" className="input" defaultValue={defaultName} placeholder={t("z. B. Lebenslauf Lagerlogistik")} required maxLength={120} />
        <span className="hint block">{t("Für jede Bewerbung kann es eine eigene Fassung geben. Ein Name mit Ziel hilft, z. B. „Lebenslauf Lagerlogistik“.")}</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="label">{t("Wie starten?")}</legend>
        {options.map((o) => (
          <label key={o.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${start === o.key ? "border-accent bg-tint/50" : "border-line-soft hover:border-line"}`}>
            <input type="radio" name="start" value={o.key} checked={start === o.key} onChange={() => setStart(o.key)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span><span className="block text-sm font-semibold">{o.title}</span><span className="block text-xs text-muted">{o.text}</span></span>
          </label>
        ))}
      </fieldset>
      {start === "datei" && (
        <label className="block">
          <span className="label">{t("Datei")}</span>
          <input type="file" name="datei" required accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-tint file:px-3 file:py-1 file:text-sm file:font-semibold file:text-accent" />
          {coach && <span className="hint block">Name, E-Mail und Telefon werden vor der KI entfernt und danach wieder eingesetzt.</span>}
        </label>
      )}
      <SubmitButton pendingText={start === "datei" ? t("Lebenslauf wird gelesen …") : t("Wird angelegt …")}>{t("Lebenslauf anlegen")}</SubmitButton>
    </form>
  );
}
