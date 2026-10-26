"use client";
import { useRef, useState } from "react";
import { createTask } from "@/app/actions/aufgaben";
import { ActionForm } from "@/components/akte/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/i18n/LangProvider";

const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const nextWeekday = (target: number) => {
  const now = new Date();
  const wd = (now.getDay() + 6) % 7;
  return inDays(((target - wd + 7) % 7) || 7);
};

/** Schnell eine Aufgabe anlegen; Fälligkeit per Knopf (heute, morgen, Freitag, nächste Woche) */
export function NewTaskForm({ coachees, defaultFor = "" }: { coachees?: { id: string; name: string; hasLogin: boolean }[]; defaultFor?: string }) {
  const t = useT();
  const due = useRef<HTMLInputElement>(null);
  const [forId, setForId] = useState(defaultFor);
  const login = coachees?.find((c) => c.id === forId)?.hasLogin;
  const presets: [string, () => string][] = [
    [t("Heute"), () => inDays(0)],
    [t("Morgen"), () => inDays(1)],
    [t("Freitag"), () => nextWeekday(4)],
    [t("In einer Woche"), () => inDays(7)],
  ];
  return (
    <ActionForm action={createTask} resetOnOk className="space-y-3">
      <input name="title" className="input !text-base" placeholder={t("Neue Aufgabe, z. B. Drei Stellenanzeigen heraussuchen")} required maxLength={300} />
      <div className="flex flex-wrap items-end gap-2">
        {coachees && (
          <label className="min-w-[180px] flex-1">
            <span className="label !text-xs">Für</span>
            <select name="for" className="input !py-2" value={forId} onChange={(e) => setForId(e.target.value)}>
              <option value="">Mich selbst</option>
              {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="w-[160px]">
          <span className="label !text-xs">{t("Fällig am")}</span>
          <input ref={due} type="date" name="due_on" className="input !py-2" />
        </label>
        <div className="flex flex-wrap gap-1 pb-1">
          {presets.map(([l, f]) => (
            <button key={l} type="button" onClick={() => due.current && (due.current.value = f())} className="tap rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold max-sm:px-3 max-sm:text-xs text-muted transition hover:border-accent/40 hover:text-accent">{l}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {coachees && forId && login ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="notify" defaultChecked className="accent-[var(--accent)]" /> per Mail Bescheid geben
          </label>
        ) : <span />}
        <SubmitButton>{t("Aufgabe anlegen")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
