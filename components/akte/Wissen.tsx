"use client";
import { useActionState, useTransition } from "react";
import { acceptSuggestion, analyzeMeeting, rejectSuggestion, saveFinanceItem, saveProfileItem } from "@/app/actions/profil";
import type { FormState } from "@/lib/forms";
import { FINANCE_SECTIONS, PERIOD_LABEL, categoriesFor, type Category } from "@/lib/profile";
import { SubmitButton } from "../SubmitButton";
import { Notice } from "../ui";
import { ActionForm } from "./ActionForm";

type Kind = "job" | "gruendung";

function ProfileFields({ type, v, compact }: { type: Kind; compact?: boolean; v?: { category?: string; title?: string; detail?: string; evidence?: string; level?: number | null; internal?: boolean } }) {
  const cats: Category[] = categoriesFor(type);
  return (
    <>
      <div className={`grid gap-3 ${compact ? "grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_1.4fr_auto]"}`}>
        <select name="category" defaultValue={v?.category ?? cats[0].key} className={`input ${compact ? "col-span-2" : ""}`} aria-label="Kategorie">
          {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input name="title" defaultValue={v?.title} required placeholder="Kurzer Titel" className="input" aria-label="Titel" />
        <select name="level" defaultValue={v?.level ?? ""} className="input" aria-label="Ausprägung">
          <option value="">Stufe –</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"●".repeat(n)}{"○".repeat(5 - n)}</option>)}
        </select>
      </div>
      <textarea name="detail" defaultValue={v?.detail} rows={2} placeholder="Beschreibung" className="input" aria-label="Beschreibung" />
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-[1fr_auto] sm:items-center"}`}>
        <input name="evidence" defaultValue={v?.evidence} placeholder="Beleg, z. B. „hat 3 Jahre ein Lager mit 12 Leuten geführt“" className="input" aria-label="Beleg" />
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="internal" defaultChecked={v?.internal} className="accent-[var(--accent)]" /> nur intern</label>
      </div>
    </>
  );
}

function FinanceFields({ v, compact }: { compact?: boolean; v?: { section?: string; label?: string; amount?: number; period?: string; note?: string } }) {
  return (
    <>
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-[1fr_1.4fr_0.8fr_0.8fr]"}`}>
        <select name="section" defaultValue={v?.section ?? "kosten"} className={`input ${compact ? "col-span-2" : ""}`} aria-label="Bereich">
          {FINANCE_SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <input name="label" defaultValue={v?.label} required placeholder="Bezeichnung" className={`input ${compact ? "col-span-2" : ""}`} aria-label="Bezeichnung" />
        <input name="amount" defaultValue={v?.amount} required inputMode="decimal" placeholder="Betrag €" className="input" aria-label="Betrag in Euro" />
        <select name="period" defaultValue={v?.period ?? "monatlich"} className="input" aria-label="Zeitraum">
          {Object.entries(PERIOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <input name="note" defaultValue={v?.note} placeholder="Notiz, z. B. Rechnung oder Quelle" className="input" aria-label="Notiz" />
    </>
  );
}

export function ProfileItemForm({ coacheeId, type }: { coacheeId: string; type: Kind }) {
  return (
    <ActionForm action={saveProfileItem.bind(null, coacheeId, null)} resetOnOk className="space-y-3">
      <ProfileFields type={type} compact />
      <SubmitButton className="btn btn-sm">Eintrag hinzufügen</SubmitButton>
    </ActionForm>
  );
}

export function FinanceItemForm({ coacheeId }: { coacheeId: string }) {
  return (
    <ActionForm action={saveFinanceItem.bind(null, coacheeId, null)} resetOnOk className="space-y-3">
      <FinanceFields compact />
      <SubmitButton className="btn btn-sm">Position hinzufügen</SubmitButton>
    </ActionForm>
  );
}

type Suggestion = { id: string; target: "profile" | "finance"; payload: Record<string, unknown>; meeting_title: string | null };

export function SuggestionCard({ coacheeId, type, s, healthConsent }: { coacheeId: string; type: Kind; s: Suggestion; healthConsent: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(acceptSuggestion.bind(null, coacheeId, s.id), undefined);
  const [pending, start] = useTransition();
  const p = s.payload as { category?: string; sensitive?: boolean };
  const blocked = s.target === "profile" && p.category === "gesundheit" && !healthConsent;
  return (
    <form action={action} className={`space-y-3 rounded-xl border p-4 ${p.sensitive ? "border-gold/50 bg-[#fbf6ee]" : "border-line-soft bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{s.target === "finance" ? "Zahl für den Finanzplan" : "Vorschlag"}{s.meeting_title ? ` aus „${s.meeting_title}“` : ""}</span>
        {p.sensitive && <span className="badge bg-[#fbf1e3] text-gold">sensibel, wird intern gespeichert</span>}
      </div>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {s.target === "profile" ? <ProfileFields type={type} v={{ ...(s.payload as object), internal: Boolean(p.sensitive) }} /> : <FinanceFields v={s.payload as object} />}
      {blocked && <Notice tone="error">Keine Einwilligung für Gesundheitsthemen. Diesen Vorschlag bitte verwerfen.</Notice>}
      <div className="flex gap-2">
        <SubmitButton className="btn btn-sm" pendingText="Wird übernommen …">Übernehmen</SubmitButton>
        <button type="button" disabled={pending} onClick={() => start(() => rejectSuggestion(coacheeId, s.id))} className="btn-ghost btn-sm">Verwerfen</button>
      </div>
    </form>
  );
}

export function AnalyzeButton({ coacheeId, meetingId, done }: { coacheeId: string; meetingId: string; done: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(() => analyzeMeeting(coacheeId, meetingId), undefined);
  return (
    <form action={action} className="contents">
      <SubmitButton className="font-semibold text-accent hover:underline" pendingText="KI wertet aus …">{done ? "Erneut mit KI auswerten" : "Mit KI auswerten"}</SubmitButton>
      {state?.error && <span className="w-full text-xs text-danger">{state.error}</span>}
    </form>
  );
}
