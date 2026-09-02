import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPin, tokenHash, verifyPin } from "@/lib/crypto";
import { query, writeTransaction } from "@/lib/db";
import { apiError, assertSameOrigin, HttpError } from "@/lib/http";
import { createSession } from "@/lib/session";

const joinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  displayName: z.string().trim().min(2).max(60).optional(),
  avatarKey: z.string().trim().min(2).max(40).optional(),
  branch: z.string().trim().max(60).optional(),
});

async function findInvite(rawToken: string) {
  const result = await query(
    `SELECT i.*, r.name AS room_name, r.slug AS room_slug
     FROM invitations i
     JOIN rooms r ON r.id = i.room_id
     WHERE i.token_hash = ? LIMIT 1`,
    [tokenHash(rawToken)],
  );
  return result.rows[0] || null;
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const invite = await findInvite(token);
    if (!invite) throw new HttpError(404, "Приглашение не найдено.");
    const assigned = Boolean(invite.assigned_membership_id);
    if (!assigned && new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      throw new HttpError(410, "Срок приглашения истёк.");
    }
    return NextResponse.json({
      roomName: String(invite.room_name),
      roomSlug: String(invite.room_slug),
      role: String(invite.role),
      assigned,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const { token } = await context.params;
    const input = joinSchema.parse(await request.json());
    const invite = await findInvite(token);
    if (!invite) throw new HttpError(404, "Приглашение не найдено.");
    if (!(await verifyPin(input.pin, String(invite.pin_hash), String(invite.pin_salt)))) {
      throw new HttpError(401, "Неверный PIN приглашения.");
    }

    if (invite.assigned_membership_id) {
      const existing = await query(
        `SELECT m.id AS membership_id, m.user_id, u.pin_hash, u.pin_salt
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.id = ? AND m.is_active = 1`,
        [String(invite.assigned_membership_id)],
      );
      const member = existing.rows[0];
      if (!member || !(await verifyPin(input.pin, String(member.pin_hash), String(member.pin_salt)))) {
        throw new HttpError(401, "Не удалось войти по этому приглашению.");
      }
      await createSession(String(member.user_id), String(member.membership_id));
      return NextResponse.json({ ok: true, existing: true });
    }

    if (new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      throw new HttpError(410, "Срок приглашения истёк.");
    }
    if (!input.displayName || !input.avatarKey) {
      throw new HttpError(400, "Для первого входа заполните имя и выберите персонажа.");
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const pin = await hashPin(input.pin);
    const activeSeason = await query(
      "SELECT id FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      [String(invite.room_id)],
    );
    const seasonId = activeSeason.rows[0] ? String(activeSeason.rows[0].id) : null;

    await writeTransaction(async (tx) => {
      const occupancy = await tx.execute({
        sql: "SELECT COUNT(*) AS count FROM memberships WHERE room_id = ? AND is_active = 1 AND role != 'observer'",
        args: [String(invite.room_id)],
      });
      const room = await tx.execute({
        sql: "SELECT max_players FROM rooms WHERE id = ?",
        args: [String(invite.room_id)],
      });
      if (Number(occupancy.rows[0]?.count || 0) >= Number(room.rows[0]?.max_players || 12)) {
        throw new HttpError(409, "В комнате уже 12 игроков.");
      }
      await tx.execute({
        sql: "INSERT INTO users (id, display_name, avatar_key, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [userId, input.displayName!, input.avatarKey!, pin.hash, pin.salt, now],
      });
      await tx.execute({
        sql: "INSERT INTO memberships (id, room_id, user_id, role, branch, joined_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [membershipId, String(invite.room_id), userId, String(invite.role), input.branch || null, now],
      });
      if (seasonId && String(invite.role) !== "observer") {
        await tx.execute({
          sql: "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
          args: [randomUUID(), seasonId, membershipId, now],
        });
      }
      await tx.execute({
        sql: "UPDATE invitations SET assigned_membership_id = ? WHERE id = ? AND assigned_membership_id IS NULL",
        args: [membershipId, String(invite.id)],
      });
      await tx.execute({
        sql: "INSERT INTO game_events (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, 'player_joined', ?, ?, ?)",
        args: [
          randomUUID(),
          String(invite.room_id),
          seasonId,
          membershipId,
          membershipId,
          "Прайд становится сильнее",
          `${input.displayName} начинает путь с самого начала.`,
          now,
        ],
      });
    });

    await createSession(userId, membershipId);
    return NextResponse.json({ ok: true, existing: false });
  } catch (error) {
    return apiError(error);
  }
}
