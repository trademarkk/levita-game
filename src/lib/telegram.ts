import "server-only";

import { claimNotification, finishNotification } from "@/lib/notification-log";
import { splitTelegramMessage, toTelegramHtml } from "@/lib/telegram-message";

export async function sendTelegramMessage(
  roomId: string,
  text: string,
  eventKey: string,
  credentials: { token: string | null; chatId: string | null },
) {
  if (!(await claimNotification(roomId, eventKey, "telegram"))) return { status: "duplicate" as const };

  const token = credentials.token?.trim();
  const chatId = credentials.chatId?.trim();
  if (!token || !chatId) {
    await finishNotification(roomId, eventKey, "telegram", "skipped", "Telegram token или chat ID не настроены для комнаты");
    return { status: "skipped" as const };
  }

  try {
    const messageIds: number[] = [];
    for (const chunk of splitTelegramMessage(text)) {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: toTelegramHtml(chunk),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(12_000),
      });

      const payload = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!response.ok || !payload.ok) throw new Error(`Telegram API ${response.status}: ${payload.description || "unknown error"}`);
      if (typeof payload.result?.message_id === "number") messageIds.push(payload.result.message_id);
    }

    await finishNotification(roomId, eventKey, "telegram", "sent", JSON.stringify({ chatId, messageIds }));
    return { status: "sent" as const, messageIds };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : String(error);
    await finishNotification(roomId, eventKey, "telegram", "failed", message);
    console.error("Telegram notification failed", message);
    return { status: "failed" as const };
  }
}
