import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import {
  achievementsAnnouncedWithRoll,
  getUnannouncedAchievements,
  markAchievementsAnnounced,
  syncPlayerAchievements,
} from "@/lib/achievements";
import { boardCells, surpriseStories } from "@/lib/board";
import { loadRoomBoardCell, loadRoomBoardCells, publicBoardCells } from "@/lib/board-config";
import { query, writeTransaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { sendGameNotification } from "@/lib/notifications";
import { calculateBasePosition, calculateFinalPosition, ROLL_TTL_MS } from "@/lib/roll-rules";
import type { GameState, Role, Viewer } from "@/lib/types";

type Row = Record<string, unknown>;

function rowString(row: Row, key: string) {
  return String(row[key] ?? "");
}

function roleOf(row: Row, key = "role") {
  return rowString(row, key) as Role;
}

function formatRewardValue(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function rewardTitleHasValue(title: string) {
  return /\d[\d\s\u00a0\u202f]*\s*₽/.test(title);
}

function rewardFromEffectText(effectText: string) {
  const summary = effectText.replace(/^Сокровище открыто:\s*/, "").replace(/\.$/, "");
  const amountMatch = summary.match(/\s—\s([\d\s\u00a0\u202f]+)\s*₽$/);
  if (!amountMatch) return { title: summary, value: null };
  return {
    title: summary.slice(0, amountMatch.index).trim(),
    value: Number(amountMatch[1].replace(/\D/g, "")) || null,
  };
}

function legacyEventText(value: unknown) {
  return String(value ?? "")
    .replaceAll("Ловушка:", "Задание:")
    .replaceAll("Ловушка пройдена", "Задание выполнено")
    .replaceAll("выбралась из ловушки", "задание завершено")
    .replaceAll("в ловушке", "с активным заданием");
}

async function expireSeasonIfNeeded(roomId: string) {
  const now = new Date().toISOString();
  await writeTransaction(async (tx) => {
    const seasonResult = await tx.execute({
      sql: "SELECT id, ends_at FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      args: [roomId],
    });
    const season = seasonResult.rows[0];
    if (!season || String(season.ends_at) > now) return;
    await tx.execute({
      sql: "UPDATE seasons SET status = 'expired', completed_at = ? WHERE id = ? AND status = 'active'",
      args: [now, String(season.id)],
    });
    await tx.execute({
      sql: "UPDATE roll_credits SET status = 'void' WHERE season_id = ? AND status = 'available'",
      args: [String(season.id)],
    });
    await tx.execute({
      sql: "INSERT INTO game_events (id, room_id, season_id, type, title, body, created_at) VALUES (?, ?, ?, 'season_expired', ?, ?, ?)",
      args: [
        randomUUID(),
        roomId,
        String(season.id),
        "Солнце сезона зашло",
        "Дата окончания наступила, но никто не достиг финиша. Финальный приз не разыгран.",
        now,
      ],
    });
  });
}

export async function getGameState(viewer: Viewer): Promise<GameState> {
  await expireSeasonIfNeeded(viewer.roomId);
  const seasonResult = await query(
    "SELECT * FROM seasons WHERE room_id = ? ORDER BY created_at DESC LIMIT 1",
    [viewer.roomId],
  );
  const season = seasonResult.rows[0];
  if (!season) throw new HttpError(404, "Сезон ещё не создан.");
  const seasonId = String(season.id);
  const now = new Date().toISOString();
  await query(
    "UPDATE roll_credits SET status = 'expired', expired_at = COALESCE(expired_at, expires_at, ?) WHERE season_id = ? AND status = 'available' AND paused_at IS NULL AND expires_at <= ?",
    [now, seasonId, now],
  );
  const journey = await writeTransaction((tx) =>
    syncPlayerAchievements(tx, seasonId, viewer.membershipId, now),
  );

  const [playersResult, taskResult, rewardsResult, finalPrizesResult, eventsResult, reactionResult, activeRollsResult, configuredCells] = await Promise.all([
    query(
      `SELECT
        m.id AS membership_id, m.role, u.display_name, u.avatar_key, sp.position,
        SUM(CASE WHEN rc.status = 'available' THEN 1 ELSE 0 END) AS available_rolls,
        MIN(CASE WHEN rc.status = 'available' AND rc.paused_at IS NULL THEN rc.expires_at END) AS next_expires,
        EXISTS(
          SELECT 1 FROM task_assignments ta
          WHERE ta.season_id = sp.season_id AND ta.membership_id = m.id AND ta.status = 'pending'
        ) AS blocked,
        COALESCE((
          SELECT MAX(CASE pa.achievement_key
            WHEN 'chapter-pride-trail' THEN 1
            WHEN 'chapter-watering-place' THEN 2
            WHEN 'chapter-heir-rock' THEN 3
            ELSE 0 END)
          FROM player_achievements pa
          WHERE pa.season_id = sp.season_id AND pa.membership_id = m.id
        ), 0) AS cosmetic_tier
      FROM season_players sp
      JOIN memberships m ON m.id = sp.membership_id AND m.is_active = 1
      JOIN users u ON u.id = m.user_id
      LEFT JOIN roll_credits rc ON rc.season_id = sp.season_id AND rc.membership_id = m.id
      WHERE sp.season_id = ?
      GROUP BY m.id, m.role, u.display_name, u.avatar_key, sp.position, sp.season_id
      ORDER BY sp.position DESC, u.display_name ASC`,
      [seasonId],
    ),
    query(
      `SELECT id, title_snapshot, description_snapshot, assigned_at
       FROM task_assignments
       WHERE season_id = ? AND membership_id = ? AND status = 'pending'
       ORDER BY assigned_at DESC LIMIT 1`,
      [seasonId, viewer.membershipId],
    ),
    query(
      `SELECT rg.id, rg.name_snapshot, rg.value, rg.brand_choice, rg.brand_choices_json,
        rg.status, rg.granted_at
       FROM reward_grants rg
       WHERE rg.season_id = ? AND rg.membership_id = ?
       ORDER BY CASE rg.status WHEN 'pending' THEN 0 ELSE 1 END, rg.granted_at DESC`,
      [seasonId, viewer.membershipId],
    ),
    query(
      `SELECT id, name, final_prize, final_prize_status, completed_at
       FROM seasons
       WHERE id = ? AND winner_membership_id = ? AND final_prize_status IS NOT NULL
       ORDER BY completed_at DESC`,
      [seasonId, viewer.membershipId],
    ),
    query(
      `SELECT ge.id, ge.type, ge.title, ge.body, ge.created_at
       FROM game_events ge
       WHERE ge.room_id = ? AND ge.season_id = ?
       ORDER BY ge.created_at DESC LIMIT 30`,
      [viewer.roomId, seasonId],
    ),
    query(
      `SELECT er.event_id, er.reaction, COUNT(*) AS reaction_count,
        MAX(CASE WHEN er.membership_id = ? THEN 1 ELSE 0 END) AS mine
       FROM event_reactions er
       JOIN game_events ge ON ge.id = er.event_id
       WHERE ge.room_id = ?
       GROUP BY er.event_id, er.reaction`,
      [viewer.membershipId, viewer.roomId],
    ),
    query(
      `SELECT id, expires_at, paused_at FROM roll_credits
       WHERE season_id = ? AND membership_id = ? AND status = 'available'
       ORDER BY awarded_at`,
      [seasonId, viewer.membershipId],
    ),
    loadRoomBoardCells(viewer.roomId),
  ]);

  const roomResult = await query("SELECT id, name, max_players FROM rooms WHERE id = ?", [viewer.roomId]);
  const room = roomResult.rows[0];
  const task = taskResult.rows[0];
  const personalRewards = rewardsResult.rows.map((reward) => ({
    id: rowString(reward, "id"),
    name: rowString(reward, "name_snapshot"),
    value: Number(reward.value),
    brandChoice: reward.brand_choice == null ? null : String(reward.brand_choice),
    brandChoices: JSON.parse(rowString(reward, "brand_choices_json") || "[]") as string[],
    status: rowString(reward, "status") as "pending" | "issued",
    grantedAt: rowString(reward, "granted_at"),
  }));
  for (const finalPrize of finalPrizesResult.rows) {
    const finalSeasonId = rowString(finalPrize, "id");
    personalRewards.unshift({
      id: `final:${finalSeasonId}`,
      name: `Финальный приз «${rowString(finalPrize, "name")}» — ${rowString(finalPrize, "final_prize")}`,
      value: 0,
      brandChoice: null,
      brandChoices: [],
      status: rowString(finalPrize, "final_prize_status") as "pending" | "issued",
      grantedAt: rowString(finalPrize, "completed_at"),
    });
  }
  const reactionMap = new Map<string, GameState["events"][number]["reactions"]>();
  for (const reaction of reactionResult.rows) {
    const eventId = rowString(reaction, "event_id");
    const list = reactionMap.get(eventId) || [];
    list.push({
      key: rowString(reaction, "reaction") as GameState["events"][number]["reactions"][number]["key"],
      count: Number(reaction.reaction_count),
      mine: Boolean(reaction.mine),
    });
    reactionMap.set(eventId, list);
  }
  const nearestAchievementKeys = journey.achievements
    .filter((achievement) => !achievement.unlocked && achievement.kind !== "chapter")
    .sort((a, b) => (b.progress / b.target) - (a.progress / a.target) || a.target - b.target)
    .slice(0, 3)
    .map((achievement) => achievement.key);
  return {
    generatedAt: now,
    viewer,
    room: { id: viewer.roomId, name: rowString(room, "name"), maxPlayers: Number(room.max_players) },
    season: {
      id: seasonId,
      name: rowString(season, "name"),
      status: rowString(season, "status") as GameState["season"]["status"],
      endsAt: rowString(season, "ends_at"),
      winnerMembershipId: season.winner_membership_id == null ? null : String(season.winner_membership_id),
      finalPrize: rowString(season, "final_prize"),
    },
    boardCells: publicBoardCells(configuredCells),
    players: playersResult.rows.map((player) => ({
      membershipId: rowString(player, "membership_id"),
      displayName: rowString(player, "display_name"),
      avatarKey: rowString(player, "avatar_key"),
      role: roleOf(player),
      position: Number(player.position),
      availableRolls: Number(player.available_rolls),
      nextRollExpiresAt: player.next_expires == null ? null : String(player.next_expires),
      blocked: Boolean(player.blocked),
      cosmeticTier: Number(player.cosmetic_tier),
    })),
    myJourney: {
      totalSales: journey.totalSales,
      achievements: journey.achievements,
      nearestAchievementKeys,
      activeRolls: activeRollsResult.rows.map((roll) => ({
        id: rowString(roll, "id"),
        expiresAt: roll.expires_at == null ? null : String(roll.expires_at),
        paused: roll.paused_at != null,
      })),
    },
    myPendingTask: task
      ? {
          id: rowString(task, "id"),
          title: rowString(task, "title_snapshot"),
          description: rowString(task, "description_snapshot"),
          assignedAt: rowString(task, "assigned_at"),
        }
      : null,
    myRewards: personalRewards,
    events: eventsResult.rows.map((event) => ({
      id: rowString(event, "id"),
      type: rowString(event, "type"),
      title: legacyEventText(event.title),
      body: legacyEventText(event.body),
      createdAt: rowString(event, "created_at"),
      reactions: reactionMap.get(rowString(event, "id")) || [],
    })),
  };
}

async function pickTask(tx: Transaction, roomId: string) {
  const result = await tx.execute({
    sql: "SELECT id, title, description, achievement_tag FROM task_templates WHERE room_id = ? AND is_active = 1",
    args: [roomId],
  });
  if (!result.rows.length) throw new HttpError(409, "В комнате нет активных заданий.");
  return result.rows[randomInt(result.rows.length)];
}

async function pickReward(tx: Transaction, roomId: string, seasonId: string, catalogId: string | null = null) {
  // A reward explicitly attached to a board cell belongs to every player who
  // lands there. Shared catalog stock and the planning budget must not turn a
  // valid landing into an empty chest after another player claimed it first.
  if (catalogId) {
    const fixedReward = await tx.execute({
      sql: `SELECT id, name, value, brand_choices_json, quantity
        FROM reward_catalog
        WHERE id = ? AND room_id = ? AND category = 'custom_cell' AND is_active = 1
        LIMIT 1`,
      args: [catalogId, roomId],
    });
    return fixedReward.rows[0] || null;
  }

  const result = await tx.execute({
    sql: `SELECT rc.id, rc.name, rc.value, rc.brand_choices_json, rc.quantity,
      COUNT(rg.id) AS granted_count
      FROM reward_catalog rc
      LEFT JOIN reward_grants rg ON rg.catalog_id = rc.id AND rg.season_id = ?
      WHERE rc.room_id = ? AND rc.is_active = 1
        AND rc.category != 'custom_cell'
      GROUP BY rc.id
      HAVING COUNT(rg.id) < rc.quantity`,
    args: [seasonId, roomId],
  });
  const budgetResult = await tx.execute({
    sql: `SELECT s.gift_budget, COALESCE(SUM(rg.value), 0) AS granted_value
      FROM seasons s
      LEFT JOIN reward_grants rg ON rg.season_id = s.id
      WHERE s.id = ? GROUP BY s.id`,
    args: [seasonId],
  });
  const finance = budgetResult.rows[0];
  const remaining = Number(finance?.gift_budget || 0) - Number(finance?.granted_value || 0);
  const affordable = result.rows.filter((reward) => Number(reward.value) <= remaining);
  if (!affordable.length) return null;
  return affordable[randomInt(affordable.length)];
}

export type RollOutcome = {
  diceValue: number;
  startPosition: number;
  basePosition: number;
  finalPosition: number;
  cellType: string;
  effectText: string;
  rewardTitle: string | null;
  rewardValue?: number | null;
  winnerName: string | null;
  seasonCompleted: boolean;
  unlockedAchievements: GameState["myJourney"]["achievements"];
};

export async function performRoll(viewer: Viewer, forcedDice?: number, requestId: string = randomUUID()): Promise<RollOutcome> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const diceValue = forcedDice ?? randomInt(1, 7);
  if (!Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) throw new Error("Invalid dice value");

  const outcome = await writeTransaction(async (tx) => {
    const existingResult = await tx.execute({
      sql: `SELECT r.id AS roll_id, r.dice_value, r.start_position, r.base_position, r.final_position,
        r.cell_type, r.effect_text, s.winner_membership_id
        FROM rolls r JOIN seasons s ON s.id = r.season_id
        WHERE r.request_id = ? AND r.membership_id = ? LIMIT 1`,
      args: [requestId, viewer.membershipId],
    });
    const existing = existingResult.rows[0];
    if (existing) {
      const rollId = String(existing.roll_id);
      const existingReward = String(existing.cell_type) === "treasure"
        ? rewardFromEffectText(String(existing.effect_text))
        : null;
      return {
        diceValue: Number(existing.dice_value),
        startPosition: Number(existing.start_position),
        basePosition: Number(existing.base_position),
        finalPosition: Number(existing.final_position),
        cellType: String(existing.cell_type),
        effectText: String(existing.effect_text),
        rewardTitle: existingReward?.title || null,
        rewardValue: existingReward?.value || null,
        winnerName: String(existing.winner_membership_id || "") === viewer.membershipId ? viewer.displayName : null,
        seasonCompleted: String(existing.winner_membership_id || "") === viewer.membershipId,
        rollId,
        unlockedAchievements: await achievementsAnnouncedWithRoll(tx, rollId),
      };
    }
    const seasonResult = await tx.execute({
      sql: "SELECT * FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      args: [viewer.roomId],
    });
    const season = seasonResult.rows[0];
    if (!season) throw new HttpError(409, "Активный сезон завершён.");
    if (String(season.ends_at) <= now) throw new HttpError(409, "Срок сезона истёк.");
    const seasonId = String(season.id);

    const taskResult = await tx.execute({
      sql: "SELECT id FROM task_assignments WHERE season_id = ? AND membership_id = ? AND status = 'pending' LIMIT 1",
      args: [seasonId, viewer.membershipId],
    });
    if (taskResult.rows.length) throw new HttpError(409, "Сначала выполни активное задание.");

    await tx.execute({
      sql: "UPDATE roll_credits SET status = 'expired', expired_at = COALESCE(expired_at, expires_at, ?) WHERE season_id = ? AND membership_id = ? AND status = 'available' AND paused_at IS NULL AND expires_at <= ?",
      args: [now, seasonId, viewer.membershipId, now],
    });
    const creditResult = await tx.execute({
      sql: `SELECT id FROM roll_credits
            WHERE season_id = ? AND membership_id = ? AND status = 'available'
              AND paused_at IS NULL AND expires_at > ?
            ORDER BY awarded_at ASC LIMIT 1`,
      args: [seasonId, viewer.membershipId, now],
    });
    const credit = creditResult.rows[0];
    if (!credit) throw new HttpError(409, "Нет доступных бросков.");

    const playerResult = await tx.execute({
      sql: "SELECT position FROM season_players WHERE season_id = ? AND membership_id = ? LIMIT 1",
      args: [seasonId, viewer.membershipId],
    });
    const player = playerResult.rows[0];
    if (!player) throw new HttpError(403, "Наблюдатель не может бросать кубик.");
    const startPosition = Number(player.position);
    const basePosition = calculateBasePosition(startPosition, diceValue);
    const cell = await loadRoomBoardCell(tx, viewer.roomId, basePosition);
    const finalPosition = calculateFinalPosition(basePosition, cell);
    let effectText = "Спокойный участок пути.";
    let taskTitle = "";
    let rewardTitle = "";
    let rewardValue: number | null = null;

    if (cell.type === "setback") {
      effectText = `Препятствие возвращает на ${Math.abs(cell.value || 0)} кл.`;
    } else if (cell.type === "accelerate" && cell.effect === "move") {
      effectText = `Ускорение переносит вперёд на ${cell.value} кл.`;
    } else if (cell.type === "accelerate" && cell.effect === "extra_roll") {
      effectText = "Саванна дарит дополнительный бросок на 72 часа.";
      await tx.execute({
        sql: `INSERT INTO roll_credits
          (id, season_id, membership_id, awarded_by_membership_id, source_type, reason, status, awarded_at, expires_at)
          VALUES (?, ?, ?, NULL, 'board', ?, 'available', ?, ?)`,
        args: [
          randomUUID(),
          seasonId,
          viewer.membershipId,
          `Дополнительный бросок с клетки ${cell.number}`,
          now,
          new Date(nowDate.getTime() + ROLL_TTL_MS).toISOString(),
        ],
      });
    } else if (cell.type === "trap") {
      const task = cell.custom && cell.title && cell.description
        ? { id: null, title: cell.title, description: cell.description, achievement_tag: cell.taskAchievementTag }
        : await pickTask(tx, viewer.roomId);
      taskTitle = String(task.title);
      const taskDescription = String(task.description).trim();
      effectText = `Задание «${taskTitle}»\n${taskDescription}\nСледующий ход закрыт до проверки руководителем.`;
      await tx.execute({
        sql: `INSERT INTO task_assignments
          (id, season_id, membership_id, template_id, cell_number, title_snapshot, description_snapshot,
            achievement_tag_snapshot, status, assigned_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        args: [
          randomUUID(),
          seasonId,
          viewer.membershipId,
          task.id == null ? null : String(task.id),
          cell.number,
          taskTitle,
          String(task.description),
          task.achievement_tag == null ? null : String(task.achievement_tag),
          now,
        ],
      });
      await tx.execute({
        sql: `UPDATE roll_credits
          SET paused_at = ?, paused_remaining_ms = MAX(0, CAST((julianday(expires_at) - julianday(?)) * 86400000 AS INTEGER)), expires_at = NULL
          WHERE season_id = ? AND membership_id = ? AND status = 'available' AND paused_at IS NULL`,
        args: [now, now, seasonId, viewer.membershipId],
      });
    } else if (cell.type === "treasure") {
      const reward = await pickReward(tx, viewer.roomId, seasonId, cell.rewardCatalogId);
      if (reward) {
        rewardTitle = String(reward.name);
        rewardValue = Number(reward.value);
        const visibleReward = rewardTitleHasValue(rewardTitle)
          ? rewardTitle
          : `${rewardTitle} — ${formatRewardValue(rewardValue)}`;
        effectText = `Сокровище открыто: ${visibleReward}.`;
        await tx.execute({
          sql: `INSERT INTO reward_grants
            (id, season_id, membership_id, catalog_id, cell_number, name_snapshot, value, brand_choices_json, status, granted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          args: [
            randomUUID(),
            seasonId,
            viewer.membershipId,
            String(reward.id),
            cell.number,
            rewardTitle,
            Number(reward.value),
            String(reward.brand_choices_json),
            now,
          ],
        });
      } else {
        effectText = "Клад сезона уже разобран — но находка останется в летописи.";
      }
    } else if (cell.type === "surprise") {
      effectText = cell.custom && cell.description
        ? cell.description
        : surpriseStories[randomInt(surpriseStories.length)];
    }

    await tx.execute({
      sql: "UPDATE roll_credits SET status = 'used', used_at = ? WHERE id = ? AND status = 'available'",
      args: [now, String(credit.id)],
    });
    await tx.execute({
      sql: "UPDATE season_players SET position = ? WHERE season_id = ? AND membership_id = ?",
      args: [finalPosition, seasonId, viewer.membershipId],
    });
    const rollId = randomUUID();
    await tx.execute({
      sql: `INSERT INTO rolls
        (id, request_id, credit_id, season_id, membership_id, dice_value, start_position, base_position, cell_number, cell_type, effect_value, effect_text, final_position, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        rollId,
        requestId,
        String(credit.id),
        seasonId,
        viewer.membershipId,
        diceValue,
        startPosition,
        basePosition,
        cell.number,
        cell.type,
        finalPosition - basePosition,
        effectText,
        finalPosition,
        now,
      ],
    });

    const eventTitle = {
      normal: `${viewer.displayName} оставляет новый след`,
      treasure: `${viewer.displayName} находит сокровище`,
      surprise: `${viewer.displayName} открывает тайну саванны`,
      setback: `${viewer.displayName} встречает препятствие`,
      trap: `${viewer.displayName} принимает испытание`,
      accelerate: `${viewer.displayName} ловит золотой ветер`,
      finish: "Вершина достигнута!",
    }[cell.type];
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, 'roll', ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        seasonId,
        viewer.membershipId,
        viewer.membershipId,
        eventTitle,
        `🎲 Кубик показывает ${diceValue}. Путь приводит на клетку ${basePosition}. ${effectText}`,
        JSON.stringify({ rollId, diceValue, startPosition, basePosition, finalPosition, taskTitle, rewardTitle, rewardValue }),
        now,
      ],
    });

    await syncPlayerAchievements(tx, seasonId, viewer.membershipId, now);
    const unlockedAchievements = await getUnannouncedAchievements(tx, seasonId, viewer.membershipId);
    await markAchievementsAnnounced(
      tx,
      seasonId,
      viewer.membershipId,
      unlockedAchievements.map((achievement) => achievement.key),
      rollId,
      now,
    );

    const seasonCompleted = finalPosition >= 60;
    if (seasonCompleted) {
      await tx.execute({
        sql: "UPDATE seasons SET status = 'completed', winner_membership_id = ?, completed_at = ?, final_prize_status = 'pending' WHERE id = ? AND status = 'active'",
        args: [viewer.membershipId, now, seasonId],
      });
      await tx.execute({
        sql: "UPDATE roll_credits SET status = 'void' WHERE season_id = ? AND status = 'available'",
        args: [seasonId],
      });
      await tx.execute({
        sql: `INSERT INTO game_events
          (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
          VALUES (?, ?, ?, ?, ?, 'winner', ?, ?, ?)`,
        args: [
          randomUUID(),
          viewer.roomId,
          seasonId,
          viewer.membershipId,
          viewer.membershipId,
          `Победа сезона — ${viewer.displayName}`,
          `Клетка 60 достигнута раньше остальных. Финальный приз: ${rowString(season, "final_prize")}.`,
          now,
        ],
      });
    }

    return {
      diceValue,
      startPosition,
      basePosition,
      finalPosition,
      cellType: cell.type,
      effectText,
      rewardTitle: rewardTitle || null,
      rewardValue,
      winnerName: seasonCompleted ? viewer.displayName : null,
      seasonCompleted,
      rollId,
      unlockedAchievements,
    };
  });

  const maxText = outcome.seasonCompleted
    ? `🏆✨ **Победа сезона — ${viewer.displayName}!**\n\n👑 Клетка 60 достигнута раньше остальных.\n💛 Весь прайд встречает триумф у Вершины!`
    : `🎲 **${viewer.displayName} делает новый ход — выпало ${outcome.diceValue}!**\n${({ treasure: "🎁", surprise: "🔮", setback: "🪨", trap: "📜", accelerate: "🌬️", normal: "🐾", finish: "👑" } as const)[outcome.cellType]} Клетка **${outcome.basePosition}**. ${outcome.effectText}\n💛 Ещё один след появился на общей тропе.`;
  await sendGameNotification(viewer.roomId, maxText, `roll:${outcome.rollId}`);
  await Promise.all(outcome.unlockedAchievements.map((achievement) =>
    sendGameNotification(
      viewer.roomId,
      `🏅✨ **Новый титул у ${viewer.displayName}!**\n\n${achievement.symbol} **«${achievement.title}»**\n${achievement.description}\n\n💛 Витрина достижений становится ярче!`,
      `roll:${outcome.rollId}:achievement:${achievement.key}`,
    ),
  ));
  return outcome;
}

export async function awardRolls(viewer: Viewer, membershipIds: string[], reason: string) {
  if (!membershipIds.length) throw new HttpError(400, "Выберите хотя бы одного участника продажи.");
  const uniqueIds = [...new Set(membershipIds)];
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const awarded: Array<{ id: string; name: string }> = [];

  await writeTransaction(async (tx) => {
    const seasonResult = await tx.execute({
      sql: "SELECT id, ends_at FROM seasons WHERE room_id = ? AND status = 'active' LIMIT 1",
      args: [viewer.roomId],
    });
    const season = seasonResult.rows[0];
    if (!season || String(season.ends_at) <= now) throw new HttpError(409, "Нет активного сезона.");
    for (const membershipId of uniqueIds) {
      if (viewer.role === "manager" && membershipId === viewer.membershipId) {
        throw new HttpError(403, "Руководитель не может начислить бросок себе. Это может сделать владелец.");
      }
      const targetResult = await tx.execute({
        sql: `SELECT m.id, m.role, u.display_name,
          EXISTS(SELECT 1 FROM task_assignments ta WHERE ta.season_id = ? AND ta.membership_id = m.id AND ta.status = 'pending') AS blocked
          FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.id = ? AND m.room_id = ? AND m.is_active = 1`,
        args: [String(season.id), membershipId, viewer.roomId],
      });
      const target = targetResult.rows[0];
      if (!target || String(target.role) === "observer") throw new HttpError(404, "Игрок не найден.");
      const creditId = randomUUID();
      const blocked = Boolean(target.blocked);
      await tx.execute({
        sql: `INSERT INTO roll_credits
          (id, season_id, membership_id, awarded_by_membership_id, source_type, reason, status, awarded_at, expires_at, paused_at, paused_remaining_ms)
          VALUES (?, ?, ?, ?, 'sale', ?, 'available', ?, ?, ?, ?)`,
        args: [
          creditId,
          String(season.id),
          membershipId,
          viewer.membershipId,
          reason,
          now,
          blocked ? null : new Date(nowDate.getTime() + ROLL_TTL_MS).toISOString(),
          blocked ? now : null,
          blocked ? ROLL_TTL_MS : null,
        ],
      });
      awarded.push({ id: creditId, name: String(target.display_name) });
    }
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, actor_membership_id, type, title, body, metadata_json, created_at)
        VALUES (?, ?, ?, ?, 'rolls_awarded', ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        String(season.id),
        viewer.membershipId,
        "В саванне появились новые шансы",
        `🦁 ${viewer.displayName} открывает путь к новому ходу: ${awarded.map((item) => item.name).join(", ")}.`,
        JSON.stringify({ membershipIds: uniqueIds, reason }),
        now,
      ],
    });
  });

  const deliveries = await Promise.all(awarded.map((item) =>
    sendGameNotification(
      viewer.roomId,
      `🎲💛 **${item.name}, саванна дарит тебе новый бросок!**\n\n⏳ Он доступен в течение **72 часов**.\n📜 Если сейчас выполняется задание, время бережно остановится и продолжится после проверки.\n\nПусть кубик приведёт к сокровищу ✨`,
      `credit:${item.id}`,
    ),
  ));
  return awarded.map((item, index) => ({ ...item, delivery: deliveries[index] }));
}

export async function cancelRoll(viewer: Viewer, creditId: string, reason: string) {
  const now = new Date().toISOString();
  return writeTransaction(async (tx) => {
    const creditResult = await tx.execute({
      sql: `SELECT rc.id, rc.status, rc.membership_id, rc.season_id, u.display_name
        FROM roll_credits rc
        JOIN memberships m ON m.id = rc.membership_id
        JOIN users u ON u.id = m.user_id
        JOIN seasons s ON s.id = rc.season_id
        WHERE rc.id = ? AND s.room_id = ?`,
      args: [creditId, viewer.roomId],
    });
    const credit = creditResult.rows[0];
    if (!credit) throw new HttpError(404, "Бросок не найден.");
    if (String(credit.status) !== "available") throw new HttpError(409, "Можно отменить только неиспользованный бросок.");
    await tx.execute({
      sql: "UPDATE roll_credits SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ? WHERE id = ? AND status = 'available'",
      args: [now, reason, creditId],
    });
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'roll_cancelled', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        String(credit.season_id),
        String(credit.membership_id),
        viewer.membershipId,
        "Ошибочный бросок отменён",
        `${viewer.displayName} отменяет неиспользованный бросок игрока ${String(credit.display_name)}. Причина: ${reason}`,
        now,
      ],
    });
    await syncPlayerAchievements(tx, String(credit.season_id), String(credit.membership_id), now);
    return { ok: true };
  });
}

export async function completeTask(viewer: Viewer, assignmentId: string, proofNote: string) {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const result = await writeTransaction(async (tx) => {
    const assignmentResult = await tx.execute({
      sql: `SELECT ta.*, u.display_name
        FROM task_assignments ta
        JOIN memberships m ON m.id = ta.membership_id
        JOIN users u ON u.id = m.user_id
        JOIN seasons s ON s.id = ta.season_id
        WHERE ta.id = ? AND s.room_id = ?`,
      args: [assignmentId, viewer.roomId],
    });
    const assignment = assignmentResult.rows[0];
    if (!assignment) throw new HttpError(404, "Задание не найдено.");
    if (String(assignment.status) !== "pending") throw new HttpError(409, "Задание уже подтверждено.");
    await tx.execute({
      sql: `UPDATE task_assignments SET status = 'completed', completed_at = ?, approved_by_membership_id = ?, proof_note = ? WHERE id = ? AND status = 'pending'`,
      args: [now, viewer.membershipId, proofNote || null, assignmentId],
    });
    await tx.execute({
      sql: `UPDATE roll_credits
        SET expires_at = datetime(?, '+' || CAST(COALESCE(paused_remaining_ms, ?) / 1000 AS INTEGER) || ' seconds'),
            paused_at = NULL, paused_remaining_ms = NULL
        WHERE season_id = ? AND membership_id = ? AND status = 'available' AND paused_at IS NOT NULL`,
      args: [now, ROLL_TTL_MS, String(assignment.season_id), String(assignment.membership_id)],
    });
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, 'task_completed', ?, ?, ?)`,
      args: [
        randomUUID(),
        viewer.roomId,
        String(assignment.season_id),
        String(assignment.membership_id),
        viewer.membershipId,
        "Задание выполнено",
        `${String(assignment.display_name)}: задание «${String(assignment.title_snapshot)}» выполнено, путь снова открыт.`,
        now,
      ],
    });
    const achievementResult = await syncPlayerAchievements(
      tx,
      String(assignment.season_id),
      String(assignment.membership_id),
      now,
    );
    return {
      name: String(assignment.display_name),
      title: String(assignment.title_snapshot),
      newlyUnlocked: achievementResult.newlyUnlocked,
    };
  });
  await sendGameNotification(viewer.roomId, `✅💛 **${result.name} проходит испытание!**\n\n📜 Задание «${result.title}» подтверждено руководителем.\n🌿 Путь снова открыт, а таймеры бросков продолжают движение.`, `task:${assignmentId}:complete`);
  await Promise.all(result.newlyUnlocked.map((achievement) =>
    sendGameNotification(
      viewer.roomId,
      `🏅✨ **Новый титул у ${result.name}!**\n\n${achievement.symbol} **«${achievement.title}»**\n${achievement.description}\n\n💛 Витрина достижений становится ярче!`,
      `task:${assignmentId}:achievement:${achievement.key}`,
    ),
  ));
  return result;
}

export type ChronicleReaction = "applause" | "roar" | "fire" | "crown";

export async function toggleChronicleReaction(viewer: Viewer, eventId: string, reaction: ChronicleReaction) {
  const now = new Date().toISOString();
  return writeTransaction(async (tx) => {
    const eventResult = await tx.execute({
      sql: "SELECT id FROM game_events WHERE id = ? AND room_id = ? LIMIT 1",
      args: [eventId, viewer.roomId],
    });
    if (!eventResult.rows.length) throw new HttpError(404, "Событие летописи не найдено.");
    const existingResult = await tx.execute({
      sql: "SELECT reaction FROM event_reactions WHERE event_id = ? AND membership_id = ? LIMIT 1",
      args: [eventId, viewer.membershipId],
    });
    const existing = existingResult.rows[0];
    if (existing && String(existing.reaction) === reaction) {
      await tx.execute({
        sql: "DELETE FROM event_reactions WHERE event_id = ? AND membership_id = ?",
        args: [eventId, viewer.membershipId],
      });
      return { active: false };
    }
    await tx.execute({
      sql: `INSERT INTO event_reactions (event_id, membership_id, reaction, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(event_id, membership_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at`,
      args: [eventId, viewer.membershipId, reaction, now],
    });
    return { active: true };
  });
}

export const BOARD_CELL_COUNT = boardCells.length;
