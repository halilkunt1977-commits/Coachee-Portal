"use client";
import { useState, useTransition } from "react";
import { saveSimli } from "@/app/actions/simli";

/** Coach trägt den Simli-Schlüssel ein (wird geprüft, verschlüsselt gespeichert, nie wieder angezeigt) */
export function SimliKeyForm({ active, fromEnv }: { active: boolean; fromEnv: boolean }) {
  const [key, setKey] = useState("");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (value: string) =>
    start(async () => {
      setMsg(null);
      const r = await saveSimli(value);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setKey("");
    });
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Interview-Training: echt wirkender Mensch</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-ok/15 text-ok" : "bg-line-soft text-muted"}`}>{active ? "aktiv" : "aus, gezeichnete Person"}</span>
      </div>
      <p className="text-sm text-muted">Mit einem Schlüssel von Simli sitzt im Interview-Training ein echt wirkender Mensch gegenüber, der die Fragen spricht. Der Schlüssel wird geprüft, verschlüsselt gespeichert und nicht wieder angezeigt.</p>
      {fromEnv ? (
        <p className="text-sm">Der Schlüssel ist in Coolify eingetragen.</p>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) run(key);
          }}
        >
          <input type="password" autoComplete="off" spellCheck={false} className="input min-w-0 flex-1 basis-60" placeholder={active ? "Neuen Schlüssel einfügen" : "Simli-Schlüssel einfügen"} value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="submit" className="btn" disabled={busy || !key.trim()}>{busy ? "Wird geprüft …" : "Prüfen und speichern"}</button>
          {active && <button type="button" className="btn-ghost" disabled={busy} onClick={() => run("")}>Entfernen</button>}
        </form>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
    </section>
  );
}
