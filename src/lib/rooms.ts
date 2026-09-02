import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { avatars } from "@/lib/avatars";
import { hashPin, randomToken, verifyPin } from "@/lib/crypto";
import { applyDefaultRoomTemplate } from "@/lib/default-room-template";
import { query, writeTransaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { Viewer } from "@/lib/types";

export type CreateRoomInput = {
  roomName: string;
  ownerName: string;
  ownerPin: string;
  seasonName: string;
  endsAt: Date;
  finalPrize: string;
};

export type CreatePlayerInput = {
  displayName: string;
  branch?: string | null;
  avatarKey: string;
};

export type RoomNotificationSettings = {
  maxBotToken: string | null;
  maxChatId: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
};

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.trim() || "";
  return cleaned || null;
}

async function uniqueRoomSlug(tx: Transaction) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = `pride-${randomToken(5).toLowerCase()}`;
    const existing = await tx.execute({ sql: "SELECT 1 FROM rooms WHERE slug = ? LIMIT 1", args: [slug] });
    if (!existing.rows.length) return slug;
  }
  throw new HttpError(503, "Не удалось создать уникальный адрес комнаты. Повторите попытку.");
}

async function availableRoomPin(tx: Transaction, roomId: string) {
  const credentials = await tx.execute({
    sql: `SELECT u.pin_hash, u.pin_salt
      FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE m.room_id = ? AND m.is_active = 1
     UNION ALL
     SELECT i.pin_hash, i.pin_salt FROM invitations i
      WHERE i.room_id = ? AND i.assigned_membership_id IS NULL AND i.expires_at > ?`,
    args: [roomId, roomId, new Date().toISOString()],
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = String(randomInt(1000, 10000));
    let taken = false;
    for (const credential of credentials.rows) {
      if (await verifyPin(candidate, String(credential.pin_hash), String(credential.pin_salt))) {
        taken = true;
        break;
      }
    }
    if (!taken) return candidate;
  }
  throw new HttpError(503, "Не удалось подобрать свободный PIN. Повторите попытку.");
}

export async function createRoom(input: CreateRoomInput) {
  if (input.endsAt.getTime() <= Date.now()) throw new HttpError(400, "Дата окончания должна быть в будущем.");
  const finalPrize = input.finalPrize.trim();
  if (!finalPrize) throw new HttpError(400, "Укажите финальный приз.");
  const now = new Date().toISOString();
  const roomId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const seasonId = randomUUID();
  const ownerPin = await hashPin(input.ownerPin);

  const slug = await writeTransaction(async (tx) => {
    const roomSlug = await uniqueRoomSlug(tx);
    await tx.execute({
      sql: `INSERT INTO rooms
        (id, name, slug, max_players, max_bot_token, max_chat_id, telegram_bot_token, telegram_chat_id,
          notification_settings_migrated, created_at)
        VALUES (?, ?, ?, 12, NULL, NULL, NULL, NULL, 1, ?)`,
      args: [roomId, input.roomName.trim(), roomSlug, now],
    });
    await tx.execute({
      sql: "INSERT INTO users (id, display_name, avatar_key, pin_hash, pin_salt, created_at) VALUES (?, ?, 'lioness-crown', ?, ?, ?)",
      args: [userId, input.ownerName.trim(), ownerPin.hash, ownerPin.salt, now],
    });
    await tx.execute({
      sql: "INSERT INTO memberships (id, room_id, user_id, role, branch, joined_at) VALUES (?, ?, ?, 'owner', NULL, ?)",
      args: [membershipId, roomId, userId, now],
    });
    await tx.execute({
      sql: `INSERT INTO seasons
        (id, room_id, name, starts_at, ends_at, status, final_prize, gift_budget, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, 10000, ?)`,
      args: [seasonId, roomId, input.seasonName.trim(), now, input.endsAt.toISOString(), finalPrize, now],
    });
    await tx.execute({
      sql: "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
      args: [randomUUID(), seasonId, membershipId, now],
    });
    await applyDefaultRoomTemplate(tx, roomId, membershipId, now);
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'season_started', ?, ?, ?)`,
      args: [
        randomUUID(),
        roomId,
        seasonId,
        membershipId,
        membershipId,
        "Солнце взошло над новой саванной",
        `${input.seasonName.trim()}: комната создана, а путь начинается с клетки 0.`,
        now,
      ],
    });
    return roomSlug;
  });

  return { roomId, slug, userId, membershipId };
}

export async function getPublicRoomBySlug(slug: string) {
  const result = await query(
    `SELECT r.id, r.name, r.slug, r.max_players,
      COUNT(CASE WHEN m.is_active = 1 AND m.role != 'observer' THEN 1 END) AS player_count
     FROM rooms r LEFT JOIN memberships m ON m.room_id = r.id
     WHERE r.slug = ?
     GROUP BY r.id, r.name, r.slug, r.max_players
     LIMIT 1`,
    [slug],
  );
  const room = result.rows[0];
  if (!room) return null;
  return {
    id: String(room.id),
    name: String(room.name),
    slug: String(room.slug),
    maxPlayers: Number(room.max_players),
    playerCount: Number(room.player_count),
  };
}

export async function createRoomPlayer(viewer: Viewer, input: CreatePlayerInput) {
  if (!avatars.some((avatar) => avatar.key === input.avatarKey)) throw new HttpError(400, "Выберите доступного персонажа.");
  const now = new Date().toISOString();
  const userId = randomUUID();
  const membershipId = randomUUID();

  return writeTransaction(async (tx) => {
    const occupancy = await tx.execute({
      sql: "SELECT COUNT(*) AS count FROM memberships WHERE room_id = ? AND is_active = 1 AND role != 'observer'",
      args: [viewer.roomId],
    });
    const roomResult = await tx.execute({
      sql: "SELECT name, slug, max_players FROM rooms WHERE id = ? LIMIT 1",
      args: [viewer.roomId],
    });
    const room = roomResult.rows[0];
    if (!room) throw new HttpError(404, "Комната не найдена.");
    if (Number(occupancy.rows[0]?.count || 0) >= Number(room.max_players || 12)) {
      throw new HttpError(409, `В комнате уже достигнут лимит ${Number(room.max_players || 12)} участников.`);
    }
    const rawPin = await availableRoomPin(tx, viewer.roomId);
    const pin = await hashPin(rawPin);
    await tx.execute({
      sql: "INSERT INTO users (id, display_name, avatar_key, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, input.displayName.trim(), input.avatarKey, pin.hash, pin.salt, now],
    });
    await tx.execute({
      sql: "INSERT INTO memberships (id, room_id, user_id, role, branch, joined_at) VALUES (?, ?, ?, 'player', ?, ?)",
      args: [membershipId, viewer.roomId, userId, cleanOptional(input.branch), now],
    });
    const season = await tx.execute({
      sql: "SELECT id FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      args: [viewer.roomId],
    });
    const seasonId = season.rows[0] ? String(season.rows[0].id) : null;
    if (seasonId) {
      await tx.execute({
        sql: "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
        args: [randomUUID(), seasonId, membershipId, now],
      });
    }
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'player_joined', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        seasonId,
        membershipId,
        viewer.membershipId,
        "Новый участник вступил в прайд",
        `${input.displayName.trim()} начинает путь с клетки 0.`,
        now,
      ],
    });
    return {
      membershipId,
      displayName: input.displayName.trim(),
      pin: rawPin,
      roomSlug: String(room.slug),
      roomName: String(room.name),
    };
  });
}

export async function updateRoomNotificationSettings(
  viewer: Viewer,
  settings: RoomNotificationSettings,
) {
  const result = await query(
    `UPDATE rooms SET max_bot_token = ?, max_chat_id = ?, telegram_bot_token = ?, telegram_chat_id = ?
     WHERE id = ?`,
    [
      cleanOptional(settings.maxBotToken),
      cleanOptional(settings.maxChatId),
      cleanOptional(settings.telegramBotToken),
      cleanOptional(settings.telegramChatId),
      viewer.roomId,
    ],
  );
  if (!result.rowsAffected) throw new HttpError(404, "Комната не найдена.");
  return { ok: true };
}

export async function updateOwnRoomPin(viewer: Viewer, rawPin: string) {
  return writeTransaction(async (tx) => {
    const credentials = await tx.execute({
      sql: `SELECT u.pin_hash, u.pin_salt
       FROM users u JOIN memberships m ON m.user_id = u.id
       WHERE m.room_id = ? AND m.is_active = 1 AND m.id != ?`,
      args: [viewer.roomId, viewer.membershipId],
    });
    for (const credential of credentials.rows) {
      if (await verifyPin(rawPin, String(credential.pin_hash), String(credential.pin_salt))) {
        throw new HttpError(409, "Этот PIN уже используется в комнате. Выберите другой.");
      }
    }
    const pin = await hashPin(rawPin);
    const result = await tx.execute({
      sql: `UPDATE users SET pin_hash = ?, pin_salt = ?
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM memberships m
         WHERE m.user_id = users.id AND m.id = ? AND m.room_id = ? AND m.is_active = 1
       )`,
      args: [pin.hash, pin.salt, viewer.userId, viewer.membershipId, viewer.roomId],
    });
    if (!result.rowsAffected) throw new HttpError(404, "Профиль руководителя не найден.");
    return { ok: true };
  });
}
