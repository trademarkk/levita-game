import { apiError } from "@/lib/http";
import { assertCron } from "@/lib/cron";
import { query } from "@/lib/db";
import { sendGameNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCron(request);
    const now = Date.now();
    const result = await query(
      `SELECT rc.id, rc.expires_at, u.display_name, m.room_id
       FROM roll_credits rc
       JOIN memberships m ON m.id = rc.membership_id
       JOIN users u ON u.id = m.user_id
       JOIN seasons s ON s.id = rc.season_id
       WHERE rc.status = 'available' AND rc.paused_at IS NULL
         AND rc.expires_at > ? AND rc.expires_at <= ?
         AND s.status = 'active'`,
      [new Date(now).toISOString(), new Date(now + 24 * 60 * 60 * 1000).toISOString()],
    );
    let processed = 0;
    for (const row of result.rows) {
      const remaining = new Date(String(row.expires_at)).getTime() - now;
      const isUrgent = remaining <= 3 * 60 * 60 * 1000;
      const bucket = isUrgent ? "3h" : "24h";
      const text = isUrgent
        ? `⏳🔥 **${String(row.display_name)}, кубик ждёт последнего шанса!**\n\nДо сгорания осталось меньше **3 часов**. Загляни на карту и оставь новый след прямо сейчас 💛`
        : `🌤️🎲 **${String(row.display_name)}, в саванне тебя ждёт бросок!**\n\nДо окончания срока осталось меньше суток. Возможно, впереди уже совсем близко сокровище ✨💛`;
      await sendGameNotification(String(row.room_id), text, `credit:${String(row.id)}:reminder:${bucket}`);
      processed += 1;
    }
    return Response.json({ ok: true, processed });
  } catch (error) {
    return apiError(error);
  }
}
