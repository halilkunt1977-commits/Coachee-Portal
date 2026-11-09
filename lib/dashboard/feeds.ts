import "server-only";

/*
 * Wetter (Open-Meteo, ohne Schlüssel) und Nachrichten (RSS der Tagesschau, für türkische Coachees DW Türkçe und BBC Türkçe) für die Startseiten.
 * Beides ist Beiwerk: Antworten werden 30 Minuten im Speicher gehalten, und wenn ein Dienst nicht antwortet,
 * zeigt die Seite einfach nichts an, statt zu warten oder einen Fehler zu werfen.
 */

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 30 * 60_000;

async function cached<T>(key: string, fn: () => Promise<T>, ttl = TTL): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return value;
  } catch (e) {
    console.warn("[feeds]", key, e instanceof Error ? e.message : e);
    // Lieber den alten Stand zeigen als nichts, und 5 Minuten lang nicht erneut versuchen
    const value = (hit?.value as T) ?? null;
    cache.set(key, { at: Date.now() - ttl + 5 * 60_000, value });
    return value;
  }
}

async function getJson(url: string, timeout = 8000) {
  let last: unknown;
  // ein zweiter Versuch, falls die erste Verbindung hängt
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: "no-store", headers: { "user-agent": "gruendarium-portal/1.0 (+https://portal.gruendarium.de)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ---------- Wetter ----------

export type Weather = {
  place: string;
  temp: number;
  code: number;
  wind: number;
  days: { date: string; code: number; max: number; min: number; rain: number }[];
};

const WMO: [number[], string, string][] = [
  [[0], "☀️", "Klar"],
  [[1], "🌤️", "Überwiegend sonnig"],
  [[2], "⛅", "Teils bewölkt"],
  [[3], "☁️", "Bewölkt"],
  [[45, 48], "🌫️", "Nebel"],
  [[51, 53, 55, 56, 57], "🌦️", "Nieselregen"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "Regen"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "Schnee"],
  [[95, 96, 99], "⛈️", "Gewitter"],
];
export const weatherIcon = (code: number) => WMO.find(([c]) => c.includes(code))?.[1] ?? "🌡️";
export const weatherLabel = (code: number) => WMO.find(([c]) => c.includes(code))?.[2] ?? "";

/** Ort aus Freitext: „12345 Musterstadt“ oder „Musterstadt-Nord“ → Suchbegriff */
export const cityQuery = (city: string) => city.replace(/\b\d{5}\b/g, "").replace(/\s*\(.*\)\s*/g, " ").split(",")[0].trim().slice(0, 80);

/** Letzter Fehlergrund je Ort, damit die Startseite sagen kann, woran es liegt */
const weatherErrors = new Map<string, "ort" | "dienst">();
export const weatherError = (city: string | null) => (city ? weatherErrors.get(cityQuery(city).toLowerCase()) ?? null : null);

/** Suchbegriffe für die Ortssuche: „Nürnberg-Langwasser“ → „Nürnberg-Langwasser“, „Nürnberg“ */
export const cityCandidates = (q: string) => {
  const first = q.split(/\s+/)[0].trim();
  // „Bad Homburg“ nicht zu „Bad“ kürzen
  const word = /^(bad|sankt|st\.?|neu|groß|gross|klein|hohen|alt)$/i.test(first) ? "" : first;
  return [...new Set([q, q.split(/[-/]/)[0].trim(), word].filter((x) => x.length > 1))];
};

async function geocode(q: string) {
  for (const name of cityCandidates(q)) {
    for (const country of ["&countryCode=DE", ""]) {
      const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de${country}`);
      const g = geo?.results?.[0];
      if (g) return g as { name?: string; latitude: number; longitude: number };
    }
  }
  return null;
}

export async function weatherFor(city: string | null): Promise<Weather | null> {
  const q = city ? cityQuery(city) : "";
  if (!q) return null;
  const k = q.toLowerCase();
  return cached(`wetter:${k}`, async () => {
    let g: Awaited<ReturnType<typeof geocode>>;
    try {
      g = await geocode(q);
    } catch (e) {
      weatherErrors.set(k, "dienst");
      throw e;
    }
    if (!g) {
      weatherErrors.set(k, "ort");
      throw new Error(`Ort nicht gefunden: ${q}`);
    }
    try {
      const w = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=4`,
      );
      weatherErrors.delete(k);
      return parseWeather(g.name ?? q, w);
    } catch (e) {
      weatherErrors.set(k, "dienst");
      throw e;
    }
  });
}

export function parseWeather(place: string, w: Record<string, Record<string, unknown>>): Weather {
  const d = w.daily as Record<string, (number | string)[]>;
  return {
    place,
    temp: Math.round(Number(w.current.temperature_2m)),
    code: Number(w.current.weather_code),
    wind: Math.round(Number(w.current.wind_speed_10m)),
    days: (d.time ?? []).map((date, i) => ({
      date: String(date),
      code: Number(d.weather_code?.[i] ?? 0),
      max: Math.round(Number(d.temperature_2m_max?.[i] ?? 0)),
      min: Math.round(Number(d.temperature_2m_min?.[i] ?? 0)),
      rain: Math.round(Number(d.precipitation_probability_max?.[i] ?? 0)),
    })),
  };
}

// ---------- Nachrichten ----------

export type NewsItem = { title: string; link: string; date: string | null; teaser: string };

export const FEEDS = {
  aktuell: { label: "Aktuell", url: "https://www.tagesschau.de/index~rss2.xml" },
  wirtschaft: { label: "Wirtschaft", url: "https://www.tagesschau.de/wirtschaft/index~rss2.xml" },
  // Für Coachees mit türkischer Oberfläche: Nachrichten auf Türkisch, DW mit Blick auf Deutschland
  dw_tr: { label: "DW Türkçe", url: "https://rss.dw.com/rdf/rss-tur-all" },
  bbc_tr: { label: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
} as const;
export const FEEDS_BY_LANG: Record<"de" | "tr", FeedKey[]> = { de: ["aktuell", "wirtschaft"], tr: ["dw_tr", "bbc_tr"] };
export type FeedKey = keyof typeof FEEDS;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export function parseRss(xml: string, max = 8): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const tag = (t: string) => m[0].match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
    const title = decode(tag("title"));
    const link = decode(tag("link"));
    if (!title || !/^https:\/\//.test(link)) continue;
    const pub = tag("pubDate") || tag("dc:date"); // RSS 2.0 bzw. RDF (DW)
    const date = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null;
    out.push({ title, link, date, teaser: decode(tag("description")).slice(0, 220) });
    if (out.length >= max) break;
  }
  return out;
}

export async function newsFor(feed: FeedKey, max = 6): Promise<NewsItem[]> {
  const items = await cached(`news:${feed}`, async () => {
    const res = await fetch(FEEDS[feed].url, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: { "user-agent": "gruendarium-portal" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRss(await res.text(), 12);
  }, 15 * 60_000);
  return (items ?? []).slice(0, max);
}
