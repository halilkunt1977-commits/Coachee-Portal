// Begrüßung und Datum für die Kopfbänder, immer in deutscher Zeit
// formatToParts, weil toLocaleString hier „14 Uhr“ liefert und Number() daraus NaN macht
const berlinHour = () => Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).formatToParts(new Date()).find((p) => p.type === "hour")?.value);

export function greeting(lang: "de" | "tr" = "de") {
  const h = berlinHour();
  if (lang === "tr") return h < 11 ? "Günaydın" : h < 18 ? "Merhaba" : "İyi akşamlar";
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

export const todayLong = (lang: "de" | "tr" = "de") => new Date().toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
