import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { sendGameNotification } from "@/lib/notifications";
import { updateRoomNotificationSettings } from "@/lib/rooms";
import { requireRole } from "@/lib/session";

const nullableValue = z.string().trim().max(500).optional().nullable();
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    maxBotToken: nullableValue,
    maxChatId: nullableValue,
    telegramBotToken: nullableValue,
    telegramChatId: nullableValue,
  }),
  z.object({ action: z.literal("test") }),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireRole(["owner", "manager"]);
    const input = schema.parse(await request.json());
    if (input.action === "save") {
      return Response.json(await updateRoomNotificationSettings(viewer, {
        maxBotToken: input.maxBotToken ?? null,
        maxChatId: input.maxChatId ?? null,
        telegramBotToken: input.telegramBotToken ?? null,
        telegramChatId: input.telegramChatId ?? null,
      }));
    }
    const delivery = await sendGameNotification(
      viewer.roomId,
      `🧪💛 **Связь с прайдом настроена!**\n\nКомната успешно отправляет игровые уведомления. Следующие сообщения будут приходить из реальных событий на карте 🎲✨`,
      `room-settings:test:${randomUUID()}`,
    );
    return Response.json({ ok: true, delivery });
  } catch (error) {
    return apiError(error);
  }
}
