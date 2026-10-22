"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { renameCv } from "@/app/actions/lebenslauf";
import { SubmitButton } from "../SubmitButton";

/** Name eines Lebenslaufs in der Liste, mit „Umbenennen“ direkt an Ort und Stelle */
export function CvName({ id, name, current }: { id: string; name: string; /** zuletzt geändert, wenn es mehrere gibt */ current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof renameCv>>, fd: FormData) => {
    const res = await renameCv(id, prev, fd);
    if (res?.ok) setEditing(false);
    return res;
  }, undefined);

  if (editing)
    return (
      <form action={action} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`cv-name-${id}`}>Name des Lebenslaufs</label>
        <input id={`cv-name-${id}`} name="name" className="input min-w-0 flex-1 basis-48 !py-2" defaultValue={name} required maxLength={120} autoFocus />
        <SubmitButton className="btn btn-sm tap" pendingText="Speichert …">Speichern</SubmitButton>
        <button type="button" className="btn-ghost btn-sm tap" onClick={() => setEditing(false)}>Abbrechen</button>
        {state?.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
      </form>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={`/lebenslauf/${id}`} className="h2 min-w-0 break-words hover:text-accent">{name}</Link>
      {current && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">aktuell</span>}
      <button type="button" className="tap -my-2 px-1 text-sm text-muted underline-offset-2 hover:text-accent hover:underline" onClick={() => setEditing(true)}>Umbenennen</button>
    </div>
  );
}
