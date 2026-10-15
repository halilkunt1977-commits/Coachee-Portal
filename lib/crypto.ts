import crypto from "node:crypto";

// Passwörter mit scrypt (in Node eingebaut). Format: scrypt$N$r$p$salt$hash
const N = 32768, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return Promise.resolve(false);
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return Promise.resolve(false);
  const expected = Buffer.from(hash, "base64");
  return new Promise((resolve) => {
    crypto.scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 }, (err, key) => {
      if (err) return resolve(false);
      resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Zwei-Faktor (TOTP, RFC 6238) für Authenticator-Apps wie Google Authenticator, Microsoft Authenticator, 1Password
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(input: string) {
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpAt(secret: string, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 30_000);
  // ±1 Zeitfenster, damit eine leicht falsch gehende Handy-Uhr nicht stört
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(totpAt(secret, counter + d)), Buffer.from(clean)));
}

export const totpUri = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Gründarium Portal:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("Gründarium Portal")}&period=30&digits=6`;

// Geheimnisse in der Datenbank (z. B. TOTP) verschlüsselt ablegen, Schlüssel aus APP_SECRET
function key() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen)");
  return crypto.createHash("sha256").update(`portal-enc:${secret}`).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function decrypt(value: string) {
  const [v, iv, tag, data] = value.split(":");
  if (v !== "v1") throw new Error("Unbekanntes Format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function encryptBuffer(plain: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("PE1"), iv, cipher.getAuthTag(), data]);
}

export function decryptBuffer(stored: Buffer) {
  if (stored.subarray(0, 3).toString() !== "PE1") throw new Error("Unbekanntes Dateiformat");
  const iv = stored.subarray(3, 15), tag = stored.subarray(15, 31);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(31)), decipher.final()]);
}
