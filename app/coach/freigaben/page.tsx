import Link from "next/link";
import { SetupHint } from "@/components/coach/SetupHint";
import { greetingVoiceEnabled } from "@/lib/greeting-audio";
import { FeatureToggle } from "@/components/features/FeatureToggle";
import { LimitForm, MonthMeter, UsageLine } from "@/components/features/Parts";
import { Avatar, PageHeader } from "@/components/shell/AppShell";
import { Empty, formatDate } from "@/components/ui";
import { fullName, typeLabel, type Coachee } from "@/lib/access";
import { requireCoach } from "@/lib/auth";
import { query } from "@/lib/db";
import { limitOf, usageFor, type CoacheeUsage } from "@/lib/feature-usage";
import { FEATURES, defaultMonthlyLimit, hasFeature, type Feature } from "@/lib/features";

export const metadata = { title: "Freigaben" };

type Row = Coachee & { has_login: boolean };

const applies = (f: Feature, c: Row) => (f.types as readonly string[]).includes(c.coaching_type);

/** Übersicht: welcher Coachee welche Zusatzfunktion nutzen darf und wie viel er sie nutzt. Umschalten wirkt sofort. */
export default async function Freigaben() {
  const coach = await requireCoach();
  const [rows, usage] = await Promise.all([
    query<Row>(
      `SELECT c.*, (u.password_hash IS NOT NULL) AS has_login FROM coachees c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.coach_id = $1 AND c.archived_at IS NULL ORDER BY c.first_name, c.last_name`,
      [coach.id],
    ),
    usageFor(coach.id),
  ]);
  const running = rows.filter((c) => c.status !== "abgeschlossen");
  const closed = rows.filter((c) => c.status === "abgeschlossen");

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Freigaben"
        description="Welche Hilfen deine Coachees selbst nutzen dürfen und wie oft sie sie nutzen. Ein Klick auf den Schalter gibt frei oder sperrt, sofort."
      />
      <div className="space-y-6">
        <section className="grid gap-3 md:grid-cols-3">
          {FEATURES.map((f, i) => {
            const pool = running.filter((c) => applies(f, c));
            const on = pool.filter((c) => hasFeature(c, f.key)).length;
            const month = running.reduce((a, c) => a + usage.get(c.id).features[f.key].month, 0);
            return (
              <div key={f.key} className="rise card space-y-2 !p-4" style={{ ["--i" as string]: i + 1 }}>
                <p className="font-semibold">{f.label}</p>
                <p className="text-xs text-muted">{f.description}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-sm">
                  <span><b className="tabular-nums">{on}</b> von {pool.length} freigegeben</span>
                  <span className="text-muted"><b className="text-ink tabular-nums">{month}</b> Aufrufe diesen Monat</span>
                </p>
              </div>
            );
          })}
        </section>

        <section className="space-y-3">
          <h2 className="h2">Laufende Coachings</h2>
          {running.length ? <Matrix rows={running} usage={usage} /> : <Empty>Keine laufenden Coachings.</Empty>}
        </section>

        {closed.length > 0 && (
          <details className="group space-y-3">
            <summary className="h2 cursor-pointer list-none text-muted hover:text-ink">
              <span className="inline-block transition group-open:rotate-90">›</span> Abgeschlossene Coachings ({closed.length})
            </summary>
            <div className="pt-3">
              <Matrix rows={closed} usage={usage} />
            </div>
          </details>
        )}

        <p className="text-xs text-muted">
          Gezählt werden nur Aufrufe, die der Coachee selbst auslöst, nicht deine eigenen in der Akte. Ohne eigene Grenze gelten {defaultMonthlyLimit()} Aufrufe pro Monat.
          Neue Coachees starten ohne Freigaben. Coachees sehen nur die freigegebenen Hilfen, ohne Hinweis auf KI; was nur du nutzen kannst
          (Assistent, Businessplan-Entwürfe, Stellensuche, Formulierungen im Lebenslauf), steht hier nicht.
        </p>
        {!greetingVoiceEnabled() && (
          <div className="text-xs text-muted">
            <p>Erklärvideo: Die Begrüßung mit Vornamen steht gerade nur als Text auf der Titelkarte, ohne gesprochenen Gruß.</p>
            <SetupHint>Für die gesprochene Begrüßung in den Einstellungen der App ELEVENLABS_API_KEY eintragen, dann neu starten.</SetupHint>
          </div>
        )}
      </div>
    </>
  );
}

function Matrix({ rows, usage }: { rows: Row[]; usage: { get: (id: string) => CoacheeUsage } }) {
  return (
    <>
      {/* Breite Bildschirme: Tabelle Coachees × Funktionen */}
      <div className="card hidden !p-0 xl:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line-soft">
              <th className="px-4 py-3 font-medium">Coachee</th>
              {FEATURES.map((f) => (
                <th key={f.key} className="px-3 py-3 font-medium">{f.label}</th>
              ))}
              <th className="w-56 px-4 py-3 font-medium">Monat und Grenze</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((c) => {
              const u = usage.get(c.id);
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-3"><Who c={c} /></td>
                  {FEATURES.map((f) => (
                    <td key={f.key} className="px-3 py-3">
                      {applies(f, c) || hasFeature(c, f.key) ? (
                        <div className="space-y-1">
                          <FeatureToggle coacheeId={c.id} feature={f.key} on={hasFeature(c, f.key)} label={`${f.label} für ${fullName(c)}`} />
                          <UsageLine u={u.features[f.key]} className="block text-xs text-muted" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted" title={`Nur bei ${f.types.map((t) => typeLabel[t]).join(" und ")}`}>–</span>
                      )}
                    </td>
                  ))}
                  <td className="space-y-2 px-4 py-3">
                    <MonthMeter used={u.month} limit={limitOf(c)} />
                    <LimitForm coacheeId={c.id} limit={c.ai_monthly_limit} id={`t-limit-${c.id}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Handy und Tablet: eine Karte je Coachee */}
      <div className="grid gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((c) => {
          const u = usage.get(c.id);
          return (
            <article key={c.id} className="card min-w-0 space-y-4 !p-4">
              <Who c={c} />
              <ul className="space-y-3">
                {FEATURES.filter((f) => applies(f, c) || hasFeature(c, f.key)).map((f) => (
                  <li key={f.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{f.label}</p>
                      <UsageLine u={u.features[f.key]} />
                    </div>
                    <FeatureToggle coacheeId={c.id} feature={f.key} on={hasFeature(c, f.key)} label={`${f.label} für ${fullName(c)}`} showState={false} />
                  </li>
                ))}
              </ul>
              <div className="space-y-3 border-t border-line-soft pt-3">
                <MonthMeter used={u.month} limit={limitOf(c)} />
                <LimitForm coacheeId={c.id} limit={c.ai_monthly_limit} id={`c-limit-${c.id}`} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Who({ c }: { c: Row }) {
  return (
    <Link href={`/coach/coachees/${c.id}?tab=stammdaten`} className="group flex min-w-0 items-center gap-3">
      <Avatar name={fullName(c)} size="size-8" className="!text-[10px]" />
      <span className="min-w-0">
        <span className="block truncate font-semibold group-hover:text-accent">{fullName(c)}</span>
        <span className="block text-xs text-muted">
          {typeLabel[c.coaching_type]}
          {c.status === "pausiert" ? " · pausiert" : ""}
          {c.status === "abgeschlossen" && c.end_date ? ` · bis ${formatDate(c.end_date)}` : ""}
          {!c.has_login ? " · noch ohne Zugang" : ""}
        </span>
      </span>
    </Link>
  );
}
