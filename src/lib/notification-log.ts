import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export type NotificationChannel = "max" | "telegram";
export type NotificationStatus = "sent" | "failed" | "skipped";

function scopedEventKey(roomId: string, eventKey: string, channel: NotificationChannel) {
  return `${roomId}:${channel}:${eventKey}`;
}

export async function claimNotification(roomId: string, eventKey: string, channel: NotificationChannel) {
  const scopedKey = scopedEventKey(roomId, eventKey, channel);
  const result = await query(
    `INSERT OR IGNORE INTO notification_log
      (id, room_id, event_key, type, status, response_text, created_at)
     VALUES (?, ?, ?, ?, 'skipped', '__pending__', ?)`,
    [randomUUID(), roomId, scopedKey, channel, new Date().toISOString()],
  );

  return result.rowsAffected > 0;
}

export async function finishNotification(
  roomId: string,
  eventKey: string,
  channel: NotificationChannel,
  status: NotificationStatus,
  responseText: string,
) {
  const scopedKey = scopedEventKey(roomId, eventKey, channel);
  await query(
    `UPDATE notification_log
     SET status = ?, response_text = ?, created_at = ?
     WHERE event_key = ?`,
    [status, responseText.slice(0, 1000), new Date().toISOString(), scopedKey],
  );
}
