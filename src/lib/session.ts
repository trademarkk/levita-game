import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { randomToken, tokenHash } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import type { Role, Viewer } from "@/lib/types";

const SESSION_COOKIE = "golden_savanna_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function createSession(userId: string, membershipId: string) {
  const token = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await query(
    "INSERT INTO sessions (id, user_id, membership_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), userId, membershipId, tokenHash(token), expiresAt.toISOString(), now.toISOString()],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    priority: "high",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", [
      new Date().toISOString(),
      tokenHash(token),
    ]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

async function readViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = new Date().toISOString();
  const result = await query(
    `SELECT
      u.id AS user_id,
      u.display_name,
      u.avatar_key,
      m.id AS membership_id,
      m.room_id,
      m.role,
      m.branch
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.id = s.membership_id AND m.user_id = u.id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND m.is_active = 1
    LIMIT 1`,
    [tokenHash(token), now],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: String(row.user_id),
    membershipId: String(row.membership_id),
    roomId: String(row.room_id),
    displayName: String(row.display_name),
    avatarKey: String(row.avatar_key),
    role: String(row.role) as Role,
    branch: row.branch == null ? null : String(row.branch),
  };
}

export const getViewer = cache(readViewer);

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Нужно войти в игру.");
  return viewer;
}

export async function requirePageViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return viewer;
}

export async function requireRole(roles: Role[]) {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.role)) throw new HttpError(403, "Для этого действия недостаточно прав.");
  return viewer;
}
