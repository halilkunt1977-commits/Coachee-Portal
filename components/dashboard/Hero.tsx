// Begrüßung und Datum für die Kopfbänder, immer in deutscher Zeit
// formatToParts, weil toLocaleString hier „14 Uhr“ liefert und Number() daraus NaN macht
const berlinHour = () => Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).formatToParts(new Date()).find((p) => p.type === "hour")?.value);

export function greeting() {
  const h = berlinHour();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

export const todayLong = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
