import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { sendGameNotification } = await import("../src/lib/notifications");
  const { query } = await import("../src/lib/db");
  const room = (await query("SELECT id FROM rooms ORDER BY created_at LIMIT 1")).rows[0];
  if (!room) throw new Error("Нет комнаты для проверки уведомлений.");
  const result = await sendGameNotification(
    String(room.id),
    "🧪💛 **Каналы игры «Золотая Саванна: Путь к Вершине» подключены!**\n\nУведомления игры теперь параллельно отправляются в MAX и Telegram.\n🎲 Следующие сообщения уже будут приходить из реальных действий в приложении.",
    `system:notification-smoke:${randomUUID()}`,
  );

  console.log(JSON.stringify({
    max: result.max.status,
    telegram: result.telegram.status,
    telegramMessageIds: "messageIds" in result.telegram ? result.telegram.messageIds : [],
  }));
  if (result.max.status !== "sent" || result.telegram.status !== "sent") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
