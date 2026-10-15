// Legt den Coach-Zugang an und gibt einen Link zum Festlegen des Passworts aus.
// Aufruf im Coolify-Terminal: node scripts/create-coach.mjs info@gruendarium.de "Halil Kunt"
import crypto from "node:crypto";
import { domainToASCII } from "node:url";
import pg from "pg";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();
if (!email || !name) {
  console.error('Aufruf: node scripts/create-coach.mjs <email> "<Vorname Nachname>"');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  "INSERT INTO users (email, name, role) VALUES ($1,$2,'coach') ON CONFLICT (email) DO UPDATE SET role = 'coach', name = EXCLUDED.name, active = true RETURNING id",
  [email.toLowerCase(), name],
);
const token = crypto.randomBytes(32).toString("base64url");
const hash = crypto.createHash("sha256").update(token).digest("hex");
await client.query("INSERT INTO invitations (token_hash, user_id, purpose, expires_at) VALUES ($1,$2,'invite', now() + interval '1 day')", [hash, rows[0].id]);
await client.end();
const base = new URL(process.env.PORTAL_URL || "http://localhost:3000");
base.hostname = domainToASCII(base.hostname) || base.hostname;
console.log(`Coach-Zugang für ${name} bereit. Passwort festlegen (24 Stunden gültig):\n${base.origin}/einladung/${token}`);
