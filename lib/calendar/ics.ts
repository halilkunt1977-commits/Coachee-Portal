/*
 * iCalendar (RFC 5545) für Einladungen per Mail und den Kalender-Abo-Link.
 * Outlook, Google und Apple erkennen eine Mail mit METHOD:REQUEST als Einladung (Zusagen/Absagen),
 * METHOD:CANCEL entfernt den Termin wieder. Notizen gehen nie mit raus.
 */

export type IcsEvent = {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  cancelled?: boolean;
  organizer?: { name: string; email: string } | null;
  attendees?: { name: string; email: string }[];
  updated?: Date;
};

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const cn = (s: string) => `"${s.replace(/"/g, "'")}"`;

/** Zeilen über 75 Byte umbrechen (Folgezeile beginnt mit Leerzeichen), ohne UTF-8-Zeichen zu zerteilen */
export function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function vevent(e: IcsEvent) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${utc(new Date())}`,
    ...(e.updated ? [`LAST-MODIFIED:${utc(e.updated)}`] : []),
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${escape(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(e.organizer ? [`ORGANIZER;CN=${cn(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    ...(e.attendees ?? []).map((a) => `ATTENDEE;CN=${cn(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    ...(e.cancelled ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Erinnerung", "TRIGGER:-PT30M", "END:VALARM"]),
    "END:VEVENT",
  ];
  return lines;
}

export function ics(events: IcsEvent[], opts: { method?: "REQUEST" | "CANCEL" | "PUBLISH"; name?: string } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//gruendarium//Portal//DE",
    "CALSCALE:GREGORIAN",
    ...(opts.method ? [`METHOD:${opts.method}`] : []),
    ...(opts.name ? [`X-WR-CALNAME:${escape(opts.name)}`, "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT30M", "X-PUBLISHED-TTL:PT30M"] : []),
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
