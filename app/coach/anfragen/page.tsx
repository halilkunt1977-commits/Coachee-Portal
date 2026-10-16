import Link from "next/link";
import { leadStep, saveLead, type LeadStep } from "@/app/actions/anfragen";
import { ActionForm } from "@/components/akte/ActionForm";
import { PageHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/shell/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, formatDate, formatDateTime } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { todayBerlin } from "@/lib/calendar/dates";
import { query } from "@/lib/db";
import { ago } from "@/lib/inbox/time";

export const metadata = { title: "Anfragen" };

type Lead = {
  id: string;
  mail_id: string | null;
  source: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  coaching_type: "job" | "gruendung" | null;
  note: string;
  status: "neu" | "kontaktiert" | "termin" | "gewonnen" | "abgesagt";
  follow_up_on: string | null;
  log: { at: string; what: string }[];
  coachee_id: string | null;
  created_at: string;
};

const SOURCE: Record<string, string> = { avocons: "AVOCONS", erfolgspfad: "Erfolgspfad", telefon: "Telefon", empfehlung: "Empfehlung", sonstige: "Sonstige" };
const STATUS: Record<Lead["status"], [string, string]> = {
  neu: ["Neu", "bg-gold/15 text-[#8a6410]"],
  kontaktiert: ["Kontaktiert", "bg-accent/10 text-accent"],
  termin: ["Erstgespräch", "bg-accent/10 text-accent"],
  gewonnen: ["Coachee", "bg-[#2f9e5b]/12 text-[#237a46]"],
  abgesagt: ["Abgeschlossen", "bg-line text-muted"],
};

const name = (l: Lead) => `${l.first_name} ${l.last_name}`.trim() || "Ohne Namen";

/** Vorlage für die erste Mail; der Coach passt sie im eigenen Mailprogramm an */
const mailto = (l: Lead) => {
  const anrede = l.last_name ? `Guten Tag ${name(l)}` : "Guten Tag";
  const body = `${anrede},\n\nvielen Dank für Ihr Interesse an einem ${l.coaching_type === "gruendung" ? "Gründungscoaching" : l.coaching_type === "job" ? "Jobcoaching" : "Coaching"}. Ich bin Halil Kunt und würde Sie gern in einem kurzen Gespräch kennenlernen.\n\nWann passt es Ihnen in den nächsten Tagen für ein Telefonat?\n\nViele Grüße\nHalil Kunt`;
  return `mailto:${l.email}?subject=${encodeURIComponent("Ihre Coaching-Anfrage")}&body=${encodeURIComponent(body)}`;
};

const STEPS: { step: LeadStep; label: string; when: Lead["status"][]; primary?: boolean }[] = [
  { step: "angerufen", label: "Angerufen", when: ["neu", "kontaktiert"], primary: true },
  { step: "mail", label: "Mail geschrieben", when: ["neu", "kontaktiert"] },
  { step: "nicht_erreicht", label: "Nicht erreicht", when: ["neu", "kontaktiert"] },
  { step: "termin", label: "Erstgespräch vereinbart", when: ["neu", "kontaktiert"] },
  { step: "absagen", label: "Kein Coaching", when: ["neu", "kontaktiert", "termin"] },
  { step: "wieder_offen", label: "Wieder öffnen", when: ["abgesagt"] },
];

function LeadForm({ lead }: { lead?: Lead }) {
  return (
    <ActionForm action={saveLead.bind(null, lead?.id ?? null)} resetOnOk={!lead} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label !text-xs">Vorname</span><input name="first_name" className="input !py-2" defaultValue={lead?.first_name} maxLength={80} /></label>
        <label><span className="label !text-xs">Nachname</span><input name="last_name" className="input !py-2" defaultValue={lead?.last_name} maxLength={80} /></label>
        <label><span className="label !text-xs">Telefon</span><input name="phone" type="tel" className="input !py-2" defaultValue={lead?.phone ?? ""} maxLength={40} /></label>
        <label><span className="label !text-xs">E-Mail</span><input name="email" type="email" className="input !py-2" defaultValue={lead?.email ?? ""} maxLength={200} /></label>
        <label><span className="label !text-xs">Ort</span><input name="city" className="input !py-2" defaultValue={lead?.city ?? ""} maxLength={80} /></label>
        <label>
          <span className="label !text-xs">Coaching</span>
          <select name="coaching_type" className="input !py-2" defaultValue={lead?.coaching_type ?? ""}>
            <option value="">Noch offen</option>
            <option value="job">Jobcoaching</option>
            <option value="gruendung">Gründungscoaching</option>
          </select>
        </label>
        {!lead && (
          <label>
            <span className="label !text-xs">Woher</span>
            <select name="source" className="input !py-2" defaultValue="telefon">
              {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
        <label><span className="label !text-xs">Nachfassen am</span><input name="follow_up_on" type="date" className="input !py-2" defaultValue={lead?.follow_up_on ?? ""} /></label>
      </div>
      <label className="block"><span className="label !text-xs">Notiz</span><textarea name="note" rows={2} className="input" defaultValue={lead?.note} maxLength={5000} /></label>
      <div className="flex justify-end"><SubmitButton className="btn !py-2 text-sm">{lead ? "Speichern" : "Anfrage anlegen"}</SubmitButton></div>
    </ActionForm>
  );
}

function LeadCard({ l, today, highlight }: { l: Lead; today: string; highlight: boolean }) {
  const due = l.follow_up_on && l.follow_up_on <= today && (l.status === "neu" || l.status === "kontaktiert");
  const [label, tone] = STATUS[l.status];
  return (
    <article id={`a-${l.id}`} className={`card rise space-y-3 ${highlight ? "ring-2 ring-accent" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">{name(l)}</h3>
          <p className="text-xs text-muted">
            {SOURCE[l.source] ?? l.source} · {ago(l.created_at)}
            {l.coaching_type && ` · ${l.coaching_type === "job" ? "Jobcoaching" : "Gründungscoaching"}`}
            {l.city && ` · ${l.city}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {due && <span className="rounded-full bg-[#d9534f]/12 px-2.5 py-1 text-[11px] font-semibold text-[#b03a36]">Jetzt melden</span>}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>
        </div>
      </div>

      {(l.phone || l.email) && (
        <div className="flex flex-wrap gap-2">
          {l.phone && <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="btn !py-2 text-sm"><Icon name="chat" className="size-4" /> {l.phone}</a>}
          {l.email && <a href={mailto(l)} className="btn-ghost !py-2 text-sm"><Icon name="mail" className="size-4" /> {l.email}</a>}
        </div>
      )}
      {!l.phone && !l.email && l.status === "neu" && <p className="text-sm text-muted">Keine Telefonnummer oder Mail erkannt. Bitte in der Mail nachsehen und unten unter „Bearbeiten“ eintragen.</p>}
      {l.note && <p className="whitespace-pre-line text-sm">{l.note}</p>}

      {l.status !== "gewonnen" && (
        <div className="flex flex-wrap gap-1.5">
          {STEPS.filter((s) => s.when.includes(l.status)).map((s) => (
            <form key={s.step} action={leadStep.bind(null, l.id, s.step)}>
              <button className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${s.primary ? "border-accent/40 text-accent hover:bg-accent hover:text-white" : "border-line text-muted hover:border-accent/40 hover:text-accent"}`}>{s.label}</button>
            </form>
          ))}
          {l.status !== "abgesagt" && (
            <Link href={`/coach/neu?anfrage=${l.id}`} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90">Als Coachee anlegen</Link>
          )}
        </div>
      )}
      {l.status === "gewonnen" && l.coachee_id && <Link href={`/coach/coachees/${l.coachee_id}`} className="link text-sm">Zur Akte</Link>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {l.follow_up_on && l.status !== "gewonnen" && l.status !== "abgesagt" && <span>Nachfassen: {l.follow_up_on === today ? "heute" : formatDate(l.follow_up_on)}</span>}
        {l.mail_id && <Link href={`/coach/posteingang?mail=${l.mail_id}`} className="link">Mail ansehen</Link>}
      </div>

      <details className="group text-sm">
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted hover:text-accent">Verlauf und Bearbeiten</summary>
        <div className="mt-3 space-y-4">
          <ol className="space-y-1 border-l border-line pl-3 text-xs">
            {[...l.log].reverse().map((e, i) => <li key={i}><span className="text-muted">{formatDateTime(e.at)}</span> · {e.what}</li>)}
          </ol>
          <LeadForm lead={l} />
        </div>
      </details>
    </article>
  );
}

export default async function Leads({ searchParams }: PageProps<"/coach/anfragen">) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const highlight = typeof sp.anfrage === "string" ? sp.anfrage : "";
  const leads = await query<Lead>(
    `SELECT id, mail_id, source, first_name, last_name, email, phone, city, coaching_type, note, status, follow_up_on, log, coachee_id, created_at
       FROM leads WHERE coach_id = $1 AND (status IN ('neu','kontaktiert','termin') OR updated_at > now() - interval '60 days')
      ORDER BY follow_up_on NULLS LAST, created_at DESC`,
    [coach.id],
  );
  const today = todayBerlin();
  const now = leads.filter((l) => (l.status === "neu" || l.status === "kontaktiert") && !!l.follow_up_on && l.follow_up_on <= today);
  const contact = leads.filter((l) => !now.includes(l) && (l.status === "neu" || l.status === "kontaktiert" || l.status === "termin"));
  const closed = leads.filter((l) => l.status === "gewonnen" || l.status === "abgesagt");
  const section = (title: string, hint: string, items: Lead[], empty: string) => (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title} <span className="text-muted">{items.length}</span></h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {items.length ? items.map((l) => <LeadCard key={l.id} l={l} today={today} highlight={l.id === highlight} />) : <Empty>{empty}</Empty>}
    </section>
  );

  return (
    <>
      <PageHeader eyebrow="Akquise" title="Anfragen" description="Neue Coaching-Anfragen aus dem Postfach und von dir erfasste. Schnell melden, nachfassen, als Coachee anlegen." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {section("Jetzt melden", "Neu oder heute nachfassen", now, "Gerade wartet niemand auf deinen Anruf.")}
          {section("In Kontakt", "Gemeldet, Erstgespräch oder später nachfassen", contact, "Keine laufenden Anfragen.")}
          {closed.length > 0 && section("Abgeschlossen", "Letzte 60 Tage", closed, "")}
        </div>
        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-3 font-semibold">Anfrage selbst erfassen</h2>
            <p className="mb-3 text-xs text-muted">Zum Beispiel nach einem Anruf. Anfragen von AVOCONS aus dem Postfach erscheinen von allein.</p>
            <LeadForm />
          </section>
          <p className="px-1 text-xs text-muted">„Angerufen“ und „Mail geschrieben“ setzen das Nachfassen auf in zwei Tagen, „Nicht erreicht“ auf morgen. Wird jemand Coachee, landen die Mails dazu in der Akte.</p>
        </aside>
      </div>
    </>
  );
}
