"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Frage, Vorschlag } from "@/lib/bp/fragen";
import { SaveBadge, useAutosave } from "./useAutosave";
import { useT } from "@/components/i18n/LangProvider";

/*
 * Fragen an den Coachee: Der Coach sieht, was für Businessplan und Finanzplan noch fehlt, wählt aus und schickt die Fragen.
 * Der Coachee beantwortet sie und schickt sie an den Coach zurück.
 */

const post = (href: string, body: unknown) =>
  fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ error: "Keine Verbindung." })) as Promise<{ fragen?: Frage[]; vorschlaege?: Vorschlag[]; error?: string; run?: unknown }>;

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");

function Head({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  const t = useT();
  return (
    <section className="card overflow-hidden !p-0">
      <div className="space-y-2 bg-accent px-4 py-4 text-white sm:px-6">
        <button type="button" className="text-sm text-white/80 hover:text-white" onClick={onBack}>← {t("Zur Übersicht")}</button>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{title}</h2>
        <p className="text-sm text-white/75">{text}</p>
      </div>
    </section>
  );
}

function Block({ title, count, children, tone }: { title: string; count?: number; children: ReactNode; tone?: "ok" | "warn" }) {
  return (
    <section className={`card space-y-3 ${tone === "ok" ? "ring-2 ring-ok/40" : tone === "warn" ? "ring-2 ring-gold/50" : ""}`}>
      <h3 className="h3 flex items-center gap-2">
        {title}
        {count != null && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/* ---------- Coach ---------- */

type Pick = { frage: string; quelle: string; on: boolean };

export function FragenCoach({ href, gesamtHref, ai, vorname, onBack }: { href: string; gesamtHref: string; ai: boolean; vorname: string; onBack: () => void }) {
  const t = useT();
  const [fragen, setFragen] = useState<Frage[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (msg) msgRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [msg]);

  function take(res: { fragen?: Frage[]; vorschlaege?: Vorschlag[]; error?: string }) {
    if (res.fragen) setFragen(res.fragen);
    if (res.vorschlaege) setPicks(res.vorschlaege.map((v) => ({ ...v, on: false })));
    if (res.error) setMsg({ ok: false, text: res.error });
  }

  useEffect(() => {
    let live = true;
    fetch(href)
      .then((r) => r.json())
      .then((res) => live && take(res))
      .catch(() => live && setMsg({ ok: false, text: "Keine Verbindung." }));
    return () => {
      live = false;
    };
  }, [href]);

  const answered = (fragen ?? []).filter((f) => f.status === "beantwortet");
  const waiting = (fragen ?? []).filter((f) => f.status === "offen");
  const done = (fragen ?? []).filter((f) => f.status === "erledigt");
  const chosen = picks.filter((p) => p.on && p.frage.trim());
  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    picks.forEach((p, i) => m.set(p.quelle || "Eigene Fragen", [...(m.get(p.quelle || "Eigene Fragen") ?? []), i]));
    return [...m.entries()];
  }, [picks]);

  async function send() {
    if (!chosen.length) return;
    setBusy(true);
    setMsg(null);
    const res = await post(href, { send: chosen.map(({ frage, quelle }) => ({ frage: frage.trim(), quelle })) });
    setBusy(false);
    take(res);
    if (!res.error) setMsg({ ok: true, text: t("{n} Fragen an {name} geschickt. {name} bekommt eine Nachricht aufs Handy.", { n: chosen.length, name: vorname }) });
  }

  async function einarbeiten() {
    if (!answered.length) return;
    setBusy(true);
    setMsg(null);
    const text = `Antworten von ${vorname} auf meine Fragen. Bitte in den Businessplan und, wo es passt, in die Angaben zum Finanzplan einarbeiten:\n\n${answered.map((f, i) => `${i + 1}. Frage: ${f.frage}\nAntwort: ${f.antwort.trim()}`).join("\n\n")}`;
    const res = await post(gesamtHref, { message: text });
    if (res.error) {
      setBusy(false);
      setMsg({ ok: false, text: res.error });
      return;
    }
    take(await post(href, { erledigt: answered.map((f) => f.id) }));
    setBusy(false);
    setMsg({ ok: true, text: t("Die Antworten werden eingearbeitet. Die Änderungen siehst du im Businessplan fürs Amt unter „KI“ und kannst sie dort übernehmen.") });
  }

  async function erledigt(ids: string[]) {
    setBusy(true);
    take(await post(href, { erledigt: ids }));
    setBusy(false);
  }

  async function remove(id: string) {
    take(await post(href, { delete: id }));
  }

  function addOwn() {
    const f = own.trim();
    if (!f) return;
    setPicks((x) => [{ frage: f, quelle: "Eigene Fragen", on: true }, ...x]);
    setOwn("");
  }

  return (
    <div className="space-y-4">
      <Head title={t("Fragen an {name}", { name: vorname })} text={t("Du siehst, was für Businessplan und Finanzplan noch fehlt. Wähle aus, welche Fragen {name} beantworten soll, und schick sie ab.", { name: vorname })} onBack={onBack} />
      {msg && <p ref={msgRef} className={`card text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{t(msg.text)}</p>}
      {!fragen ? (
        <p className="card text-sm text-muted">{t("Wird geladen …")}</p>
      ) : (
        <>
          {answered.length > 0 && (
            <Block title={t("Beantwortet von {name}", { name: vorname })} count={answered.length} tone="ok">
              <ul className="space-y-3">
                {answered.map((f) => (
                  <li key={f.id} className="rounded-xl border border-line-soft p-3">
                    <p className="text-sm font-semibold">{f.frage}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[15px]">{f.antwort}</p>
                    <p className="mt-1 text-xs text-muted">{t("Beantwortet am {zeit}", { zeit: day(f.answered_at) })}</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {ai && <button type="button" className="btn" disabled={busy} onClick={() => void einarbeiten()}>✦ {t("Antworten in den Plan einarbeiten")}</button>}
                <button type="button" className={ai ? "btn-ghost" : "btn"} disabled={busy} onClick={() => void erledigt(answered.map((f) => f.id))}>{t("Als erledigt markieren")}</button>
              </div>
            </Block>
          )}

          {waiting.length > 0 && (
            <Block title={t("Wartet auf {name}", { name: vorname })} count={waiting.length}>
              <ul className="divide-y divide-line-soft">
                {waiting.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0 text-sm">
                      {f.frage}
                      <span className="block text-xs text-muted">{t("Geschickt am {zeit}", { zeit: day(f.created_at) })}{f.antwort.trim() ? ` · ${t("Antwort angefangen")}` : ""}</span>
                    </span>
                    <button type="button" className="shrink-0 text-xs text-muted hover:text-danger" onClick={() => void remove(f.id)}>{t("Zurücknehmen")}</button>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title={t("Was noch fehlt")} count={picks.length}>
            <p className="text-sm text-muted">{t("Vorschläge aus dem Plan, der Prüfung des Finanzplans und den Bankangaben. Hake an, was {name} beantworten soll. Den Text kannst du vorher ändern.", { name: vorname })}</p>
            <div className="flex gap-2">
              <input className="input" value={own} placeholder={t("Eigene Frage hinzufügen")} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOwn())} />
              <button type="button" className="btn-ghost shrink-0" disabled={!own.trim()} onClick={addOwn}>{t("Hinzufügen")}</button>
            </div>
            {!picks.length && <p className="text-sm text-muted">{t("Gerade fehlt nichts. Eigene Fragen kannst du oben hinzufügen.")}</p>}
            {groups.map(([quelle, idx]) => (
              <div key={quelle} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="eyebrow">{t(quelle)}</p>
                  <button type="button" className="text-xs text-muted hover:text-accent" onClick={() => setPicks((x) => { const all = idx.every((i) => x[i].on); return x.map((p, i) => (idx.includes(i) ? { ...p, on: !all } : p)); })}>
                    {idx.every((i) => picks[i].on) ? t("Keine") : t("Alle")}
                  </button>
                </div>
                {idx.map((i) => (
                  <label key={i} className={`flex items-start gap-3 rounded-xl border p-2 ${picks[i].on ? "border-accent bg-accent/5" : "border-line-soft"}`}>
                    <input type="checkbox" className="mt-2 size-4 shrink-0" checked={picks[i].on} onChange={(e) => setPicks((x) => x.map((p, j) => (j === i ? { ...p, on: e.target.checked } : p)))} />
                    <textarea className="input min-h-0 flex-1 resize-y !py-1.5 text-sm [field-sizing:content]" rows={2} value={picks[i].frage} onChange={(e) => setPicks((x) => x.map((p, j) => (j === i ? { ...p, frage: e.target.value, on: true } : p)))} />
                  </label>
                ))}
              </div>
            ))}
            <div className="sticky bottom-3 flex justify-end">
              <button type="button" className="btn shadow-lg" disabled={busy || !chosen.length} onClick={() => void send()}>{t("Ausgewählte an {name} schicken ({n})", { name: vorname, n: chosen.length })}</button>
            </div>
          </Block>

          {done.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold">{t("Erledigt")} ({done.length})</summary>
              <ul className="mt-3 space-y-2">
                {done.map((f) => (
                  <li key={f.id} className="text-sm">
                    <span className="font-semibold">{f.frage}</span>
                    {f.antwort.trim() && <span className="block whitespace-pre-wrap text-muted">{f.antwort}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Coachee ---------- */

export function FragenCoachee({ href, onBack }: { href: string; onBack: () => void }) {
  const t = useT();
  const [fragen, setFragen] = useState<Frage[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const latest = useRef(drafts);
  useEffect(() => {
    latest.current = drafts;
  }, [drafts]);

  function take(res: { fragen?: Frage[]; error?: string }) {
    if (res.fragen) {
      setFragen(res.fragen);
      setDrafts(Object.fromEntries(res.fragen.filter((f) => f.status === "offen").map((f) => [f.id, f.antwort])));
    }
    if (res.error) setMsg({ ok: false, text: res.error });
  }

  useEffect(() => {
    let live = true;
    fetch(href)
      .then((r) => r.json())
      .then((res) => live && take(res))
      .catch(() => live && setMsg({ ok: false, text: "Keine Verbindung." }));
    return () => {
      live = false;
    };
  }, [href]);

  const { state, schedule, save } = useAutosave(async () => {
    const res = await post(href, { answers: latest.current });
    return res.fragen ? { ok: true } : { ok: false, error: res.error };
  });

  const open = (fragen ?? []).filter((f) => f.status === "offen");
  const sent = (fragen ?? []).filter((f) => f.status !== "offen");
  const filled = open.filter((f) => (drafts[f.id] ?? "").trim()).length;

  async function submit() {
    setSending(true);
    setMsg(null);
    await save();
    const res = await post(href, { answers: latest.current, submit: true });
    setSending(false);
    take(res);
    if (!res.error) setMsg({ ok: true, text: t("Danke! Deine Antworten sind bei deinem Coach.") });
  }

  return (
    <div className="space-y-4">
      <Head title={t("Fragen von deinem Coach")} text={t("Damit dein Businessplan und Finanzplan fertig werden, braucht dein Coach noch ein paar Antworten von dir. Schreib einfach in deinen eigenen Worten.")} onBack={onBack} />
      {msg && <p className={`card text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{t(msg.text)}</p>}
      {!fragen ? (
        <p className="card text-sm text-muted">{t("Wird geladen …")}</p>
      ) : (
        <>
          {open.length > 0 ? (
            <Block title={t("Bitte beantworten")} count={open.length} tone="warn">
              <ol className="space-y-4">
                {open.map((f, i) => (
                  <li key={f.id} className="space-y-1.5">
                    <label htmlFor={`f-${f.id}`} className="block text-sm font-semibold">{i + 1}. {f.frage}</label>
                    <textarea
                      id={`f-${f.id}`}
                      className="input min-h-24 resize-y [field-sizing:content]"
                      value={drafts[f.id] ?? ""}
                      placeholder={t("Deine Antwort")}
                      onChange={(e) => {
                        setDrafts((d) => ({ ...d, [f.id]: e.target.value }));
                        schedule();
                      }}
                    />
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
                <span className="text-xs text-muted">
                  {t("{a} von {b} beantwortet", { a: filled, b: open.length })} · <SaveBadge state={state} />
                </span>
                <button type="button" className="btn" disabled={sending || !filled} onClick={() => void submit()}>{t("An Coach schicken")}</button>
              </div>
              {filled > 0 && filled < open.length && <p className="text-xs text-muted">{t("Du kannst auch schon einen Teil schicken. Die übrigen Fragen bleiben hier stehen.")}</p>}
            </Block>
          ) : (
            <p className="card text-sm text-muted">{sent.length ? t("Alles beantwortet. Wenn dein Coach noch etwas braucht, steht es hier.") : t("Dein Coach hat dir gerade keine Fragen gestellt. Wenn es welche gibt, bekommst du eine Nachricht.")}</p>
          )}
          {sent.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold">{t("Schon geschickt")} ({sent.length})</summary>
              <ul className="mt-3 space-y-3">
                {sent.map((f) => (
                  <li key={f.id} className="text-sm">
                    <span className="font-semibold">{f.frage}</span>
                    <span className="block whitespace-pre-wrap text-muted">{f.antwort}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
