import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Scenario assertion failed: ${message}`);
}

async function main() {
  process.env.TURSO_DATABASE_URL = `file:./data/scenario-${randomUUID()}.db`;
  process.env.OWNER_PIN = "2468";

  const { ensureDatabase, query } = await import("../src/lib/db");
  const { awardRolls, completeTask, getGameState, performRoll, toggleChronicleReaction } = await import("../src/lib/game");
  const { createNextSeason, getManagerState, resetBoardCell, updateBoardCell, updateFinalPrize } = await import("../src/lib/manager");
  await ensureDatabase();

  const ownerResult = await query(
    `SELECT u.id AS user_id, u.display_name, u.avatar_key, m.id AS membership_id, m.room_id, m.role
     FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role = 'owner' LIMIT 1`,
  );
  const owner = ownerResult.rows[0];
  assert(owner, "bootstrap owner exists");
  const viewer = {
    userId: String(owner.user_id),
    membershipId: String(owner.membership_id),
    roomId: String(owner.room_id),
    displayName: String(owner.display_name),
    avatarKey: String(owner.avatar_key),
    branch: null,
    role: "owner" as const,
  };
  const seasonResult = await query("SELECT id FROM seasons WHERE room_id = ? AND status = 'active'", [viewer.roomId]);
  const seasonId = String(seasonResult.rows[0]?.id);
  assert(seasonId, "active season exists");

  const secondUserId = randomUUID();
  const secondMembershipId = randomUUID();
  await query(
    "INSERT INTO users (id, display_name, avatar_key, pin_hash, pin_salt, created_at) VALUES (?, ?, 'zebra-gold', 'unused', 'unused', ?)",
    [secondUserId, "Второй игрок", new Date().toISOString()],
  );
  await query(
    "INSERT INTO memberships (id, room_id, user_id, role, joined_at) VALUES (?, ?, ?, 'player', ?)",
    [secondMembershipId, viewer.roomId, secondUserId, new Date().toISOString()],
  );
  await query(
    "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
    [randomUUID(), seasonId, secondMembershipId, new Date().toISOString()],
  );
  const secondViewer = {
    userId: secondUserId,
    membershipId: secondMembershipId,
    roomId: viewer.roomId,
    displayName: "Второй игрок",
    avatarKey: "zebra-gold",
    branch: null,
    role: "player" as const,
  };

  const addCredit = async (reason: string, membershipId = viewer.membershipId) => {
    const now = new Date();
    const id = randomUUID();
    await query(
      `INSERT INTO roll_credits
        (id, season_id, membership_id, awarded_by_membership_id, source_type, reason, status, awarded_at, expires_at)
        VALUES (?, ?, ?, ?, 'scenario', ?, 'available', ?, ?)`,
      [id, seasonId, membershipId, viewer.membershipId, reason, now.toISOString(), new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()],
    );
    return id;
  };

  // Manager-defined cells replace the default role and drive the real landing effect.
  await updateBoardCell(viewer, {
    cellNumber: 2,
    type: "trap",
    title: "Проверка сервиса",
    description: "Предложить одно конкретное улучшение клиентского сервиса.",
  });
  await query("UPDATE season_players SET position = 1 WHERE season_id = ? AND membership_id = ?", [seasonId, viewer.membershipId]);
  await addCredit("custom task cell");
  const customTrap = await performRoll(viewer, 1, randomUUID());
  assert(customTrap.cellType === "trap" && customTrap.effectText.includes("Проверка сервиса"), "custom task cell is applied to a roll");
  assert(
    customTrap.effectText.includes("Предложить одно конкретное улучшение клиентского сервиса."),
    "task cinematic receives the full manager-defined task description",
  );
  const customTaskResult = await query(
    "SELECT id, title_snapshot, description_snapshot FROM task_assignments WHERE season_id = ? AND membership_id = ? AND status = 'pending'",
    [seasonId, viewer.membershipId],
  );
  assert(String(customTaskResult.rows[0]?.title_snapshot) === "Проверка сервиса", "custom task title is assigned");
  await completeTask(viewer, String(customTaskResult.rows[0]?.id), "custom task verified");

  await updateBoardCell(viewer, {
    cellNumber: 2,
    type: "treasure",
    rewardName: "Тестовый сертификат",
    rewardValue: 200,
    rewardQuantity: 1,
    rewardBrandChoices: ["Ozon", "Wildberries"],
  });
  await query("UPDATE seasons SET gift_budget = 1 WHERE id = ?", [seasonId]);
  await query("UPDATE season_players SET position = 1 WHERE season_id = ? AND membership_id IN (?, ?)", [seasonId, viewer.membershipId, secondViewer.membershipId]);
  await addCredit("custom reward cell");
  await addCredit("same custom reward for another player", secondViewer.membershipId);
  const customReward = await performRoll(viewer, 1, randomUUID());
  assert(customReward.rewardValue === 200 && customReward.effectText.includes("200 ₽"), "material reward amount is returned for the cinematic");
  const secondCustomReward = await performRoll(secondViewer, 1, randomUUID());
  assert(customReward.cellType === "treasure", "custom reward cell is applied to a roll");
  assert(secondCustomReward.rewardTitle === "Тестовый сертификат", "the same cell rewards a second player despite shared quantity and budget");
  const customGrantResult = await query(
    "SELECT name_snapshot, value, brand_choices_json FROM reward_grants WHERE season_id = ? AND catalog_id = ?",
    [seasonId, `custom-cell:${viewer.roomId}:2`],
  );
  assert(customGrantResult.rows.length === 2, "a fixed cell reward is granted independently to every player who lands there");
  assert(customGrantResult.rows.every((row) => String(row.name_snapshot) === "Тестовый сертификат"), "custom reward name is granted");
  assert(customGrantResult.rows.every((row) => Number(row.value) === 200), "custom reward value is granted");
  await query(
    "UPDATE seasons SET gift_budget = 10000 WHERE id = ?",
    [seasonId],
  );
  await resetBoardCell(viewer, 2);
  const resetState = await getManagerState(viewer);
  assert(resetState.boardCells[1]?.type === "normal" && !resetState.boardCells[1]?.custom, "reset restores the default cell");

  // Trap: landing on 11 blocks movement and pauses newly credited rolls.
  await query("UPDATE season_players SET position = 10 WHERE season_id = ? AND membership_id = ?", [seasonId, viewer.membershipId]);
  await addCredit("trap landing");
  const trap = await performRoll(viewer, 1, randomUUID());
  assert(trap.basePosition === 11 && trap.cellType === "trap", "cell 11 assigns a trap");
  const taskResult = await query(
    "SELECT id FROM task_assignments WHERE season_id = ? AND membership_id = ? AND status = 'pending'",
    [seasonId, viewer.membershipId],
  );
  assert(taskResult.rows.length === 1, "one blocking task is assigned");
  const [pausedCredit] = await awardRolls(viewer, [viewer.membershipId], "sale while blocked");
  const pausedResult = await query("SELECT paused_at, paused_remaining_ms, expires_at FROM roll_credits WHERE id = ?", [pausedCredit.id]);
  assert(pausedResult.rows[0]?.paused_at && pausedResult.rows[0]?.expires_at == null, "new roll is paused while trapped");
  await completeTask(viewer, String(taskResult.rows[0].id), "scenario verified");
  const resumedResult = await query("SELECT paused_at, expires_at FROM roll_credits WHERE id = ?", [pausedCredit.id]);
  assert(resumedResult.rows[0]?.paused_at == null && resumedResult.rows[0]?.expires_at, "paused roll resumes after approval");

  // Treasure: cell 4 grants one item from stock without exceeding its quantity.
  await query("UPDATE season_players SET position = 3 WHERE season_id = ? AND membership_id = ?", [seasonId, viewer.membershipId]);
  const treasure = await performRoll(viewer, 1, randomUUID());
  assert(treasure.basePosition === 4 && treasure.cellType === "treasure", "cell 4 opens treasure");
  const grantResult = await query("SELECT COUNT(*) AS count FROM reward_grants WHERE season_id = ?", [seasonId]);
  assert(Number(grantResult.rows[0]?.count) === 3, "treasure creates one additional reward grant");

  await updateFinalPrize(viewer, "Путешествие на выходные");
  const customPrizeState = await getGameState(viewer);
  assert(customPrizeState.season.finalPrize === "Путешествие на выходные", "active season accepts a free-form non-monetary final prize");

  // Finish: reaching 60 ends the season and voids every remaining credit.
  await query("UPDATE season_players SET position = 59 WHERE season_id = ? AND membership_id = ?", [seasonId, viewer.membershipId]);
  await addCredit("winning roll");
  await addCredit("must be void after finish");
  const finish = await performRoll(viewer, 1, randomUUID());
  assert(finish.finalPosition === 60 && finish.seasonCompleted, "cell 60 completes season");
  assert(finish.unlockedAchievements.filter((achievement) => achievement.kind === "chapter").length === 3, "chapter titles unlock and are attached to the finishing roll");
  const finalSeason = await query("SELECT status, winner_membership_id, final_prize_status FROM seasons WHERE id = ?", [seasonId]);
  assert(finalSeason.rows[0]?.status === "completed", "season status is completed");
  assert(String(finalSeason.rows[0]?.winner_membership_id) === viewer.membershipId, "winner is recorded");
  assert(finalSeason.rows[0]?.final_prize_status === "pending", "final prize waits for manager issuance");
  const available = await query("SELECT COUNT(*) AS count FROM roll_credits WHERE season_id = ? AND status = 'available'", [seasonId]);
  assert(Number(available.rows[0]?.count) === 0, "no roll survives season completion");

  // A new season exposes a completely clean race while preserving old rows only as historical data.
  await createNextSeason(viewer, "Scenario season 2", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "Сертификат на путешествие");
  const gameState = await getGameState(viewer);
  assert(gameState.players[0]?.position === 0, "new season starts at position zero");
  assert(gameState.myJourney.totalSales === 0, "sales from the completed season never leak into the new season");
  assert(gameState.myJourney.achievements.every((achievement) => !achievement.unlocked), "new season starts without inherited achievements");
  assert(gameState.myRewards.length === 0, "rewards from the completed season are cleared from the new season");
  assert(gameState.season.finalPrize === "Сертификат на путешествие", "new season accepts a non-monetary manager-defined final prize");
  await awardRolls(viewer, [viewer.membershipId], "first sale of the new season");
  const firstNewSeasonRoll = await performRoll(viewer, 1, randomUUID());
  assert(firstNewSeasonRoll.unlockedAchievements.map((achievement) => achievement.key).join(",") === "first-step", "first new-season roll cannot inherit strong-week or sales milestones");
  const afterFirstNewSale = await getGameState(viewer);
  assert(afterFirstNewSale.myJourney.totalSales === 1, "new season counts only its own sales");
  const eventId = gameState.events[0]?.id;
  assert(eventId, "chronicle has an event to react to");
  await toggleChronicleReaction(viewer, eventId, "roar");
  const reactedState = await getGameState(viewer);
  assert(reactedState.events.find((event) => event.id === eventId)?.reactions.some((reaction) => reaction.key === "roar" && reaction.mine && reaction.count === 1), "chronicle reaction is visible to the player");
  await toggleChronicleReaction(viewer, eventId, "roar");
  const unreactedState = await getGameState(viewer);
  assert(!unreactedState.events.find((event) => event.id === eventId)?.reactions.some((reaction) => reaction.mine), "repeating a reaction removes it");
  const managerState = await getManagerState(viewer);
  assert(managerState.finalPrizes.length === 0, "manager starts the new season without old final prizes");
  assert(managerState.rewards.length === 0, "manager starts the new season without old board rewards");

  console.log("Scenario passed: custom cells, timers, achievements, reactions, reward stock, finish, clean rollover, and configurable final prize.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
