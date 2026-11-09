import "server-only";
import type { Coachee } from "./access";
import { one } from "./db";

/*
 * Halils Regel (2026-11-09): Coachees mit Adresse in der Türkei bekommen Anschreiben, Gesprächsvorbereitung und
 * Interview-Training auf Türkisch, alle anderen auf Deutsch. Ein Länderfeld gibt es nicht; erkannt wird an Ort und
 * Straße in der Akte und im neuesten Lebenslauf: „Türkiye/Türkei“, eine türkische Provinz oder türkische Buchstaben
 * (ğ, ı, ş), die in deutschen Adressen nicht vorkommen.
 */
const PROVINCES = new Set(
  "adana adiyaman afyon afyonkarahisar agri amasya ankara antalya artvin aydin balikesir bilecik bingol bitlis bolu burdur bursa canakkale cankiri corum denizli diyarbakir edirne elazig erzincan erzurum eskisehir gaziantep antep giresun gumushane hakkari hatay antakya isparta mersin icel istanbul izmir kars kastamonu kayseri kirklareli kirsehir kocaeli izmit konya kutahya malatya manisa kahramanmaras maras mardin mugla nevsehir nigde ordu rize sakarya adapazari samsun siirt sinop sivas tekirdag tokat trabzon tunceli sanliurfa urfa usak van yozgat zonguldak aksaray bayburt karaman kirikkale batman sirnak bartin ardahan igdir yalova karabuk kilis osmaniye duzce alanya bodrum fethiye marmaris kusadasi gebze corlu".split(" "),
);

const fold = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/[ıi̇]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/â/g, "a");

export function looksTurkeyAddress(...parts: (string | null | undefined)[]) {
  const raw = parts.filter(Boolean).join(" ");
  if (!raw.trim()) return false;
  if (/[ğĞıİşŞ]/.test(raw)) return true;
  const words = fold(raw).split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => w === "turkiye" || w === "turkey" || w === "turkei" || w === "tuerkei" || PROVINCES.has(w));
}

/** Adresse in der Türkei? Akte und neuester Lebenslauf */
export async function inTurkey(c: Pick<Coachee, "id" | "city">) {
  if (looksTurkeyAddress(c.city)) return true;
  const cv = await one<{ city: string | null; street: string | null }>(
    "SELECT data->'personal'->>'city' AS city, data->'personal'->>'street' AS street FROM cvs WHERE coachee_id = $1 ORDER BY updated_at DESC LIMIT 1",
    [c.id],
  );
  return looksTurkeyAddress(cv?.city, cv?.street);
}
