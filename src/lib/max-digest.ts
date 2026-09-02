import "server-only";

import { query } from "@/lib/db";
import { sendGameNotification } from "@/lib/notifications";
import { getDailyDigestWindow } from "@/lib/max-digest-window";
import { digestPositionLines } from "@/lib/max-digest-copy";

function digestLegend(sales: number) {
  if (sales === 0) return "🌙 Вчера саванна отдыхала и набиралась сил. Новый рассвет уже зовёт прайд вперёд 💛";
  if (sales <= 2) return "🌤️ Каждый след имеет значение — вчера прайд спокойно и уверенно продолжил путь 💛";
  if (sales <= 5) return "☀️ Золотое солнце видело сильный день: тропа заметно ожила, а цель стала ближе!";
  return "🔥🦁 Саванна гремела от движения — вчера команда показала настоящую силу прайда! 💛";
}

export async function sendDailySavannaDigest(now = new Date()) {
  const { shouldSend, dayStart, dayEnd, reportDateKey } = getDailyDigestWindow(now);
  if (!shouldSend) return { processed: 0, reason: "outside_digest_window" as const };
  const seasons = await query(
    `SELECT s.id, s.name, s.room_id, r.name AS room_name
     FROM seasons s JOIN rooms r ON r.id = s.room_id
     WHERE s.status = 'active'`,
  );
  let processed = 0;
  for (const season of seasons.rows) {
    const seasonId = String(season.id);
    const [sales, rolls, tasks, achievements, expiring, leader, positions] = await Promise.all([
      query(
        `SELECT COUNT(*) AS count FROM roll_credits
         WHERE season_id = ? AND source_type = 'sale' AND status NOT IN ('cancelled','void')
           AND awarded_at >= ? AND awarded_at < ?`,
        [seasonId, dayStart.toISOString(), dayEnd.toISOString()],
      ),
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(ABS(final_position - start_position)),0) AS distance
         FROM rolls WHERE season_id = ? AND created_at >= ? AND created_at < ?`,
        [seasonId, dayStart.toISOString(), dayEnd.toISOString()],
      ),
      query(
        `SELECT COUNT(*) AS count FROM task_assignments
         WHERE season_id = ? AND completed_at >= ? AND completed_at < ?`,
        [seasonId, dayStart.toISOString(), dayEnd.toISOString()],
      ),
      query(
        `SELECT COUNT(*) AS count FROM player_achievements
         WHERE season_id = ? AND unlocked_at >= ? AND unlocked_at < ?`,
        [seasonId, dayStart.toISOString(), dayEnd.toISOString()],
      ),
      query(
        `SELECT COUNT(*) AS count FROM roll_credits
         WHERE season_id = ? AND status = 'available' AND paused_at IS NULL
           AND expires_at > ? AND expires_at <= ?`,
        [seasonId, now.toISOString(), new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()],
      ),
      query(
        `SELECT u.display_name, COUNT(*) AS moves
         FROM rolls r
         JOIN memberships m ON m.id = r.membership_id
         JOIN users u ON u.id = m.user_id
         WHERE r.season_id = ? AND r.created_at >= ? AND r.created_at < ?
         GROUP BY r.membership_id, u.display_name
        ORDER BY moves DESC, u.display_name LIMIT 1`,
        [seasonId, dayStart.toISOString(), dayEnd.toISOString()],
      ),
      query(
        `SELECT u.display_name, sp.position
         FROM season_players sp
         JOIN memberships m ON m.id = sp.membership_id
         JOIN users u ON u.id = m.user_id
         WHERE sp.season_id = ? AND m.is_active = 1
         ORDER BY sp.position DESC, u.display_name`,
        [seasonId],
      ),
    ]);
    const saleCount = Number(sales.rows[0]?.count || 0);
    const rollCount = Number(rolls.rows[0]?.count || 0);
    const lines = [
      `🌅💛 **Золотая Саванна: Путь к Вершине · ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(dayStart)}**`,
      "",
      digestLegend(saleCount),
      "",
      `🧾 Зачтённых продаж: **${saleCount}**`,
      `🎲 Совершено ходов: **${rollCount}**`,
      `🐾 Пройдено клеток: **${Number(rolls.rows[0]?.distance || 0)}**`,
      `🏅 Открыто новых титулов: **${Number(achievements.rows[0]?.count || 0)}**`,
      `✅ Выполнено заданий: **${Number(tasks.rows[0]?.count || 0)}**`,
    ];
    if (leader.rows[0] && rollCount > 0) lines.push(`🦁 Самый активный след дня: **${String(leader.rows[0].display_name)}**`);
    lines.push(...digestPositionLines(positions.rows.map((player) => ({
      displayName: String(player.display_name),
      position: Number(player.position),
    }))));
    const expiringCount = Number(expiring.rows[0]?.count || 0);
    if (expiringCount > 0) lines.push("", `⏳ В ближайшие сутки истекает бросков: **${expiringCount}**. Не оставляйте шанс лежать на тропе.`);
    lines.push("", "✨ До встречи на игровой карте. Пусть следующий день принесёт прайду ещё больше ярких побед 💛");
    await sendGameNotification(String(season.room_id), lines.join("\n"), `digest:${seasonId}:${reportDateKey}`);
    processed += 1;
  }
  return { processed, reason: "sent" as const };
}
