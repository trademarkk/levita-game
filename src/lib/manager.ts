import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { loadRoomBoardCells } from "@/lib/board-config";
import { hashPin, randomToken, tokenHash, verifyPin } from "@/lib/crypto";
import { query, writeTransaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { sendGameNotification } from "@/lib/notifications";
import type { CellType, Viewer, Role, TaskAchievementTag } from "@/lib/types";

export async function getManagerState(viewer: Viewer) {
  const roomResult = await query(
    `SELECT id, name, slug, max_players, max_bot_token, max_chat_id,
      telegram_bot_token, telegram_chat_id
     FROM rooms WHERE id = ? LIMIT 1`,
    [viewer.roomId],
  );
  const room = roomResult.rows[0];
  if (!room) throw new HttpError(404, "Комната не найдена.");
  const seasonResult = await query(
    "SELECT * FROM seasons WHERE room_id = ? ORDER BY created_at DESC LIMIT 1",
    [viewer.roomId],
  );
  const season = seasonResult.rows[0];
  if (!season) throw new HttpError(404, "Сезон не найден.");
  const seasonId = String(season.id);
  const [members, tasks, rewards, finalPrizes, credits, catalog, invites, boardCells] = await Promise.all([
    query(
      `SELECT m.id AS membership_id, m.role, m.branch, u.display_name, u.avatar_key,
        COALESCE(sp.position, 0) AS position,
        SUM(CASE WHEN rc.status = 'available' THEN 1 ELSE 0 END) AS available_rolls
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN season_players sp ON sp.membership_id = m.id AND sp.season_id = ?
       LEFT JOIN roll_credits rc ON rc.membership_id = m.id AND rc.season_id = ?
       WHERE m.room_id = ? AND m.is_active = 1
       GROUP BY m.id, m.role, m.branch, u.display_name, u.avatar_key, sp.position
       ORDER BY u.display_name`,
      [seasonId, seasonId, viewer.roomId],
    ),
    query(
      `SELECT ta.id, ta.title_snapshot, ta.description_snapshot, ta.assigned_at,
        ta.membership_id, u.display_name
       FROM task_assignments ta
       JOIN memberships m ON m.id = ta.membership_id
       JOIN users u ON u.id = m.user_id
       WHERE ta.season_id = ? AND ta.status = 'pending'
       ORDER BY ta.assigned_at`,
      [seasonId],
    ),
    query(
      `SELECT rg.id, rg.season_id, rg.membership_id, rg.name_snapshot, rg.value, rg.brand_choices_json,
        rg.brand_choice, rg.status, rg.granted_at, rg.issued_at, u.display_name, s.name AS season_name
       FROM reward_grants rg
       JOIN memberships m ON m.id = rg.membership_id
       JOIN users u ON u.id = m.user_id
       JOIN seasons s ON s.id = rg.season_id
       WHERE rg.season_id = ?
       ORDER BY CASE rg.status WHEN 'pending' THEN 0 ELSE 1 END, rg.granted_at DESC`,
      [seasonId],
    ),
    query(
      `SELECT s.id AS season_id, s.name AS season_name, s.winner_membership_id,
        s.final_prize, s.final_prize_status, s.completed_at, u.display_name
       FROM seasons s
       JOIN memberships m ON m.id = s.winner_membership_id
       JOIN users u ON u.id = m.user_id
       WHERE s.id = ? AND s.final_prize_status IS NOT NULL
       ORDER BY s.completed_at DESC`,
      [seasonId],
    ),
    query(
      `SELECT rc.id, rc.membership_id, rc.reason, rc.awarded_at, rc.expires_at, rc.paused_at,
        u.display_name
       FROM roll_credits rc
       JOIN memberships m ON m.id = rc.membership_id
       JOIN users u ON u.id = m.user_id
       WHERE rc.season_id = ? AND rc.status = 'available'
       ORDER BY rc.awarded_at`,
      [seasonId],
    ),
    query(
      `SELECT rc.id, rc.name, rc.category, rc.value, rc.quantity, rc.brand_choices_json,
        COUNT(rg.id) AS granted_count
       FROM reward_catalog rc
       LEFT JOIN reward_grants rg ON rg.catalog_id = rc.id AND rg.season_id = ?
       WHERE rc.room_id = ? AND rc.is_active = 1
       GROUP BY rc.id ORDER BY rc.value, rc.name`,
      [seasonId, viewer.roomId],
    ),
    query(
      `SELECT id, role, expires_at, assigned_membership_id, created_at
       FROM invitations WHERE room_id = ? ORDER BY created_at DESC LIMIT 10`,
      [viewer.roomId],
    ),
    loadRoomBoardCells(viewer.roomId),
  ]);

  const map = (rows: typeof members.rows) => rows.map((row) => Object.fromEntries(Object.entries(row)));
  return {
    room: Object.fromEntries(Object.entries(room)),
    season: Object.fromEntries(Object.entries(season)),
    members: map(members.rows),
    tasks: map(tasks.rows),
    rewards: map(rewards.rows),
    finalPrizes: map(finalPrizes.rows),
    credits: map(credits.rows),
    catalog: map(catalog.rows),
    invites: map(invites.rows),
    boardCells,
  };
}

export type BoardCellUpdate = {
  cellNumber: number;
  type: Exclude<CellType, "finish">;
  title?: string;
  description?: string;
  taskAchievementTag?: TaskAchievementTag | null;
  effect?: "move" | "extra_roll";
  value?: number;
  rewardName?: string;
  rewardValue?: number;
  rewardQuantity?: number;
  rewardBrandChoices?: string[];
};

export async function updateBoardCell(viewer: Viewer, input: BoardCellUpdate) {
  if (input.cellNumber < 1 || input.cellNumber > 59) throw new HttpError(400, "Можно настраивать клетки с 1 по 59.");
  if (input.type === "trap" && (!input.title?.trim() || !input.description?.trim())) {
    throw new HttpError(400, "Для клетки-задания укажите название и описание.");
  }
  if (input.type === "surprise" && !input.description?.trim()) {
    throw new HttpError(400, "Для события укажите текст, который увидит игрок.");
  }
  if (input.type === "treasure" && (!input.rewardName?.trim() || !input.rewardValue)) {
    throw new HttpError(400, "Для награды укажите название и стоимость.");
  }
  const now = new Date().toISOString();
  const rewardCatalogId = `custom-cell:${viewer.roomId}:${input.cellNumber}`;

  await writeTransaction(async (tx) => {
    const current = await tx.execute({
      sql: "SELECT reward_catalog_id FROM board_cell_configs WHERE room_id = ? AND cell_number = ?",
      args: [viewer.roomId, input.cellNumber],
    });
    const previousRewardId = current.rows[0]?.reward_catalog_id == null ? null : String(current.rows[0].reward_catalog_id);
    if (input.type === "treasure") {
      await tx.execute({
        sql: `INSERT INTO reward_catalog
          (id, room_id, name, category, value, brand_choices_json, quantity, is_active, created_at)
          VALUES (?, ?, ?, 'custom_cell', ?, ?, ?, 1, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, value = excluded.value,
            brand_choices_json = excluded.brand_choices_json, quantity = excluded.quantity, is_active = 1`,
        args: [
          rewardCatalogId,
          viewer.roomId,
          input.rewardName!.trim(),
          Number(input.rewardValue),
          JSON.stringify(input.rewardBrandChoices || []),
          Number(input.rewardQuantity || 12),
          now,
        ],
      });
    } else if (previousRewardId) {
      await tx.execute({
        sql: "UPDATE reward_catalog SET is_active = 0 WHERE id = ? AND category = 'custom_cell'",
        args: [previousRewardId],
      });
    }

    await tx.execute({
      sql: `INSERT INTO board_cell_configs
        (room_id, cell_number, type, title, description, task_achievement_tag, effect, move_value, reward_catalog_id,
          updated_by_membership_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, cell_number) DO UPDATE SET type = excluded.type, title = excluded.title,
          description = excluded.description, task_achievement_tag = excluded.task_achievement_tag,
          effect = excluded.effect, move_value = excluded.move_value,
          reward_catalog_id = excluded.reward_catalog_id,
          updated_by_membership_id = excluded.updated_by_membership_id, updated_at = excluded.updated_at`,
      args: [
        viewer.roomId,
        input.cellNumber,
        input.type,
        input.title?.trim() || null,
        input.description?.trim() || null,
        input.type === "trap" ? input.taskAchievementTag || null : null,
        input.type === "accelerate" ? input.effect || "move" : input.type === "setback" ? "move" : null,
        input.type === "setback" ? -Math.abs(Number(input.value || 1)) : input.type === "accelerate" ? Number(input.value || 1) : null,
        input.type === "treasure" ? rewardCatalogId : null,
        viewer.membershipId,
        now,
      ],
    });
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, 'board_cell_updated', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        viewer.membershipId,
        `Настроена клетка ${input.cellNumber}`,
        `Новая роль клетки: ${input.type}.`,
        now,
      ],
    });
  });
  return { ok: true, cell: (await loadRoomBoardCells(viewer.roomId))[input.cellNumber - 1] };
}

export async function resetBoardCell(viewer: Viewer, cellNumber: number) {
  if (cellNumber < 1 || cellNumber > 59) throw new HttpError(400, "Можно настраивать клетки с 1 по 59.");
  const now = new Date().toISOString();
  await writeTransaction(async (tx) => {
    const current = await tx.execute({
      sql: "SELECT reward_catalog_id FROM board_cell_configs WHERE room_id = ? AND cell_number = ?",
      args: [viewer.roomId, cellNumber],
    });
    const rewardId = current.rows[0]?.reward_catalog_id;
    await tx.execute({
      sql: "DELETE FROM board_cell_configs WHERE room_id = ? AND cell_number = ?",
      args: [viewer.roomId, cellNumber],
    });
    if (rewardId) {
      await tx.execute({
        sql: "UPDATE reward_catalog SET is_active = 0 WHERE id = ? AND category = 'custom_cell'",
        args: [String(rewardId)],
      });
    }
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, 'board_cell_reset', ?, ?, ?)`,
      args: [randomUUID(), viewer.roomId, viewer.membershipId, `Сброшена клетка ${cellNumber}`, "Возвращена базовая роль клетки.", now],
    });
  });
  return { ok: true, cell: (await loadRoomBoardCells(viewer.roomId))[cellNumber - 1] };
}

export async function createInvitation(viewer: Viewer, role: Exclude<Role, "owner">) {
  const rawToken = randomToken(24);
  const credentials = await query(
    `SELECT u.pin_hash, u.pin_salt
      FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE m.room_id = ? AND m.is_active = 1
     UNION ALL
     SELECT i.pin_hash, i.pin_salt FROM invitations i
      WHERE i.room_id = ? AND i.assigned_membership_id IS NULL AND i.expires_at > ?`,
    [viewer.roomId, viewer.roomId, new Date().toISOString()],
  );
  let rawPin = "";
  for (let attempt = 0; attempt < 100 && !rawPin; attempt += 1) {
    const candidate = String(randomInt(1000, 10000));
    let taken = false;
    for (const credential of credentials.rows) {
      if (await verifyPin(candidate, String(credential.pin_hash), String(credential.pin_salt))) {
        taken = true;
        break;
      }
    }
    if (!taken) rawPin = candidate;
  }
  if (!rawPin) throw new HttpError(503, "Не удалось подобрать свободный PIN. Повторите попытку.");
  const pin = await hashPin(rawPin);
  const id = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO invitations
      (id, room_id, role, token_hash, pin_hash, pin_salt, expires_at, created_by_membership_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, viewer.roomId, role, tokenHash(rawToken), pin.hash, pin.salt, expires.toISOString(), viewer.membershipId, now.toISOString()],
  );
  const baseUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return { id, url: `${baseUrl}/join/${rawToken}`, pin: rawPin, expiresAt: expires.toISOString() };
}

export async function updateSeasonEnd(viewer: Viewer, endsAt: Date) {
  if (endsAt.getTime() <= Date.now()) throw new HttpError(400, "Дата окончания должна быть в будущем.");
  const result = await query(
    "UPDATE seasons SET ends_at = ? WHERE room_id = ? AND status = 'active'",
    [endsAt.toISOString(), viewer.roomId],
  );
  if (!result.rowsAffected) throw new HttpError(409, "Нет активного сезона.");
  await query(
    `INSERT INTO game_events
      (id, room_id, actor_membership_id, type, title, body, created_at)
      VALUES (?, ?, ?, 'season_date_changed', ?, ?, ?)`,
    [
      randomUUID(),
      viewer.roomId,
      viewer.membershipId,
      "Обновлена дата окончания сезона",
      `Сезон завершится ${endsAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}.`,
      new Date().toISOString(),
    ],
  );
  return { ok: true };
}

export async function createNextSeason(viewer: Viewer, name: string, endsAt: Date, finalPrize = "10 000 ₽") {
  if (endsAt.getTime() <= Date.now()) throw new HttpError(400, "Дата окончания должна быть в будущем.");
  const prize = finalPrize.trim();
  if (!prize) throw new HttpError(400, "Укажите финальный приз.");
  const now = new Date().toISOString();
  const seasonId = randomUUID();
  await writeTransaction(async (tx) => {
    const active = await tx.execute({
      sql: "SELECT id FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      args: [viewer.roomId],
    });
    if (active.rows.length) throw new HttpError(409, "Сначала должен завершиться текущий сезон.");
    await tx.execute({
      sql: `UPDATE roll_credits SET status = 'void'
        WHERE season_id IN (SELECT id FROM seasons WHERE room_id = ?) AND status = 'available'`,
      args: [viewer.roomId],
    });
    await tx.execute({
      sql: `INSERT INTO seasons
        (id, room_id, name, starts_at, ends_at, status, final_prize, gift_budget, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, 10000, ?)`,
      args: [seasonId, viewer.roomId, name, now, endsAt.toISOString(), prize, now],
    });
    const players = await tx.execute({
      sql: "SELECT id FROM memberships WHERE room_id = ? AND is_active = 1 AND role != 'observer'",
      args: [viewer.roomId],
    });
    for (const player of players.rows) {
      await tx.execute({
        sql: "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
        args: [randomUUID(), seasonId, String(player.id), now],
      });
    }
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, 'season_started', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        seasonId,
        viewer.membershipId,
        "Новый сезон начался",
        `${name}: вся стая снова выходит на старт.`,
        now,
      ],
    });
  });
  await sendGameNotification(
    viewer.roomId,
    `🌅 **Над золотой саванной взошло новое солнце!**\n\n🦁 Сезон «${name}» начался — весь прайд снова на старте.\n👑 Финиш: клетка 60\n💛 Финальный приз: **${prize}**\n\nПусть каждый новый след ведёт к большой победе ✨`,
    `season:${seasonId}:start`,
  );
  return { id: seasonId };
}

export async function updateFinalPrize(viewer: Viewer, finalPrize: string) {
  const prize = finalPrize.trim();
  if (!prize) throw new HttpError(400, "Укажите финальный приз.");
  const now = new Date().toISOString();
  const result = await query(
    "UPDATE seasons SET final_prize = ? WHERE room_id = ? AND status = 'active'",
    [prize, viewer.roomId],
  );
  if (!result.rowsAffected) throw new HttpError(409, "Изменить приз можно только в активном сезоне.");
  await query(
    `INSERT INTO game_events
      (id, room_id, actor_membership_id, type, title, body, created_at)
      VALUES (?, ?, ?, 'final_prize_changed', ?, ?, ?)`,
    [
      randomUUID(),
      viewer.roomId,
      viewer.membershipId,
      "Обновлён финальный приз",
      `Приз за прохождение карты: ${prize}.`,
      now,
    ],
  );
  return { ok: true, finalPrize: prize };
}

export async function chooseRewardBrand(viewer: Viewer, grantId: string, brand: string) {
  const result = await query(
    `SELECT id, brand_choices_json, status FROM reward_grants
     WHERE id = ? AND membership_id = ?`,
    [grantId, viewer.membershipId],
  );
  const reward = result.rows[0];
  if (!reward) throw new HttpError(404, "Награда не найдена.");
  if (String(reward.status) !== "pending") throw new HttpError(409, "Выданную награду изменить нельзя.");
  const choices = JSON.parse(String(reward.brand_choices_json || "[]")) as string[];
  if (!choices.includes(brand)) throw new HttpError(400, "Выберите доступный магазин.");
  await query("UPDATE reward_grants SET brand_choice = ? WHERE id = ? AND membership_id = ?", [
    brand,
    grantId,
    viewer.membershipId,
  ]);
  return { ok: true };
}

export async function issueReward(viewer: Viewer, grantId: string) {
  const now = new Date().toISOString();
  const result = await writeTransaction(async (tx) => {
    const rewardResult = await tx.execute({
      sql: `SELECT rg.*, u.display_name
        FROM reward_grants rg
        JOIN memberships m ON m.id = rg.membership_id
        JOIN users u ON u.id = m.user_id
        JOIN seasons s ON s.id = rg.season_id
        WHERE rg.id = ? AND s.room_id = ?`,
      args: [grantId, viewer.roomId],
    });
    const reward = rewardResult.rows[0];
    if (!reward) throw new HttpError(404, "Награда не найдена.");
    if (String(reward.status) !== "pending") throw new HttpError(409, "Награда уже выдана.");
    const choices = JSON.parse(String(reward.brand_choices_json || "[]")) as string[];
    if (choices.length && !reward.brand_choice) {
      throw new HttpError(409, "Сначала игрок должен выбрать магазин сертификата.");
    }
    await tx.execute({
      sql: "UPDATE reward_grants SET status = 'issued', issued_at = ?, issued_by_membership_id = ? WHERE id = ? AND status = 'pending'",
      args: [now, viewer.membershipId, grantId],
    });
    const fullName = reward.brand_choice
      ? `${String(reward.name_snapshot)} — выбран ${String(reward.brand_choice)}`
      : String(reward.name_snapshot);
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'reward_issued', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        String(reward.season_id),
        String(reward.membership_id),
        viewer.membershipId,
        "Сокровище вручено",
        `${String(reward.display_name)}: награда «${fullName}» отмечена как выданная.`,
        now,
      ],
    });
    return { name: String(reward.display_name), reward: fullName };
  });
  return result;
}

export async function issueFinalPrize(viewer: Viewer, seasonId: string) {
  const now = new Date().toISOString();
  const result = await writeTransaction(async (tx) => {
    const seasonResult = await tx.execute({
      sql: `SELECT s.*, u.display_name
        FROM seasons s
        JOIN memberships m ON m.id = s.winner_membership_id
        JOIN users u ON u.id = m.user_id
        WHERE s.id = ? AND s.room_id = ?`,
      args: [seasonId, viewer.roomId],
    });
    const season = seasonResult.rows[0];
    if (!season || !season.winner_membership_id) throw new HttpError(404, "Победитель сезона не найден.");
    if (String(season.final_prize_status) !== "pending") throw new HttpError(409, "Финальный приз уже выдан.");
    await tx.execute({
      sql: `UPDATE seasons SET final_prize_status = 'issued', final_prize_issued_at = ?,
        final_prize_issued_by_membership_id = ? WHERE id = ? AND final_prize_status = 'pending'`,
      args: [now, viewer.membershipId, seasonId],
    });
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'final_prize_issued', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        seasonId,
        String(season.winner_membership_id),
        viewer.membershipId,
        "Финальный приз вручён",
        `${String(season.display_name)}: финальный приз «${String(season.final_prize)}» отмечен как выданный.`,
        now,
      ],
    });
    return { name: String(season.display_name), prize: String(season.final_prize) };
  });
  await sendGameNotification(
    viewer.roomId,
    `🏆💛 **Финальный приз вручён!**\n\n✨ Победа сезона — **${result.name}**\n🎁 Приз за прохождение карты: **${result.prize}**\n\nПусть этот триумф станет началом новой сильной главы!`,
    `season:${seasonId}:final-prize-issued`,
  );
  return result;
}
