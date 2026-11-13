import "server-only";
import { MsNetError, msDiagnose, msRequest } from "./msnet";

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

/** Zeitüberschreitung oder Netzfehler (kein Fehler, den Microsoft selbst gemeldet hat) */
const transient = (e: unknown) => e instanceof MsNetError;

/**
 * Anfrage an Microsoft (immer über IPv4, siehe msnet.ts). Antwortet Microsoft nicht rechtzeitig oder reißt die Verbindung ab,
 * wird es nach einer kurzen Pause genau einmal wiederholt (nur bei Anfragen, die doppelt nichts anrichten).
 */
async function send(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, retry: boolean) {
  try {
    return await msRequest(url, init, 15_000);
  } catch (e) {
    if (!retry || !transient(e)) throw e;
    await new Promise((r) => setTimeout(r, 800));
    return msRequest(url, init, 15_000);
  }
}

/** Technische Fehler in eine verständliche deutsche Meldung übersetzen */
export function graphErrorText(e: unknown): string {
  if (e instanceof MsNetError) {
    if (e.step === "zeit") return `Microsoft hat nicht rechtzeitig geantwortet. ${e.message}`;
    if (e.step === "dns") return `Microsoft ist vom Server aus nicht auffindbar. ${e.message}`;
    return `Microsoft ist vom Server aus gerade nicht erreichbar. ${e.message}`;
  }
  return e instanceof Error ? e.message : "Unbekannter Fehler bei Microsoft.";
}

async function accessToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const { status, data } = await send(
    `https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID!)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    },
    true,
  );
  if (status < 200 || status >= 300) throw new Error(`Anmeldung bei Microsoft fehlgeschlagen: ${loginReason(data.error as string | undefined, data.error_description as string | undefined) ?? status}`);
  token = { value: String(data.access_token), until: Date.now() + Number(data.expires_in ?? 3000) * 1000 };
  return token.value;
}

function loginReason(code?: string, desc?: string) {
  if (code === "invalid_client" || /AADSTS7000215|AADSTS7000222/.test(desc ?? "")) return "Das Client-Geheimnis (MS_CLIENT_SECRET) ist falsch oder abgelaufen. Bitte in Microsoft Entra ein neues anlegen und in Coolify eintragen.";
  if (/AADSTS700016/.test(desc ?? "")) return "Die App-ID (MS_CLIENT_ID) ist im Mandanten nicht bekannt.";
  if (/AADSTS90002/.test(desc ?? "")) return "Die Mandanten-ID (MS_TENANT_ID) ist nicht bekannt.";
  return desc ?? code;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graph(path: string, init: { method?: string; body?: string; prefer?: string; retry?: boolean } = {}): Promise<any> {
  const { prefer, retry, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const { status, data } = await send(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MS_CALENDAR_USER!)}${path}`,
    {
      ...rest,
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
    },
    retry ?? (method === "GET" || method === "PATCH" || method === "DELETE"),
  );
  if (status === 204 || status === 202) return null;
  if (status < 200 || status >= 300) {
    const err = data?.error as { message?: string; code?: string } | undefined;
    throw new Error(`Microsoft meldet einen Fehler (${status}): ${err?.message ?? err?.code ?? "unbekannt"}`);
  }
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
  // transactionId verhindert doppelte Termine, deshalb darf hier wiederholt werden
  const data = await graph("/events", { method: "POST", body: JSON.stringify({ ...payload(e), transactionId: e.id }), retry: true });
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

let lastOk: { at: number; message: string } | null = null;

async function runCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const cal = await graph("/calendar?$select=name,canEdit,allowedOnlineMeetingProviders");
    const teams = (cal?.allowedOnlineMeetingProviders ?? []).includes("teamsForBusiness");
    if (!cal?.canEdit) return { ok: false, message: "Der Kalender ist nur lesbar. Bitte die Berechtigung Calendars.ReadWrite (Anwendung) mit Administratorzustimmung erteilen." };
    if (!teams) return { ok: false, message: "Kalender erreichbar, aber für dieses Postfach sind keine Teams-Besprechungen erlaubt. Hat das Postfach eine Teams-Lizenz?" };
    const message = `Kalender „${cal.name}“ erreichbar, Teams-Besprechungen möglich.`;
    lastOk = { at: Date.now(), message };
    return { ok: true, message };
  } catch (error) {
    console.warn("[graph] Verbindungsprüfung:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    // Hat es vor Kurzem noch geklappt, ist ein einzelner Aussetzer von Microsoft keine gestörte Verbindung
    if (transient(error) && lastOk && Date.now() - lastOk.at < 24 * 3600_000) return { ok: true, message: `${lastOk.message} Microsoft antwortet gerade langsam, Termine werden trotzdem übertragen.` };
    return { ok: false, message: graphErrorText(error) };
  }
}

/**
 * Verbindung prüfen (für die Kalenderseite): Anmeldung bei Microsoft und Zugriff auf den Kalender des Postfachs.
 * Die Seite wartet höchstens 8 Sekunden; ein gutes Ergebnis gilt 10 Minuten.
 */
export async function graphCheck(): Promise<{ ok: boolean; message: string; details?: string[] }> {
  if (lastOk && Date.now() - lastOk.at < 10 * 60_000) return { ok: true, message: lastOk.message };
  const slow = new Promise<{ ok: boolean; message: string }>((r) =>
    setTimeout(() => r(lastOk ? { ok: true, message: `${lastOk.message} Microsoft antwortet gerade langsam.` } : { ok: false, message: "Microsoft antwortet gerade langsam. Die Prüfung läuft im Hintergrund weiter, bitte die Seite gleich neu laden." }), 8_000),
  );
  const r = await Promise.race([runCheck(), slow]);
  if (r.ok) return r;
  // Bei Netzproblemen gleich mitprüfen, welcher Weg zu Microsoft hängt, damit die Ursache sichtbar ist
  const details = await msDiagnose().catch(() => []);
  return { ...r, details };
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
    console.warn("[graph] Outlook-Kalender nicht lesbar:", graphErrorText(e));
    return [];
  }
}

export const forgetOutlookCache = () => {
  viewCache = null;
};
