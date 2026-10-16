import { FEEDS, newsFor, weatherFor, weatherIcon, weatherLabel, type FeedKey } from "@/lib/dashboard/feeds";

const weekday = (iso: string, i: number) => (i === 0 ? "Heute" : new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" }));

/** Wetter am Ort, für das dunkle Kopfband der Startseiten */
export async function WeatherBox({ city, edit }: { city: string | null; edit?: React.ReactNode }) {
  const w = await weatherFor(city);
  if (!w)
    return (
      <div className="space-y-2 text-sm text-white/80">
        <p>{city ? `Für „${city}“ ist gerade kein Wetter abrufbar.` : "Trag einen Ort ein, dann steht hier das Wetter."}</p>
        {edit}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-5xl leading-none" aria-hidden>{weatherIcon(w.code)}</span>
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tabular-nums">{w.temp}°</p>
          <p className="text-sm text-white/80">{weatherLabel(w.code)} · {w.place}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {w.days.slice(0, 4).map((d, i) => (
          <div key={d.date} className="min-w-0 flex-1 rounded-xl bg-white/10 px-2 py-1.5 text-center text-xs">
            <p className="text-white/70">{weekday(d.date, i)}</p>
            <p className="text-lg leading-tight" aria-hidden>{weatherIcon(d.code)}</p>
            <p className="tabular-nums"><b>{d.max}°</b> <span className="text-white/60">{d.min}°</span></p>
            {d.rain >= 30 && <p className="text-[10px] text-white/70">{d.rain}% Regen</p>}
          </div>
        ))}
      </div>
      {edit}
    </div>
  );
}

export function WeatherSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-white/10" />;
}

/** Schlagzeilen, je Rubrik eine Spalte */
export async function NewsBox({ feeds = ["aktuell", "wirtschaft"], max = 5 }: { feeds?: FeedKey[]; max?: number }) {
  const lists = await Promise.all(feeds.map(async (f) => ({ f, items: await newsFor(f, max) })));
  if (lists.every((l) => !l.items.length)) return <p className="text-sm text-muted">Die Nachrichten sind gerade nicht abrufbar.</p>;
  return (
    <div className={`grid gap-6 ${lists.length > 1 ? "md:grid-cols-2" : ""}`}>
      {lists.map(({ f, items }) => (
        <div key={f} className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{FEEDS[f].label}</p>
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n.link} className="min-w-0">
                <a href={n.link} target="_blank" rel="noreferrer" className="group block">
                  <p className="font-medium leading-snug group-hover:text-accent group-hover:underline">{n.title}</p>
                  {n.date && <p className="text-xs text-muted">{new Date(n.date).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr</p>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted md:col-span-2">Quelle: tagesschau.de</p>
    </div>
  );
}

export function NewsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-bg" />)}
    </div>
  );
}

/** Kleines Formular, um den Ort fürs Wetter zu ändern */
export function CityForm({ action, city, placeholder = "z. B. Köln" }: { action: (fd: FormData) => Promise<void>; city: string | null; placeholder?: string }) {
  return (
    <details className="text-xs text-white/80">
      <summary className="cursor-pointer hover:text-white">{city ? "Ort ändern" : "Ort eintragen"}</summary>
      <form action={action} className="mt-2 flex gap-2">
        <input name="city" defaultValue={city ?? ""} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white" />
        <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-accent">Speichern</button>
      </form>
    </details>
  );
}
