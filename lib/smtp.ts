import net from "node:net";
import os from "node:os";
import tls from "node:tls";

// Minimaler SMTP-Client ohne Abhängigkeiten (z. B. Strato: smtp.strato.de, Port 465 = SSL, 587 = STARTTLS), AUTH LOGIN.
export type SmtpMail = { host: string; port: number; secure: boolean; user: string; pass: string; from: string; to: string[]; replyTo?: string | null; subject: string; text: string; html: string };

export function smtpSend(m: SmtpMail): Promise<void> {
  return new Promise((resolve, reject) => {
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    const enc = (s: string) => "=?UTF-8?B?" + b64(s) + "?=";
    const addr = (s: string) => (String(s).match(/<([^>]+)>/)?.[1] ?? s).trim();
    const name = (String(m.from).match(/^(.*)<[^>]+>/)?.[1] ?? "").trim();
    const wrap = (s: string) => b64(s).replace(/.{76}/g, "$&\r\n");
    const bound = "ks" + Date.now().toString(36);
    const host = os.hostname() || "gruendarium";
    const body = [
      `From: ${name ? enc(name) + " " : ""}<${addr(m.from)}>`,
      `To: ${m.to.join(", ")}`,
      ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
      `Subject: ${enc(m.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${addr(m.from).split("@")[1] || "localhost"}>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${bound}"`,
      "",
      `--${bound}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(m.text),
      `--${bound}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(m.html),
      `--${bound}--`, "",
    ].join("\r\n");
    type Step = [(() => string) | null, number, ("tls" | undefined)?];
    const steps: Step[] = [
      [null, 220],
      [() => `EHLO ${host}`, 250],
      ...(m.secure ? [] : ([[() => "STARTTLS", 220, "tls"], [() => `EHLO ${host}`, 250]] as Step[])),
      [() => "AUTH LOGIN", 334],
      [() => b64(m.user), 334],
      [() => b64(m.pass), 235],
      [() => `MAIL FROM:<${addr(m.from)}>`, 250],
      ...m.to.map((t) => [() => `RCPT TO:<${addr(t)}>`, 250] as Step),
      [() => "DATA", 354],
      [() => body + "\r\n.", 250],
      [() => "QUIT", 221],
    ];
    let sock: net.Socket | tls.TLSSocket;
    let buf = "";
    let i = 0;
    let done = false;
    const fail = (e: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock?.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const timer = setTimeout(() => fail("SMTP-Zeitüberschreitung"), 20000);
    const next = () => {
      if (i >= steps.length) {
        done = true;
        clearTimeout(timer);
        sock.end();
        return resolve();
      }
      sock.write(steps[i][0]!() + "\r\n");
    };
    const onData = (d: Buffer) => {
      buf += d.toString();
      if (!buf.endsWith("\r\n")) return;
      const last = buf.split("\r\n").filter(Boolean).pop() || "";
      if (/^\d{3}-/.test(last)) return;
      buf = "";
      const [, want, mode] = steps[i];
      if (parseInt(last, 10) !== want) return fail(`SMTP: erwartet ${want}, bekommen „${last}“`);
      i++;
      if (mode === "tls") {
        sock.removeAllListeners("data");
        sock = tls.connect({ socket: sock, servername: m.host }, next);
        sock.on("data", onData);
        sock.on("error", fail);
        return;
      }
      next();
    };
    sock = m.secure ? tls.connect({ host: m.host, port: m.port, servername: m.host }) : net.connect({ host: m.host, port: m.port });
    sock.on("data", onData);
    sock.on("error", fail);
  });
}
