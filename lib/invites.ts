import "server-only";
import { one, query } from "./db";
import { randomToken, sha256 } from "./crypto";
import { portalUrl } from "./mail";

const VALID = { invite: 7 * 24 * 3600_000, reset: 2 * 3600_000 } as const;

export async function createInvite(userId: string, purpose: "invite" | "reset") {
  const token = randomToken();
  // Ältere, noch offene Links desselben Zwecks werden ungültig
  await query("UPDATE invitations SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL", [userId, purpose]);
  await query("INSERT INTO invitations (token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3,$4)", [sha256(token), userId, purpose, new Date(Date.now() + VALID[purpose])]);
  return portalUrl(`/einladung/${token}`);
}

export async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return one<{ user_id: string; purpose: "invite" | "reset"; email: string; name: string; role: "coach" | "coachee"; language: "de" | "tr" }>(
    `SELECT i.user_id, i.purpose, u.email, u.name, u.role, CASE WHEN c.language = 'tr' THEN 'tr' ELSE 'de' END AS language
       FROM invitations i JOIN users u ON u.id = i.user_id LEFT JOIN coachees c ON c.user_id = u.id
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now() AND u.active`,
    [sha256(token)],
  );
}
