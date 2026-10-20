// Datensicherung: gemeinsamer Kern für die App (lib/backup/run.ts) und die Wiederherstellung (scripts/restore.mjs).
// Bewusst reines JavaScript ohne Abhängigkeiten, damit `node scripts/restore.mjs` auch ohne Build läuft.
//
// Aufbau einer Sicherung:  tar (Tabellen als NDJSON-Teile, Dateien aus DATA_DIR, manifest.json am Ende)
//                       -> gzip -> AES-256-GCM (Kopf als AAD, Prüfwert am Ende)
// Dateikopf (26 Byte): "GPBK" | Version 1 | Schlüsselquelle (1 = BACKUP_KEY, 2 = APP_SECRET) | Schlüssel-ID (8) | IV (12)
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { Transform } from "node:stream";

export const MAGIC = Buffer.from("GPBK");
export const HEADER_LEN = 26;
export const TAG_LEN = 16;
export const KEY_SOURCE = { BACKUP_KEY: 1, APP_SECRET: 2 };

/* ------------------------------------------------------------------ Schlüssel */

function deriveKey(secret, label) {
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("gruendarium-portal-backup"), Buffer.from(label), 32));
}

/** Schlüssel zum Verschlüsseln: BACKUP_KEY, sonst aus APP_SECRET abgeleitet */
export function backupKey(env = process.env) {
  if (env.BACKUP_KEY) {
    if (env.BACKUP_KEY.length < 32) throw new Error("BACKUP_KEY ist zu kurz (mindestens 32 Zeichen, z. B. openssl rand -hex 32)");
    return { source: KEY_SOURCE.BACKUP_KEY, key: deriveKey(env.BACKUP_KEY, "backup-key:v1") };
  }
  if (env.APP_SECRET && env.APP_SECRET.length >= 32) return { source: KEY_SOURCE.APP_SECRET, key: deriveKey(env.APP_SECRET, "app-secret:v1") };
  throw new Error("Weder BACKUP_KEY noch APP_SECRET gesetzt, Sicherung kann nicht verschlüsselt werden");
}

/** Schlüssel zum Entschlüsseln passend zur Quelle im Dateikopf */
export function keyForSource(source, env = process.env) {
  if (source === KEY_SOURCE.BACKUP_KEY) {
    if (!env.BACKUP_KEY) throw new Error("Diese Sicherung ist mit BACKUP_KEY verschlüsselt, BACKUP_KEY ist aber nicht gesetzt");
    return deriveKey(env.BACKUP_KEY, "backup-key:v1");
  }
  if (source === KEY_SOURCE.APP_SECRET) {
    if (!env.APP_SECRET) throw new Error("Diese Sicherung ist mit APP_SECRET verschlüsselt, APP_SECRET ist aber nicht gesetzt");
    return deriveKey(env.APP_SECRET, "app-secret:v1");
  }
  throw new Error(`Unbekannte Schlüsselquelle ${source}`);
}

export const keyId = (key) => crypto.createHmac("sha256", key).update("key-id").digest().subarray(0, 8);

/** Fingerabdruck von APP_SECRET (kein Rückschluss möglich), damit die Wiederherstellung warnen kann, wenn er nicht passt */
export const secretFingerprint = (secret) => (secret ? crypto.createHash("sha256").update(`portal-fingerprint:${secret}`).digest("hex").slice(0, 16) : null);

/* ------------------------------------------------------------------ Verschlüsselung */

export function encryptStream({ key, source }) {
  const iv = crypto.randomBytes(12);
  const header = Buffer.concat([MAGIC, Buffer.from([1, source]), keyId(key), iv]);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  let started = false;
  return new Transform({
    transform(chunk, _enc, cb) {
      if (!started) {
        started = true;
        this.push(header);
      }
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      if (!started) this.push(header);
      this.push(cipher.final());
      cb(null, cipher.getAuthTag());
    },
  });
}

export function parseHeader(buf) {
  if (buf.length < HEADER_LEN || !buf.subarray(0, 4).equals(MAGIC)) throw new Error("Keine Sicherung des Portals (Dateikopf fehlt)");
  if (buf[4] !== 1) throw new Error(`Unbekannte Version ${buf[4]} der Sicherung`);
  return { version: buf[4], source: buf[5], keyId: buf.subarray(6, 14), iv: buf.subarray(14, 26) };
}

/** Entschlüsselt fortlaufend; die letzten 16 Byte (Prüfwert) werden zurückgehalten und am Ende geprüft */
export function decryptStream(env = process.env) {
  let head = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let decipher = null;
  return new Transform({
    transform(chunk, _enc, cb) {
      try {
        if (!decipher) {
          head = Buffer.concat([head, chunk]);
          if (head.length < HEADER_LEN) return cb();
          const h = parseHeader(head);
          const key = keyForSource(h.source, env);
          if (!keyId(key).equals(h.keyId)) {
            const name = h.source === KEY_SOURCE.BACKUP_KEY ? "BACKUP_KEY" : "APP_SECRET";
            throw new Error(`Falscher Schlüssel: ${name} passt nicht zu dieser Sicherung`);
          }
          decipher = crypto.createDecipheriv("aes-256-gcm", key, h.iv);
          decipher.setAAD(head.subarray(0, HEADER_LEN));
          chunk = head.subarray(HEADER_LEN);
          head = null;
        }
        const all = tail.length ? Buffer.concat([tail, chunk]) : chunk;
        if (all.length <= TAG_LEN) {
          tail = Buffer.from(all);
          return cb();
        }
        tail = Buffer.from(all.subarray(all.length - TAG_LEN));
        cb(null, decipher.update(all.subarray(0, all.length - TAG_LEN)));
      } catch (e) {
        cb(e);
      }
    },
    flush(cb) {
      try {
        if (!decipher || tail.length !== TAG_LEN) throw new Error("Sicherung ist unvollständig");
        decipher.setAuthTag(tail);
        cb(null, decipher.final());
      } catch (e) {
        cb(e.message?.includes("authenticate") ? new Error("Sicherung ist beschädigt oder verändert (Prüfwert stimmt nicht)") : e);
      }
    },
  });
}

/** Zählt Bytes und rechnet SHA-256 mit, ohne die Daten zu verändern */
export function hashTap() {
  const hash = crypto.createHash("sha256");
  const t = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      t.bytes += chunk.length;
      cb(null, chunk);
    },
  });
  t.bytes = 0;
  t.digest = () => hash.digest("hex");
  return t;
}

/* ------------------------------------------------------------------ tar (ustar) */

const BLOCK = 512;

function writeString(buf, offset, len, value) {
  buf.write(value, offset, Math.min(len, Buffer.byteLength(value)), "utf8");
}
function writeOctal(buf, offset, len, value) {
  const s = Math.floor(value).toString(8).padStart(len - 1, "0");
  if (s.length > len - 1) throw new Error("Eintrag zu groß für tar");
  buf.write(`${s}\0`, offset, len, "ascii");
}

export function tarHeader(name, size, mtime = new Date()) {
  const h = Buffer.alloc(BLOCK);
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`Pfad zu lang für die Sicherung: ${name}`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  writeString(h, 0, 100, base);
  writeOctal(h, 100, 8, 0o644);
  writeOctal(h, 108, 8, 0);
  writeOctal(h, 116, 8, 0);
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, mtime.getTime() / 1000);
  h.fill(0x20, 148, 156);
  h.write("0", 156, "ascii");
  h.write("ustar\0", 257, "ascii");
  h.write("00", 263, "ascii");
  writeString(h, 265, 32, "portal");
  writeString(h, 297, 32, "portal");
  writeString(h, 345, 155, prefix);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return h;
}

export const tarPadding = (size) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);
export const tarEnd = () => Buffer.alloc(BLOCK * 2);

function parseTarHeader(h) {
  if (h.every((b) => b === 0)) return null;
  const str = (o, l) => {
    const s = h.subarray(o, o + l);
    const z = s.indexOf(0);
    return s.subarray(0, z < 0 ? l : z).toString("utf8");
  };
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
  if (parseInt(str(148, 8).trim(), 8) !== sum) throw new Error("tar-Kopf beschädigt");
  const prefix = str(345, 155);
  const name = prefix ? `${prefix}/${str(0, 100)}` : str(0, 100);
  return { name, size: parseInt(str(124, 12).trim() || "0", 8), type: str(156, 1) || "0" };
}

/**
 * Liest ein tar fortlaufend. handler(entry) liefert { data(chunk), end() } oder null zum Überspringen;
 * beide dürfen async sein, es wird gewartet (Gegendruck, Speicher bleibt klein).
 */
export async function readTar(source, handler) {
  let buf = Buffer.alloc(0);
  let entry = null; // { name, size, remaining, pad, sink }
  let done = false;
  for await (const chunk of source) {
    if (done) continue;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    let pos = 0;
    while (!done) {
      if (entry) {
        if (entry.remaining > 0) {
          const n = Math.min(entry.remaining, buf.length - pos);
          if (n === 0) break;
          if (entry.sink) await entry.sink.data(buf.subarray(pos, pos + n));
          pos += n;
          entry.remaining -= n;
          if (entry.remaining > 0) break;
        }
        if (buf.length - pos < entry.pad) break;
        pos += entry.pad;
        if (entry.sink) await entry.sink.end();
        entry = null;
      } else {
        if (buf.length - pos < BLOCK) break;
        const h = parseTarHeader(buf.subarray(pos, pos + BLOCK));
        pos += BLOCK;
        if (!h) {
          done = true;
          break;
        }
        entry = { ...h, remaining: h.size, pad: (BLOCK - (h.size % BLOCK)) % BLOCK, sink: h.type === "0" ? await handler(h) : null };
      }
    }
    buf = buf.subarray(pos);
  }
  if (!done) throw new Error("Sicherung endet vorzeitig (tar unvollständig)");
}

/* ------------------------------------------------------------------ Namen und Aufbewahrung */

const NAME_RE = /^portal-sicherung-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z\.tar\.gz\.enc$/;
export const isBackupName = (name) => NAME_RE.test(name);

export function backupName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `portal-sicherung-${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z.tar.gz.enc`;
}

export function dateOfBackup(name) {
  const m = NAME_RE.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

const berlinDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** Kalendertag in Berlin als "YYYY-MM-DD" */
export const berlinDate = (d) => berlinDay.format(d);

function isoWeek(dayString) {
  const [y, m, d] = dayString.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - yearStart) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

export const DEFAULT_RETENTION = { daily: 14, weekly: 8, monthly: 6 };

/**
 * Großvater-Vater-Sohn: je Tag, Woche und Monat (Berliner Zeit) die neueste Sicherung, davon die letzten 14/8/6.
 * Die allerneueste und alles aus den letzten 24 Stunden bleibt immer. Gibt die Namen zurück, die bleiben sollen.
 */
export function selectKeep(names, retention = DEFAULT_RETENTION, now = new Date()) {
  const items = names.map((name) => ({ name, date: dateOfBackup(name) })).filter((i) => i.date).sort((a, b) => b.date - a.date);
  // Alles aus den letzten 24 Stunden bleibt (z. B. Nachtsicherung und eine Sicherung von Hand am selben Tag)
  const keep = new Set(items.filter((i) => now - i.date < 86_400_000).map((i) => i.name));
  if (items.length) keep.add(items[0].name);
  const pick = (keyOf, count) => {
    const seen = new Set();
    for (const i of items) {
      const k = keyOf(berlinDate(i.date));
      if (seen.has(k)) continue;
      if (seen.size >= count) break;
      seen.add(k);
      keep.add(i.name);
    }
  };
  pick((d) => d, retention.daily);
  pick(isoWeek, retention.weekly);
  pick((d) => d.slice(0, 7), retention.monthly);
  return keep;
}

/* ------------------------------------------------------------------ S3 (Signature V4, ohne Bibliothek) */

const sha256hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
export const EMPTY_SHA256 = sha256hex("");

/** RFC 3986, wie von AWS verlangt */
export function awsEncode(s, keepSlash = false) {
  const out = encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return keepSlash ? out.replace(/%2F/g, "/") : out;
}

export const amzDate = (d) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");

/**
 * Signiert eine Anfrage (AWS Signature Version 4). headers: Kleinbuchstaben-Namen inkl. host.
 * query: Liste von [Name, Wert]. Gibt den Authorization-Header zurück.
 */
export function signV4({ method, path, query = [], headers, payloadHash, region, service = "s3", accessKey, secretKey, date }) {
  const stamp = amzDate(date);
  const day = stamp.slice(0, 8);
  const canonicalQuery = query
    .map(([k, v]) => [awsEncode(k), awsEncode(v ?? "")])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return { authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`, signature, canonicalRequest, stringToSign };
}

export function s3Config(env = process.env) {
  const need = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
  if (need.every((k) => !env[k])) return null;
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`S3 unvollständig eingerichtet, es fehlt: ${missing.join(", ")}`);
  const endpoint = new URL(/^https?:\/\//.test(env.S3_ENDPOINT) ? env.S3_ENDPOINT : `https://${env.S3_ENDPOINT}`);
  const prefix = (env.S3_PREFIX ?? "portal-sicherung/").replace(/^\/+/, "");
  return {
    endpoint,
    region: env.S3_REGION || "us-east-1",
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    prefix: prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
    pathStyle: !["0", "false", "nein"].includes(String(env.S3_PATH_STYLE ?? "true").toLowerCase()),
  };
}

const xmlText = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function s3Client(cfg) {
  const basePath = cfg.endpoint.pathname.replace(/\/+$/, "");
  const host = cfg.pathStyle ? cfg.endpoint.host : `${cfg.bucket}.${cfg.endpoint.host}`;
  const pathFor = (key) => `${basePath}${cfg.pathStyle ? `/${awsEncode(cfg.bucket)}` : ""}/${awsEncode(key, true)}`;

  function request({ method, key = "", query = [], body = null, payloadHash = EMPTY_SHA256, extraHeaders = {}, stream = false }) {
    const date = new Date();
    const path = pathFor(key);
    const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate(date), ...extraHeaders };
    const { authorization } = signV4({ method, path, query, headers, payloadHash, region: cfg.region, accessKey: cfg.accessKey, secretKey: cfg.secretKey, date });
    const qs = query.map(([k, v]) => `${awsEncode(k)}=${awsEncode(v ?? "")}`).join("&");
    const lib = cfg.endpoint.protocol === "http:" ? http : https;
    return new Promise((resolve, reject) => {
      const req = lib.request(
        { protocol: cfg.endpoint.protocol, hostname: cfg.pathStyle ? cfg.endpoint.hostname : `${cfg.bucket}.${cfg.endpoint.hostname}`, port: cfg.endpoint.port || undefined, method, path: qs ? `${path}?${qs}` : path, headers: { ...headers, authorization } },
        (res) => {
          if (stream && res.statusCode >= 200 && res.statusCode < 300) return resolve(res);
          const parts = [];
          res.on("data", (c) => parts.push(c));
          res.on("error", reject);
          res.on("end", () => {
            const text = Buffer.concat(parts).toString("utf8");
            if (res.statusCode >= 200 && res.statusCode < 300) return resolve(text);
            const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1];
            const msg = /<Message>([^<]*)<\/Message>/.exec(text)?.[1];
            reject(new Error(`S3 ${method} ${res.statusCode}${code ? ` ${code}` : ""}${msg ? `: ${xmlText(msg)}` : ""}`));
          });
        },
      );
      req.setTimeout(120_000, () => req.destroy(new Error(`S3 ${method}: keine Antwort (Zeitüberschreitung)`)));
      req.on("error", reject);
      if (body && typeof body.pipe === "function") {
        body.on("error", (e) => req.destroy(e));
        body.pipe(req);
      } else req.end(body ?? undefined);
    });
  }

  return {
    keyFor: (name) => `${cfg.prefix}${name}`,
    /** Lädt eine Datei hoch; sha256 (hex) und size der Datei müssen bekannt sein */
    put: (key, filePath, { sha256, size, contentType = "application/octet-stream" }) =>
      request({ method: "PUT", key, body: createReadStream(filePath), payloadHash: sha256, extraHeaders: { "content-length": String(size), "content-type": contentType } }),
    putBuffer: (key, data, contentType = "application/json") =>
      request({ method: "PUT", key, body: data, payloadHash: sha256hex(data), extraHeaders: { "content-length": String(data.length), "content-type": contentType } }),
    get: (key) => request({ method: "GET", key, stream: true }),
    del: (key) => request({ method: "DELETE", key }),
    async list(prefix = cfg.prefix) {
      const out = [];
      let token = null;
      do {
        const query = [["list-type", "2"], ["prefix", prefix], ...(token ? [["continuation-token", token]] : [])];
        const xml = await request({ method: "GET", query });
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = xmlText(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? "");
          out.push({ key, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0), lastModified: /<LastModified>([^<]*)<\/LastModified>/.exec(m[1])?.[1] ?? null });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlText(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "") || null : null;
      } while (token);
      return out;
    },
  };
}
