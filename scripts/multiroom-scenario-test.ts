import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Multi-room assertion failed: ${message}`);
}

async function main() {
  process.env.TURSO_DATABASE_URL = `file:./data/multiroom-scenario-${randomUUID()}.db`;
  process.env.OWNER_PIN = "2468";
  delete process.env.MAX_BOT_TOKEN;
  delete process.env.MAX_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  const { ensureDatabase, query } = await import("../src/lib/db");
  const { verifyPin } = await import("../src/lib/crypto");
  const { awardRolls } = await import("../src/lib/game");
  const { getManagerState, updateBoardCell } = await import("../src/lib/manager");
  const { createRoom, createRoomPlayer, updateOwnRoomPin, updateRoomNotificationSettings } = await import("../src/lib/rooms");
  await ensureDatabase();

  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const first = await createRoom({
    roomName: "Первый тестовый прайд",
    ownerName: "Владелец А",
    ownerPin: "5555",
    seasonName: "Сезон А",
    endsAt,
    finalPrize: "10 000 ₽",
  });
  const second = await createRoom({
    roomName: "Второй тестовый прайд",
    ownerName: "Владелец Б",
    ownerPin: "5555",
    seasonName: "Сезон Б",
    endsAt,
    finalPrize: "Дополнительный выходной",
  });
  assert(first.roomId !== second.roomId && first.slug !== second.slug, "rooms receive separate ids and permanent links");
  for (const roomId of [first.roomId, second.roomId]) {
    const ownerCredential = await query(
      `SELECT u.pin_hash, u.pin_salt FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = ? AND m.role = 'owner' LIMIT 1`,
      [roomId],
    );
    assert(await verifyPin("5555", String(ownerCredential.rows[0].pin_hash), String(ownerCredential.rows[0].pin_salt)), "the same PIN may resolve independently inside different room links");
  }

  const viewerA = {
    userId: first.userId,
    membershipId: first.membershipId,
    roomId: first.roomId,
    displayName: "Владелец А",
    avatarKey: "lioness-crown",
    branch: null,
    role: "owner" as const,
  };
  const viewerB = {
    userId: second.userId,
    membershipId: second.membershipId,
    roomId: second.roomId,
    displayName: "Владелец Б",
    avatarKey: "lioness-crown",
    branch: null,
    role: "owner" as const,
  };

  const templateCounts = await query(
    `SELECT r.id AS room_id,
      (SELECT COUNT(*) FROM board_cell_configs bc WHERE bc.room_id = r.id) AS cells,
      (SELECT COUNT(*) FROM task_templates tt WHERE tt.room_id = r.id) AS tasks
     FROM rooms r WHERE r.id IN (?, ?) ORDER BY r.id`,
    [first.roomId, second.roomId],
  );
  assert(templateCounts.rows.every((row) => Number(row.cells) === 54), "every new room receives all 54 configured template cells");
  assert(templateCounts.rows.every((row) => Number(row.tasks) === 10), "every new room receives all 10 task templates");
  const reviewCells = await query(
    `SELECT room_id, cell_number, task_achievement_tag FROM board_cell_configs
     WHERE room_id IN (?, ?) AND cell_number IN (31,54)`,
    [first.roomId, second.roomId],
  );
  assert(reviewCells.rows.length === 4 && reviewCells.rows.every((row) => String(row.task_achievement_tag) === "review"), "cells 31 and 54 are tagged as client voice in every room");

  await updateBoardCell(viewerA, {
    cellNumber: 31,
    type: "surprise",
    description: "Уникальное событие только первой комнаты.",
  });
  const [stateA, stateB] = await Promise.all([getManagerState(viewerA), getManagerState(viewerB)]);
  assert(stateA.boardCells[30]?.type === "surprise", "room A sees its board edit");
  assert(stateB.boardCells[30]?.type === "trap" && stateB.boardCells[30]?.taskAchievementTag === "review", "room B keeps an independent template cell");

  const [playerA, playerB] = await Promise.all([
    createRoomPlayer(viewerA, { displayName: "Игрок А", branch: "Команда А", avatarKey: "lioness-sun" }),
    createRoomPlayer(viewerB, { displayName: "Игрок Б", branch: "Команда Б", avatarKey: "lioness-river" }),
  ]);
  assert(playerA.roomSlug === first.slug && playerB.roomSlug === second.slug, "created players receive their own room's shared link");
  assert(/^\d{4}$/.test(playerA.pin) && /^\d{4}$/.test(playerB.pin), "players receive generated four-digit PINs");
  assert(playerA.pin !== "5555" && playerB.pin !== "5555", "generated player PIN never conflicts with an active PIN in the same room");

  await updateOwnRoomPin(viewerA, "7777");
  const changedOwnerCredential = await query(
    `SELECT u.pin_hash, u.pin_salt FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.id = ? AND m.room_id = ? LIMIT 1`,
    [viewerA.membershipId, viewerA.roomId],
  );
  assert(await verifyPin("7777", String(changedOwnerCredential.rows[0].pin_hash), String(changedOwnerCredential.rows[0].pin_salt)), "manager can replace their PIN for entry from another device");
  assert(!(await verifyPin("5555", String(changedOwnerCredential.rows[0].pin_hash), String(changedOwnerCredential.rows[0].pin_salt))), "old manager PIN stops working after replacement");
  let duplicatePinRejected = false;
  try {
    await updateOwnRoomPin(viewerA, playerA.pin);
  } catch {
    duplicatePinRejected = true;
  }
  assert(duplicatePinRejected, "manager PIN cannot duplicate another active member PIN in the same room");

  let crossRoomRejected = false;
  try {
    await awardRolls(viewerA, [playerB.membershipId], "cross-room attempt");
  } catch {
    crossRoomRejected = true;
  }
  assert(crossRoomRejected, "a manager cannot award a roll to a player from another room");

  await updateRoomNotificationSettings(viewerA, {
    maxBotToken: "max-a",
    maxChatId: "chat-a",
    telegramBotToken: "tg-a",
    telegramChatId: "tg-chat-a",
  });
  await updateRoomNotificationSettings(viewerB, {
    maxBotToken: "max-b",
    maxChatId: "chat-b",
    telegramBotToken: null,
    telegramChatId: null,
  });
  const settings = await query(
    `SELECT id, max_bot_token, max_chat_id, telegram_bot_token, telegram_chat_id
     FROM rooms WHERE id IN (?, ?) ORDER BY id`,
    [first.roomId, second.roomId],
  );
  const storedA = settings.rows.find((row) => String(row.id) === first.roomId);
  const storedB = settings.rows.find((row) => String(row.id) === second.roomId);
  assert(String(storedA?.max_chat_id) === "chat-a" && String(storedA?.telegram_chat_id) === "tg-chat-a", "room A keeps only its channel settings");
  assert(String(storedB?.max_chat_id) === "chat-b" && storedB?.telegram_chat_id == null, "room B keeps a different channel configuration");

  const refreshedA = await getManagerState(viewerA);
  assert(refreshedA.members.length === 2 && !refreshedA.members.some((member) => String(member.display_name) === "Игрок Б"), "manager state never includes another room's members");
  assert(String(refreshedA.room.slug) === first.slug, "manager state exposes only its own room link");

  console.log("Multi-room scenario passed: template cloning, permanent links, role PIN entry, player PINs, board/data isolation, and per-room channels.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
