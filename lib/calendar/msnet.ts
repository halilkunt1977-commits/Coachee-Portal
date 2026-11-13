import "server-only";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";

/*
 * Netzwerkzugang zu Microsoft (Anmeldung und Graph) ohne den eingebauten fetch.
 * Im Docker-Container auf dem Server hat IPv6 oft keine Route nach draußen; Microsoft liefert aber
 * IPv6-Adressen mit, und der eingebaute fetch hängt dann, bis die Zeitgrenze greift.
 * Hier wird deshalb immer über IPv4 verbunden, mit eigener, sauber benannter Fehlerursache je Schritt.
 */

const agent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 8 });

export class MsNetError extends Error {
  constructor(public step: "dns" | "verbindung" | "zeit" | "antwort", message: string) {
    super(message);
    this.name = "MsNetError";
  }
}

export type MsResponse = { status: number; data: Record<string, unknown> & { [k: string]: unknown } };

export function msRequest(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, timeoutMs: number): Promise<MsResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = init.body ?? undefined;
    const req = https.request(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        method: init.method ?? "GET",
        family: 4,
        agent,
        headers: { ...(init.headers ?? {}), ...(body !== undefined ? { "content-length": Buffer.byteLength(body).toString() } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timer);
          const text = Buffer.concat(chunks).toString("utf8");
          let data: MsResponse["data"] = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = {};
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
        res.on("error", (e) => {
          clearTimeout(timer);
          reject(new MsNetError("antwort", `Antwort von ${u.hostname} abgebrochen: ${e.message}`));
        });
      },
    );
    const timer = setTimeout(() => req.destroy(new MsNetError("zeit", `${u.hostname} hat nicht innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden geantwortet.`)), timeoutMs);
    req.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e instanceof MsNetError) return reject(e);
      if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return reject(new MsNetError("dns", `Der Server findet ${u.hostname} nicht (DNS: ${e.code}).`));
      reject(new MsNetError("verbindung", `Keine Verbindung zu ${u.hostname} (${e.code ?? e.message}).`));
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const ms = (t: number) => `${Math.round(performance.now() - t)} ms`;

function tcp(host: string, family: 4 | 6, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const t = performance.now();
    dns.lookup(host, { family }, (err, address) => {
      if (err) return resolve(`keine IPv${family}-Adresse (${err.code})`);
      const s = net.connect({ host: address, port: 443 });
      const done = (r: string) => {
        s.destroy();
        resolve(r);
      };
      s.setTimeout(timeoutMs, () => done(`hängt (keine Antwort in ${timeoutMs / 1000} s)`));
      s.on("connect", () => done(`ok (${ms(t)})`));
      s.on("error", (e: NodeJS.ErrnoException) => done(`Fehler ${e.code ?? e.message}`));
    });
  });
}

/** Technische Prüfung der Netzwerkwege zu Microsoft, für die Kalenderseite, wenn die Verbindung gestört ist */
export async function msDiagnose(): Promise<string[]> {
  const hosts = ["login.microsoftonline.com", "graph.microsoft.com"];
  const rows = await Promise.all(
    hosts.flatMap((h) => [tcp(h, 4, 5000).then((r) => `${h} über IPv4: ${r}`), tcp(h, 6, 5000).then((r) => `${h} über IPv6: ${r}`)]),
  );
  return rows;
}
