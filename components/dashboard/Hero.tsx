// Begrüßung und Datum für die Kopfbänder, immer in deutscher Zeit
const berlinHour = () => Number(new Date().toLocaleString("de-DE", { hour: "2-digit", hour12: false, timeZone: "Europe/Berlin" }));

export function greeting() {
  const h = berlinHour();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
}

export const todayLong = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
