import "server-only";

import { Agent, fetch as undiciFetch } from "undici";
import { MAX_RUSSIAN_TRUSTED_CA } from "@/lib/max-ca";

import { splitMaxMessage } from "@/lib/max-message";
import { claimNotification, finishNotification } from "@/lib/notification-log";

const maxDispatcher = new Agent({
  connect: {
    ca: MAX_RUSSIAN_TRUSTED_CA,
  },
});

export async function sendMaxMessage(
  roomId: string,
  text: string,
  eventKey: string,
  credentials: { token: string | null; chatId: string | null },
) {
  if (!(await claimNotification(roomId, eventKey, "max"))) return { status: "duplicate" as const };

  const token = credentials.token?.trim();
  const chatId = credentials.chatId?.trim();
  if (!token || !chatId) {
    await finishNotification(roomId, eventKey, "max", "skipped", "MAX token или chat ID не настроены для комнаты");
    return { status: "skipped" as const };
  }

  const base = (process.env.MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, "");
  try {
    for (const chunk of splitMaxMessage(text)) {
      const url = new URL(`${base}/messages`);
      url.searchParams.set("chat_id", chatId);
      const response = await undiciFetch(url, {
        method: "POST",
        dispatcher: maxDispatcher,
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk, format: "markdown", notify: true }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`MAX API ${response.status}: ${await response.text()}`);
    }
    await finishNotification(roomId, eventKey, "max", "sent", "ok");
    return { status: "sent" as const };
  } catch (error) {
    const cause =
      error instanceof Error && error.cause
        ? ` | cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
        : "";
    const message = `${error instanceof Error ? error.message : String(error)}${cause}`.slice(0, 1000);
    await finishNotification(roomId, eventKey, "max", "failed", message);
    console.error("MAX notification failed", error);
    return { status: "failed" as const };
  }
}
