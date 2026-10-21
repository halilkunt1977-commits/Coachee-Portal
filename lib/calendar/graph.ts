import "server-only";

/*
 * Anbindung an Microsoft 365 (Outlook-Kalender und Teams) über Microsoft Graph.
 * Eingerichtet wird sie über eine App-Registrierung in Microsoft Entra (Azure) mit der
 * Anwendungsberechtigung Calendars.ReadWrite (Administratorzustimmung) und vier Variablen in Coolify:
 * MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET und MS_CALENDAR_USER (das Postfach des Coachs).
 * Ohne diese Variablen läuft der Kalender trotzdem: Einladungen gehen dann als Kalendermail raus,
 * und einen Teams-Link fügt der Coach selbst ein.
 */

export const graphEnabled = () => Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_CALENDAR_USER);

let token: { value: string; until: number } | null = null;

async function accessToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft-Anmeldung fehlgeschlagen: ${data.error_description ?? data.error ?? res.status}`);
  token = { value: data.access_token, until: Date.now() + Number(data.expires_in ?? 3000) * 1000 };
  return token.value;
}

async function graph(path: string, init: RequestInit & { prefer?: string } = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MS_CALENDAR_USER!)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${data?.error?.message ?? data?.error?.code ?? "unbekannter Fehler"}`);
  return data;
}

export type GraphInput = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  teams: boolean;
  body: string;
  attendee: { name: string; email: string } | null;
};

const when = (d: Date) => ({ dateTime: d.toISOString().slice(0, 19), timeZone: "UTC" });

function payload(e: GraphInput) {
  return {
    subject: e.title,
    body: { contentType: "HTML", content: e.body },
    start: when(e.start),
    end: when(e.end),
    location: e.location ? { displayName: e.location } : undefined,
    attendees: e.attendee ? [{ emailAddress: { address: e.attendee.email, name: e.attendee.name }, type: "required" }] : [],
    allowNewTimeProposals: false,
    isReminderOn: true,
    reminderMinutesBeforeStart: 30,
    ...(e.teams ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
  };
}

/** Termin im Outlook-Kalender anlegen; Microsoft verschickt die Einladung an den Coachee selbst. */
export async function createGraphEvent(e: GraphInput) {
  const data = await graph("/events", { method: "POST", body: JSON.stringify({ ...payload(e), transactionId: e.id }) });
  return { id: String(data.id), joinUrl: (data.onlineMeeting?.joinUrl as string | undefined) ?? null };
}

export async function updateGraphEvent(eventId: string, e: GraphInput) {
  const data = await graph(`/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(payload(e)) });
  return { joinUrl: (data?.onlineMeeting?.joinUrl as string | undefined) ?? null };
}

/** Absagen schickt den Teilnehmern eine Absage; ohne Teilnehmer wird der Termin einfach gelöscht. */
export async function cancelGraphEvent(eventId: string, comment: string) {
  try {
    await graph(`/events/${encodeURIComponent(eventId)}/cancel`, { method: "POST", body: JSON.stringify({ comment }) });
  } catch {
    await graph(`/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  }
}

/** Verbindung prüfen (für die Kalenderseite): Anmeldung bei Microsoft und Zugriff auf den Kalender des Postfachs */
export async function graphCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const cal = await graph("/calendar?$select=name,canEdit,allowedOnlineMeetingProviders");
    const teams = (cal?.allowedOnlineMeetingProviders ?? []).includes("teamsForBusiness");
    if (!cal?.canEdit) return { ok: false, message: "Der Kalender ist nur lesbar. Bitte die Berechtigung Calendars.ReadWrite (Anwendung) mit Administratorzustimmung erteilen." };
    return teams ? { ok: true, message: `Kalender „${cal.name}“ erreichbar, Teams-Besprechungen möglich.` } : { ok: false, message: "Kalender erreichbar, aber für dieses Postfach sind keine Teams-Besprechungen erlaubt. Hat das Postfach eine Teams-Lizenz?" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unbekannter Fehler" };
  }
}

export type OutlookEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null; joinUrl: string | null; webLink: string | null };

let viewCache: { key: string; at: number; value: OutlookEvent[] } | null = null;

/** Termine aus dem Outlook-Kalender (Zeiten in Berliner Ortszeit, „YYYY-MM-DDTHH:MM“), kurz zwischengespeichert. */
export async function outlookEvents(from: string, to: string): Promise<OutlookEvent[]> {
  if (!graphEnabled()) return [];
  const key = `${from}|${to}`;
  if (viewCache && viewCache.key === key && Date.now() - viewCache.at < 2 * 60_000) return viewCache.value;
  try {
    const qs = new URLSearchParams({
      startDateTime: `${from}T00:00:00`,
      endDateTime: `${to}T23:59:59`,
      $select: "id,subject,start,end,isAllDay,location,onlineMeeting,isCancelled,webLink,showAs",
      $orderby: "start/dateTime",
      $top: "250",
    });
    const data = await graph(`/calendarView?${qs}`, { prefer: 'outlook.timezone="Europe/Berlin"' });
    const value: OutlookEvent[] = (data?.value ?? [])
      .filter((e: { isCancelled?: boolean; showAs?: string }) => !e.isCancelled && e.showAs !== "free")
      .map((e: { id: string; subject?: string; start: { dateTime: string }; end: { dateTime: string }; isAllDay?: boolean; location?: { displayName?: string }; onlineMeeting?: { joinUrl?: string }; webLink?: string }) => ({
        id: e.id,
        title: e.subject || "(ohne Betreff)",
        start: e.start.dateTime.slice(0, 16),
        end: e.end.dateTime.slice(0, 16),
        allDay: Boolean(e.isAllDay),
        location: e.location?.displayName || null,
        joinUrl: e.onlineMeeting?.joinUrl ?? null,
        webLink: e.webLink ?? null,
      }));
    viewCache = { key, at: Date.now(), value };
    return value;
  } catch (e) {
    console.warn("[graph] Outlook-Kalender nicht lesbar:", e instanceof Error ? e.message : e);
    return [];
  }
}

export const forgetOutlookCache = () => {
  viewCache = null;
};
