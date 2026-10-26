import Link from "next/link";
import { inboxApply, inboxJobStatus, inboxToggleTask, markAllInboxRead } from "@/app/actions/posteingang";
import { MessageForm } from "@/components/akte/MessageForm";
import { MESSAGE_COLUMNS, MessageList, type Message } from "@/components/akte/Lists";
import { ComposeButton } from "@/components/teilen/ComposeButton";
import { InboxCard } from "@/components/posteingang/InboxCard";
import { PageHeader } from "@/components/shell/AppShell";
import { Icon, type IconName } from "@/components/shell/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, formatDate } from "@/components/ui";
import { ownCoachee } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { dayMedium, isKind, KINDS } from "@/lib/calendar/dates";
import { inboxEntries, inboxThread, type InboxEntry, type InboxThread } from "@/lib/coachee-inbox";
import { one, query } from "@/lib/db";
import { categoryLabel } from "@/lib/documents";
import { statusLabel, STATUS_TONE, type Status } from "@/lib/jobs/shared";

export const metadata = { title: "Posteingang" };

const TZ = "Europe/Berlin";
const berlinDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** „14:05“ heute, „Gestern“, „Mo“ in dieser Woche, sonst „12.10.“ */
function when(iso: string, now: Date) {
  const d = new Date(iso);
  const day = berlinDay(d);
  if (day === berlinDay(now)) return time(iso);
  if (day === berlinDay(new Date(now.getTime() - 86_400_000))) return "Gestern";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("de-DE", { weekday: "short", timeZone: TZ }).replace(".", "");
  const sameYear = day.slice(0, 4) === berlinDay(now).slice(0, 4);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", ...(sameYear ? {} : { year: "2-digit" }), timeZone: TZ });
}

function group(iso: string, now: Date) {
  const day = berlinDay(new Date(iso));
  if (day === berlinDay(now)) return "Heute";
  if (day === berlinDay(new Date(now.getTime() - 86_400_000))) return "Gestern";
  if (now.getTime() - new Date(iso).getTime() < 7 * 86_400_000) return "Diese Woche";
  return "Früher";
}

type Item = { at: string; key: string } & ({ thread: InboxThread } | { entry: InboxEntry });

const TONE: Record<InboxEntry["kind"] | "nachrichten", { icon: IconName; tone: string }> = {
  nachrichten: { icon: "chat", tone: "bg-tint text-accent" },
  aufgabe: { icon: "flag", tone: "bg-gold-soft text-[#7a5520]" },
  stelle: { icon: "briefcase", tone: "bg-[#eef0ff] text-[#3d3f9a]" },
  anschreiben: { icon: "doc", tone: "bg-ok-soft text-ok" },
  dokument: { icon: "folder", tone: "bg-surface-2 text-ink" },
  termin: { icon: "calendar", tone: "bg-tint text-accent" },
  lebenslauf: { icon: "idcard", tone: "bg-tint text-accent" },
  businessplan: { icon: "doc", tone: "bg-tint text-accent" },
  finanzplan: { icon: "chart", tone: "bg-ok-soft text-ok" },
  vorbereitung: { icon: "chat", tone: "bg-[#efe7f8] text-[#6b3fa0]" },
};

export default async function CoacheeInbox({ searchParams }: PageProps<"/mein-bereich/posteingang">) {
  const user = await requireUser("coachee");
  const c = await ownCoachee(user);
  if (!c) return <Empty>Für deinen Zugang ist noch keine Coaching-Akte angelegt. Bitte melde dich bei deinem Coach.</Empty>;
  const sp = await searchParams;
  const focus = typeof sp.offen === "string" ? sp.offen : null;

  const [entries, thread, coach, messages] = await Promise.all([
    inboxEntries(c.id),
    inboxThread(c.id, user.id),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [c.coach_id]),
    query<Message>(
      `SELECT * FROM (SELECT ${MESSAGE_COLUMNS}
                        FROM messages m LEFT JOIN users u ON u.id = m.author_id
                       WHERE m.coachee_id = $1 ORDER BY m.created_at DESC LIMIT 40) x ORDER BY created_at`,
      [c.id],
    ),
  ]);
  const coachName = coach?.name ?? "Dein Coach";
  const coachFirst = coachName.split(" ")[0];
  const now = new Date();

  const items: Item[] = [...(thread ? [{ at: thread.at, key: "nachrichten", thread }] : []), ...entries.map((entry) => ({ at: entry.at, key: entry.id, entry }))].sort((a, b) => b.at.localeCompare(a.at));
  const unread = (thread?.unread ?? 0) + entries.filter((e) => e.unread).length;
  const groups: { label: string; items: Item[] }[] = [];
  for (const it of items) {
    const label = group(it.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  const threadBody = (
    <>
      {messages.length > 0 && <MessageList messages={messages} selfId={user.id} />}
      <MessageForm coacheeId={c.id} placeholder={`Antwort an ${coachFirst} …`} />
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow="Von deinem Coach"
        title="Posteingang"
        description={`Nachrichten, Aufgaben, Stellen, Anschreiben, Dokumente und Termine von ${coachName}, das Neueste oben. Antworte direkt hier. Eigene Sachen zeigst du deinem Coach überall mit „Dem Coach zeigen“.`}
        actions={
          <>
            {unread > 0 && (
              <form action={markAllInboxRead}>
                <SubmitButton className="btn-ghost btn-sm" pendingText="Einen Moment …">Alle gelesen</SubmitButton>
              </form>
            )}
            <ComposeButton recipient={coachFirst} />
          </>
        }
      />
      <div className="max-w-3xl space-y-6">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className={`grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs font-bold tabular-nums ${unread ? "bg-danger text-white" : "bg-surface-2"}`}>{unread}</span>
          {unread === 0 ? "Alles gelesen." : unread === 1 ? "neuer Eintrag" : "neue Einträge"}
        </p>

        {!thread && (
          <ul>
            <InboxCard id="nachrichten" icon="chat" tone={TONE.nachrichten.tone} label="Nachricht" when="" title={`${coachFirst} schreiben`} preview="Fragen, Rückmeldungen oder ein kurzes Update. Dein Coach bekommt Bescheid." unread={false} initiallyOpen={focus === "nachrichten"}>
              {threadBody}
            </InboxCard>
          </ul>
        )}

        {items.length === 0 && <Empty>Hier landet alles, was dein Coach dir schickt: Nachrichten, Aufgaben, Stellenvorschläge, Anschreiben, Lebensläufe, Dokumente und Termine.</Empty>}

        {groups.map((g) => (
          <section key={g.label} className="space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{g.label}</h2>
            <ul className="space-y-2">
              {g.items.map((it) =>
                "thread" in it ? (
                  <InboxCard
                    key={it.key}
                    id="nachrichten"
                    icon={TONE.nachrichten.icon}
                    tone={TONE.nachrichten.tone}
                    label={`Nachrichten · ${coachName}`}
                    when={when(it.at, now)}
                    title={it.thread.unread ? (it.thread.unread === 1 ? "Neue Nachricht" : `${it.thread.unread} neue Nachrichten`) : `Gespräch mit ${coachFirst}`}
                    preview={`${it.thread.mine ? "Du: " : ""}${it.thread.preview}`}
                    unread={it.thread.unread}
                    initiallyOpen={focus === "nachrichten"}
                  >
                    {threadBody}
                  </InboxCard>
                ) : (
                  <Entry key={it.key} e={it.entry} when={when(it.at, now)} open={focus === it.entry.id} />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function Entry({ e, when, open }: { e: InboxEntry; when: string; open: boolean }) {
  const from = e.actor ? `Von ${e.actor}` : "Von deinem Coach";
  const common = { id: e.id, icon: TONE[e.kind].icon, tone: TONE[e.kind].tone, when, unread: e.unread, initiallyOpen: open };
  // Notiz, die der Coach beim Schicken dazugeschrieben hat
  const note = e.kind !== "termin" && e.note ? (
    <p className="rounded-lg bg-tint/50 px-3 py-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><span className="font-semibold text-accent">{e.actor?.split(" ")[0] ?? "Dein Coach"}: </span>{e.note}</p>
  ) : null;
  const notePreview = e.kind !== "termin" && e.note ? `„${e.note}“` : null;

  if (e.kind === "aufgabe") {
    const t = e.task;
    const today = berlinDay(new Date());
    return (
      <InboxCard {...common} label="Aufgabe" title={t.title} done={Boolean(t.done_at)} preview={notePreview ?? (t.done_at ? "Erledigt" : t.due_on ? `bis ${formatDate(t.due_on)}${t.details ? ` · ${t.details}` : ""}` : t.details)}>
        {note}
        {t.details && <p className="whitespace-pre-wrap break-words text-[15px] [overflow-wrap:anywhere]">{t.details}</p>}
        <p className="text-xs text-muted">
          {from}
          {t.due_on && !t.done_at && <span className={t.due_on < today ? "font-semibold text-danger" : ""}> · zu erledigen bis {formatDate(t.due_on)}</span>}
          {t.done_at && <> · erledigt am {formatDate(t.done_at)}</>}
        </p>
        <Actions>
          <form action={inboxToggleTask.bind(null, e.id, t.id)}>
            {t.done_at ? (
              <SubmitButton className="btn-ghost btn-sm" pendingText="Einen Moment …">Wieder öffnen</SubmitButton>
            ) : (
              <SubmitButton className="btn btn-sm" pendingText="Wird abgehakt …">✓ Erledigt</SubmitButton>
            )}
          </form>
          <Link href="/mein-bereich/aufgaben" className="btn-ghost btn-sm">Alle Aufgaben</Link>
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "stelle") {
    const j = e.job;
    const proposal = j.status === "vorschlag";
    return (
      <InboxCard {...common} label={proposal ? "Stellenvorschlag" : "Stelle"} title={j.title} preview={notePreview ?? ([j.employer, j.location].filter(Boolean).join(" · ") || undefined)}>
        {note}
        <div className="space-y-1">
          <p className="text-[15px] break-words">{[j.employer, j.location].filter(Boolean).join(" · ") || "Ohne Arbeitgeberangabe"}</p>
          <p className="text-xs text-muted">
            {from}
            {!proposal && <> · <span className={`badge !px-2 !py-0 ${STATUS_TONE[j.status as Status] ?? ""}`}>{statusLabel(j.status as Status)}</span></>}
          </p>
        </div>
        {j.reason && j.reason !== e.note && <p className="rounded-lg bg-tint/50 px-3 py-2 text-sm break-words"><span className="font-semibold text-accent">Warum es passt: </span>{j.reason}</p>}
        <Actions>
          {proposal ? (
            <>
              <form action={inboxApply.bind(null, e.id, j.id)}><SubmitButton className="btn btn-sm" pendingText="Einen Moment …">Bewerben</SubmitButton></form>
              <form action={inboxJobStatus.bind(null, e.id, j.id, "gemerkt")}><SubmitButton className="btn-ghost btn-sm" pendingText="Wird gemerkt …">Merken</SubmitButton></form>
            </>
          ) : (
            j.status === "gemerkt" && <Link href={`/anschreiben/${j.id}`} className="btn btn-sm">Bewerben</Link>
          )}
          {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">Anzeige ansehen ↗</a>}
          <Link href={`/mein-bereich/bewerbungen?stelle=${j.id}`} className="btn-ghost btn-sm">In Bewerbungen</Link>
          {proposal && (
            <form action={inboxJobStatus.bind(null, e.id, j.id, "verworfen")}><SubmitButton className="btn-ghost btn-sm text-muted" pendingText="Einen Moment …">Passt nicht</SubmitButton></form>
          )}
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "anschreiben") {
    const j = e.job;
    return (
      <InboxCard {...common} label="Anschreiben vorbereitet" title={j.title} preview={notePreview ?? `${j.employer ? `${j.employer} · ` : ""}Dein Anschreiben liegt bereit.`}>
        {note}
        <p className="text-[15px]">Für deine Bewerbung{j.employer ? ` bei ${j.employer}` : ""} liegt ein Anschreiben bereit. Lies es durch, pass es an, wo du magst, und lade es als PDF oder Word herunter.</p>
        <p className="text-xs text-muted">{from}</p>
        <Actions>
          <Link href={`/anschreiben/${j.id}`} className="btn btn-sm">Anschreiben öffnen</Link>
          <Link href={`/mein-bereich/bewerbungen?stelle=${j.id}`} className="btn-ghost btn-sm">In Bewerbungen</Link>
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "vorbereitung") {
    const j = e.job;
    return (
      <InboxCard {...common} label="Gesprächsvorbereitung" title={j.title} preview={notePreview ?? `${j.employer ? `${j.employer} · ` : ""}Deine Vorbereitung aufs Vorstellungsgespräch.`}>
        {note}
        <p className="text-[15px]">Für dein Gespräch{j.employer ? ` bei ${j.employer}` : ""} habe ich dir die wichtigsten Fragen mit Antwortideen, Tipps zum Auftreten und Fragen an den Arbeitgeber zusammengestellt. Lies alles in Ruhe durch und sprich die Antworten ein paarmal laut, in deinen eigenen Worten.</p>
        <p className="text-xs text-muted">{from}</p>
        <Actions>
          <Link href={`/mein-bereich/bewerbungen/${j.id}/vorbereitung`} className="btn btn-sm">Vorbereitung öffnen</Link>
          <Link href={`/mein-bereich/bewerbungen?stelle=${j.id}`} className="btn-ghost btn-sm">In Bewerbungen</Link>
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "dokument") {
    const d = e.doc;
    return (
      <InboxCard {...common} label="Dokument" title={d.title} preview={notePreview ?? categoryLabel(d.category)}>
        {note}
        <p className="text-xs text-muted">{from} · {categoryLabel(d.category)}</p>
        <Actions>
          <a href={`/api/dateien/${d.file_id}`} target="_blank" rel="noreferrer" className="btn btn-sm">Öffnen</a>
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "lebenslauf") {
    return (
      <InboxCard {...common} label="Lebenslauf" title={e.cv.name} preview={notePreview ?? "Dein Coach hat dir deinen Lebenslauf geschickt."}>
        {note}
        <p className="text-xs text-muted">{from}</p>
        <Actions>
          <Link href={`/lebenslauf/${e.cv.id}`} className="btn btn-sm">Lebenslauf öffnen</Link>
          <a href={`/api/lebenslauf/${e.cv.id}/pdf`} className="btn-ghost btn-sm">PDF</a>
        </Actions>
      </InboxCard>
    );
  }

  if (e.kind === "businessplan" || e.kind === "finanzplan") {
    const bp = e.kind === "businessplan";
    return (
      <InboxCard {...common} label={bp ? "Businessplan" : "Finanzplan"} title={e.plan.title} preview={notePreview ?? (bp ? "Schau dir deinen Businessplan an." : "Schau dir deinen Finanzplan an.")}>
        {note}
        <p className="text-xs text-muted">{from}</p>
        <Actions>
          <Link href={bp ? "/mein-bereich/businessplan" : "/mein-bereich/finanzplan"} className="btn btn-sm">{bp ? "Businessplan öffnen" : "Finanzplan öffnen"}</Link>
        </Actions>
      </InboxCard>
    );
  }

  const a = e.appt;
  const cancelled = a.status === "abgesagt" || e.note === "abgesagt";
  const label = cancelled ? "Termin abgesagt" : e.note === "geaendert" ? "Termin geändert" : "Neuer Termin";
  const kind = isKind(a.kind) ? KINDS[a.kind].label : "Termin";
  return (
    <InboxCard {...common} label={label} title={a.title} done={cancelled} preview={`${dayMedium(a.day)}, ${a.start}–${a.end} Uhr · ${kind}`}>
      <p className="text-[15px]"><span className="font-semibold">{dayMedium(a.day)}</span>, {a.start}–{a.end} Uhr · {kind}</p>
      <p className="text-xs text-muted">{from}{cancelled ? " · Dieser Termin findet nicht statt." : ""}</p>
      <Actions>
        <Link href={`/mein-bereich/kalender?datum=${a.day}&termin=${a.id}`} className="btn btn-sm"><Icon name="calendar" className="size-4" /> Im Kalender</Link>
        {a.join_url && !cancelled && <a href={a.join_url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Teams-Link ↗</a>}
      </Actions>
    </InboxCard>
  );
}

const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
