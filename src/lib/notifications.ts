import "server-only";

import { sendMaxMessage } from "@/lib/max";
import { sendTelegramMessage } from "@/lib/telegram";
import { query } from "@/lib/db";

export async function sendGameNotification(roomId: string, text: string, eventKey: string) {
  const result = await query(
    `SELECT max_bot_token, max_chat_id, telegram_bot_token, telegram_chat_id
     FROM rooms WHERE id = ? LIMIT 1`,
    [roomId],
  );
  const room = result.rows[0];
  const maxCredentials = {
    token: room?.max_bot_token == null ? null : String(room.max_bot_token),
    chatId: room?.max_chat_id == null ? null : String(room.max_chat_id),
  };
  const telegramCredentials = {
    token: room?.telegram_bot_token == null ? null : String(room.telegram_bot_token),
    chatId: room?.telegram_chat_id == null ? null : String(room.telegram_chat_id),
  };
  const [maxResult, telegramResult] = await Promise.allSettled([
    sendMaxMessage(roomId, text, eventKey, maxCredentials),
    sendTelegramMessage(roomId, text, eventKey, telegramCredentials),
  ]);

  const max = maxResult.status === "fulfilled" ? maxResult.value : { status: "failed" as const };
  const telegram = telegramResult.status === "fulfilled" ? telegramResult.value : { status: "failed" as const };

  if (maxResult.status === "rejected") console.error("MAX notification dispatch failed", maxResult.reason);
  if (telegramResult.status === "rejected") console.error("Telegram notification dispatch failed", telegramResult.reason);

  return { max, telegram };
}
