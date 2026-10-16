"use client";
import Link from "next/link";
import { useState } from "react";
import { saveAppointment } from "@/app/actions/termine";
import { ActionForm } from "@/components/akte/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { KINDS, type Kind } from "@/lib/calendar/dates";

type Defaults = {
  coachee_id?: string | null;
  title?: string;
  kind?: Kind;
  day: string;
  start?: string;
  end?: string;
  location?: string | null;
  notes?: string;
  join_url?: string | null;
  invited?: boolean;
};

const plus = (hm: string, min: number) => {
  const t = Math.min(Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Termin anlegen oder ändern. Art als große Knöpfe, Ende rückt beim Ändern des Beginns mit,
 * Teams-Link entweder automatisch (Microsoft angebunden) oder zum Einfügen.
 */
export function AppointmentForm({ id, ret, coachees, fixedCoachee, defaults, graph, cancelHref }: { id: string | null; ret: "kalender" | "akte"; coachees: { id: string; name: string; email: string }[]; fixedCoachee?: boolean; defaults: Defaults; graph: boolean; cancelHref: string }) {
  const [kind, setKind] = useState<Kind>(defaults.kind ?? "teams");
  const [start, setStart] = useState(defaults.start ?? "10:00");
  const [end, setEnd] = useState(defaults.end ?? "11:00");
  const [coachee, setCoachee] = useState(defaults.coachee_id ?? "");
  const [manualLink, setManualLink] = useState(Boolean(defaults.join_url) || !graph);
  const email = coachees.find((c) => c.id === coachee)?.email;

  return (
    <ActionForm action={saveAppointment.bind(null, id, ret)} className="space-y-4">
      <fieldset>
        <legend className="label">Art des Termins</legend>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <label key={k} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center text-[12px] font-semibold transition ${kind === k ? `${KINDS[k].chip} ring-2 ring-accent/20` : "border-line bg-surface text-muted hover:border-accent/40"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              <span className={`size-2 rounded-full ${KINDS[k].dot}`} />
              {KINDS[k].short}
            </label>
          ))}
        </div>
      </fieldset>

      {fixedCoachee ? (
        <input type="hidden" name="coachee_id" value={coachee} />
      ) : (
        <label className="block">
          <span className="label">Mit wem?</span>
          <select name="coachee_id" className="input" value={coachee} onChange={(e) => setCoachee(e.target.value)}>
            <option value="">Nur für mich (ohne Coachee)</option>
            {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label">Titel</span>
        <input name="title" className="input" defaultValue={defaults.title ?? ""} placeholder={kind === "teams" ? "z. B. Bewerbungsunterlagen besprechen" : "z. B. Finanzplan durchgehen"} maxLength={200} />
        <span className="hint block">Leer lassen ergibt „{KINDS[kind].short}: Name“.</span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="label">Datum</span>
          <input type="date" name="day" className="input" defaultValue={defaults.day} required />
        </label>
        <label className="block">
          <span className="label">Beginn</span>
          <input
            type="time"
            name="start"
            step={300}
            className="input"
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{2}:\d{2}$/.test(v) && /^\d{2}:\d{2}$/.test(start)) {
                const len = Math.max(Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3))), 15);
                setEnd(plus(v, len));
              }
              setStart(v);
            }}
            required
          />
        </label>
        <label className="block">
          <span className="label">Ende</span>
          <input type="time" name="end" step={300} className="input" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <div className="-mt-2 flex flex-wrap gap-1.5">
        {[30, 45, 60, 90, 120].map((m) => (
          <button key={m} type="button" onClick={() => setEnd(plus(start, m))} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted transition hover:border-accent/40 hover:text-accent">
            {m < 60 ? `${m} Min` : `${(m / 60).toLocaleString("de-DE")} Std`}
          </button>
        ))}
      </div>

      {kind === "teams" ? (
        <div className="rounded-xl border border-[#5b5fc7]/20 bg-[#f4f5ff] p-3">
          {graph && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="teams_auto" checked={!manualLink} onChange={(e) => setManualLink(!e.target.checked)} className="mt-1 accent-[#5b5fc7]" />
              <span><b>Teams-Besprechung automatisch erstellen</b><span className="block text-xs text-muted">Der Link entsteht in deinem Microsoft-Konto und steht in Einladung und Portal.</span></span>
            </label>
          )}
          {manualLink && (
            <label className={`block ${graph ? "mt-3" : ""}`}>
              <span className="label">Teams-Link</span>
              <input name="join_url" type="url" className="input" defaultValue={defaults.join_url ?? ""} placeholder="https://teams.microsoft.com/l/meetup-join/…" />
              <span className="hint block">{graph ? "Eigenen Link einfügen." : "In Teams oder Outlook eine Besprechung anlegen und den Link hier einfügen. Automatisch geht es, sobald Microsoft angebunden ist."}</span>
            </label>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="label">{kind === "telefon" ? "Telefonnummer oder wer ruft an" : "Ort"}</span>
          <input name="location" className="input" defaultValue={defaults.location ?? ""} placeholder={kind === "buero" ? "z. B. Büro Kuntsolutions, Raum 2" : kind === "telefon" ? "z. B. Coach ruft an" : "Adresse"} maxLength={300} />
        </label>
      )}

      <label className="block">
        <span className="label">Hinweis für den Termin</span>
        <textarea name="notes" className="input min-h-20" defaultValue={defaults.notes ?? ""} placeholder="z. B. Bitte Lebenslauf und Zeugnisse bereithalten." maxLength={5000} />
        <span className="hint block">Sieht der Coachee im Portal. Steht nicht in der Mail.</span>
      </label>

      {coachee && (
        <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <input type="checkbox" name="invite" defaultChecked={defaults.invited ?? true} className="mt-1 accent-[var(--accent)]" />
          <span>
            <b>{defaults.invited ? "Einladung aktualisieren" : "Einladung per Mail schicken"}</b>
            <span className="block text-xs text-muted">{email ? `an ${email}, mit Zusagen-Knopf für Outlook, Gmail und Handy` : "an die Mailadresse des Coachees"}</span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SubmitButton>{id ? "Änderungen speichern" : "Termin anlegen"}</SubmitButton>
        <Link href={cancelHref} scroll={false} className="btn-ghost">Abbrechen</Link>
      </div>
    </ActionForm>
  );
}
