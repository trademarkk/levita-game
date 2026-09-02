import "server-only";

import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { achievementByKey, achievementCatalog } from "@/lib/achievement-catalog";
import {
  distinctMoscowSaleDays,
  hasJustInTimeRoll,
  longestConsecutiveMoscowSaleDays,
  maxEventsInSevenDays,
  maxForwardDistanceInThreeRolls,
  usedRollStreakWithoutExpiry,
  type CreditMetric,
  type RollMetric,
} from "@/lib/achievement-metrics";
import type { AchievementView } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function hasReturnAfterPause(saleTimes: number[]) {
  return saleTimes.some((time, index) => index > 0 && time - saleTimes[index - 1] >= 14 * DAY_MS);
}

export async function syncPlayerAchievements(
  tx: Transaction,
  seasonId: string,
  membershipId: string,
  now = new Date().toISOString(),
) {
  const [playerResult, salesResult, creditsResult, rollsResult, rewardsResult, tasksResult, unlockedResult] = await Promise.all([
    tx.execute({
      sql: `SELECT sp.position, sp.joined_at, s.starts_at, s.room_id, u.display_name
        FROM season_players sp
        JOIN seasons s ON s.id = sp.season_id
        JOIN memberships m ON m.id = sp.membership_id
        JOIN users u ON u.id = m.user_id
        WHERE sp.season_id = ? AND sp.membership_id = ? LIMIT 1`,
      args: [seasonId, membershipId],
    }),
    tx.execute({
      sql: `SELECT awarded_at FROM roll_credits
        WHERE season_id = ? AND membership_id = ? AND source_type = 'sale'
          AND status NOT IN ('cancelled','void')
          AND awarded_at >= (SELECT starts_at FROM seasons WHERE id = ?)
        ORDER BY awarded_at`,
      args: [seasonId, membershipId, seasonId],
    }),
    tx.execute({
      sql: `SELECT status, awarded_at, used_at, expired_at, expires_at FROM roll_credits
        WHERE season_id = ? AND membership_id = ?
          AND awarded_at >= (SELECT starts_at FROM seasons WHERE id = ?)
        ORDER BY awarded_at`,
      args: [seasonId, membershipId, seasonId],
    }),
    tx.execute({
      sql: `SELECT cell_type, start_position, final_position, created_at
        FROM rolls WHERE season_id = ? AND membership_id = ? ORDER BY created_at`,
      args: [seasonId, membershipId],
    }),
    tx.execute({
      sql: "SELECT COUNT(*) AS reward_count FROM reward_grants WHERE season_id = ? AND membership_id = ?",
      args: [seasonId, membershipId],
    }),
    tx.execute({
      sql: `SELECT status, achievement_tag_snapshot
        FROM task_assignments WHERE season_id = ? AND membership_id = ?`,
      args: [seasonId, membershipId],
    }),
    tx.execute({
      sql: "SELECT achievement_key, unlocked_at FROM player_achievements WHERE season_id = ? AND membership_id = ?",
      args: [seasonId, membershipId],
    }),
  ]);
  const player = playerResult.rows[0];
  if (!player) return { totalSales: 0, achievements: [] as AchievementView[], newlyUnlocked: [] as AchievementView[] };

  const saleTimes = salesResult.rows.map((row) => new Date(String(row.awarded_at)).getTime());
  const totalSales = saleTimes.length;
  const strongestWeek = maxEventsInSevenDays(saleTimes);
  const returned = hasReturnAfterPause(saleTimes);
  const seasonStartsAt = new Date(String(player.starts_at)).getTime();
  const fastStartSales = saleTimes.filter((time) => time >= seasonStartsAt && time < seasonStartsAt + 7 * DAY_MS).length;
  const consecutiveSaleDays = longestConsecutiveMoscowSaleDays(saleTimes);
  const saleDays = distinctMoscowSaleDays(saleTimes);
  const nowMs = new Date(now).getTime();
  const expiredTimes = creditsResult.rows
    .filter((row) => String(row.status) === "expired")
    .map((row) => new Date(String(row.expired_at || row.awarded_at)).getTime());
  const firstCreditAt = creditsResult.rows[0] ? new Date(String(creditsResult.rows[0].awarded_at)).getTime() : nowMs;
  const rhythmStartedAt = expiredTimes.length ? Math.max(...expiredTimes) : firstCreditAt;
  const usedSinceRhythmStart = creditsResult.rows.some((row) => row.used_at && new Date(String(row.used_at)).getTime() >= rhythmStartedAt);
  const movementDays = usedSinceRhythmStart ? Math.max(0, Math.floor((nowMs - rhythmStartedAt) / DAY_MS)) : 0;
  const credits: CreditMetric[] = creditsResult.rows.map((row) => ({
    status: String(row.status),
    awardedAt: new Date(String(row.awarded_at)).getTime(),
    usedAt: row.used_at == null ? null : new Date(String(row.used_at)).getTime(),
    expiredAt: row.expired_at == null ? null : new Date(String(row.expired_at)).getTime(),
    expiresAt: row.expires_at == null ? null : new Date(String(row.expires_at)).getTime(),
  }));
  const noLossStreak = usedRollStreakWithoutExpiry(credits);
  const justInTime = hasJustInTimeRoll(credits);
  const rolls: RollMetric[] = rollsResult.rows.map((row) => ({
    cellType: String(row.cell_type),
    startPosition: Number(row.start_position),
    finalPosition: Number(row.final_position),
    createdAt: new Date(String(row.created_at)).getTime(),
  }));
  const treasureCount = Number(rewardsResult.rows[0]?.reward_count || 0);
  const accelerationCount = rolls.filter((roll) => roll.cellType === "accelerate").length;
  const setbackCount = rolls.filter((roll) => roll.cellType === "setback").length;
  const surpriseCount = rolls.filter((roll) => roll.cellType === "surprise").length;
  const completedTasks = tasksResult.rows.filter((row) => String(row.status) === "completed");
  const completedTaskCount = completedTasks.length;
  const completedReview = completedTasks.some((row) => String(row.achievement_tag_snapshot || "") === "review");
  const completedClientPhoto = completedTasks.some((row) => String(row.achievement_tag_snapshot || "") === "client_photo");
  const finalSprintDistance = maxForwardDistanceInThreeRolls(rolls);
  const position = Number(player.position);
  const qualified = new Set<string>();
  if (totalSales >= 1) qualified.add("first-step");
  if (strongestWeek >= 3) qualified.add("strong-week");
  if (returned) qualified.add("return-to-savanna");
  if (movementDays >= 7) qualified.add("always-moving");
  if (fastStartSales >= 3) qualified.add("fast-start");
  if (consecutiveSaleDays >= 3) qualified.add("dawn-streak");
  if (saleDays >= 5) qualified.add("pride-rhythm");
  if (strongestWeek >= 5) qualified.add("royal-week");
  if (noLossStreak >= 10) qualified.add("no-losses");
  if (justInTime) qualified.add("just-in-time");
  if (treasureCount >= 1) qualified.add("treasure-seeker");
  if (treasureCount >= 3) qualified.add("savanna-collector");
  if (accelerationCount >= 2) qualified.add("wind-master");
  if (setbackCount >= 3) qualified.add("unshakable");
  if (surpriseCount >= 3) qualified.add("mystery-explorer");
  if (completedTaskCount >= 3) qualified.add("trial-conqueror");
  if (completedReview) qualified.add("client-voice");
  if (completedClientPhoto) qualified.add("pride-face");
  if (rolls.length >= 3 && finalSprintDistance >= 12) qualified.add("final-sprint");
  if (totalSales >= 5) qualified.add("pride-keeper");
  if (totalSales >= 10) qualified.add("savanna-scout");
  if (totalSales >= 15) qualified.add("golden-trail");
  if (totalSales >= 20) qualified.add("royal-strength");
  if (position >= 15) qualified.add("chapter-pride-trail");
  if (position >= 30) qualified.add("chapter-watering-place");
  if (position >= 45) qualified.add("chapter-heir-rock");

  const previouslyUnlocked = new Map(
    unlockedResult.rows.map((row) => [String(row.achievement_key), String(row.unlocked_at)]),
  );
  const correctionSensitiveKeys = [
    "first-step",
    "strong-week",
    "return-to-savanna",
    "fast-start",
    "dawn-streak",
    "pride-rhythm",
    "royal-week",
    "pride-keeper",
    "savanna-scout",
    "golden-trail",
    "royal-strength",
  ];
  for (const key of correctionSensitiveKeys) {
    if (qualified.has(key) || !previouslyUnlocked.has(key)) continue;
    await tx.execute({
      sql: "DELETE FROM player_achievements WHERE season_id = ? AND membership_id = ? AND achievement_key = ?",
      args: [seasonId, membershipId, key],
    });
    previouslyUnlocked.delete(key);
  }
  const newlyUnlocked: AchievementView[] = [];
  for (const key of qualified) {
    const definition = achievementByKey.get(key);
    if (!definition || previouslyUnlocked.has(key)) continue;
    await tx.execute({
      sql: `INSERT OR IGNORE INTO player_achievements
        (id, season_id, membership_id, achievement_key, unlocked_at)
        VALUES (?, ?, ?, ?, ?)`,
      args: [randomUUID(), seasonId, membershipId, key, now],
    });
    await tx.execute({
      sql: `INSERT INTO game_events
        (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, 'achievement', ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        String(player.room_id),
        seasonId,
        membershipId,
        membershipId,
        `${String(player.display_name)} открывает титул`,
        `«${definition.title}» — новое достижение появилось в личной витрине.`,
        JSON.stringify({ achievementKey: key }),
        now,
      ],
    });
    previouslyUnlocked.set(key, now);
    newlyUnlocked.push({ ...definition, progress: definition.target, unlocked: true, unlockedAt: now });
  }

  const progressByKey: Record<string, number> = {
    "first-step": totalSales,
    "strong-week": strongestWeek,
    "return-to-savanna": returned ? 1 : 0,
    "always-moving": movementDays,
    "fast-start": fastStartSales,
    "dawn-streak": consecutiveSaleDays,
    "pride-rhythm": saleDays,
    "royal-week": strongestWeek,
    "no-losses": noLossStreak,
    "just-in-time": justInTime ? 1 : 0,
    "treasure-seeker": treasureCount,
    "savanna-collector": treasureCount,
    "wind-master": accelerationCount,
    "unshakable": setbackCount,
    "mystery-explorer": surpriseCount,
    "trial-conqueror": completedTaskCount,
    "client-voice": completedReview ? 1 : 0,
    "pride-face": completedClientPhoto ? 1 : 0,
    "final-sprint": finalSprintDistance,
    "pride-keeper": totalSales,
    "savanna-scout": totalSales,
    "golden-trail": totalSales,
    "royal-strength": totalSales,
    "chapter-pride-trail": position,
    "chapter-watering-place": position,
    "chapter-heir-rock": position,
  };
  const achievements = achievementCatalog.map((definition) => ({
    ...definition,
    progress: Math.min(definition.target, progressByKey[definition.key] || 0),
    unlocked: previouslyUnlocked.has(definition.key),
    unlockedAt: previouslyUnlocked.get(definition.key) || null,
  }));
  return { totalSales, achievements, newlyUnlocked };
}

export async function getUnannouncedAchievements(tx: Transaction, seasonId: string, membershipId: string) {
  const result = await tx.execute({
    sql: `SELECT achievement_key, unlocked_at FROM player_achievements
      WHERE season_id = ? AND membership_id = ? AND announced_at IS NULL
      ORDER BY unlocked_at`,
    args: [seasonId, membershipId],
  });
  return result.rows.flatMap((row) => {
    const definition = achievementByKey.get(String(row.achievement_key));
    return definition
      ? [{ ...definition, progress: definition.target, unlocked: true, unlockedAt: String(row.unlocked_at) }]
      : [];
  });
}

export async function markAchievementsAnnounced(
  tx: Transaction,
  seasonId: string,
  membershipId: string,
  keys: string[],
  rollId: string,
  now: string,
) {
  for (const key of keys) {
    await tx.execute({
      sql: `UPDATE player_achievements SET announced_at = ?, announced_roll_id = ?
        WHERE season_id = ? AND membership_id = ? AND achievement_key = ? AND announced_at IS NULL`,
      args: [now, rollId, seasonId, membershipId, key],
    });
  }
}

export async function achievementsAnnouncedWithRoll(tx: Transaction, rollId: string) {
  const result = await tx.execute({
    sql: "SELECT achievement_key, unlocked_at FROM player_achievements WHERE announced_roll_id = ? ORDER BY unlocked_at",
    args: [rollId],
  });
  return result.rows.flatMap((row) => {
    const definition = achievementByKey.get(String(row.achievement_key));
    return definition
      ? [{ ...definition, progress: definition.target, unlocked: true, unlockedAt: String(row.unlocked_at) }]
      : [];
  });
}
