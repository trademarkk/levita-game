import { randomUUID } from "node:crypto";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Achievement scenario failed: ${message}`);
}

async function main() {
  process.env.TURSO_DATABASE_URL = `file:./data/achievement-scenario-${randomUUID()}.db`;
  process.env.OWNER_PIN = "2468";

  const { ensureDatabase, query, writeTransaction } = await import("../src/lib/db");
  const { syncPlayerAchievements } = await import("../src/lib/achievements");
  await ensureDatabase();

  const ownerResult = await query(
    `SELECT m.id AS membership_id, m.room_id, s.id AS season_id
     FROM memberships m JOIN seasons s ON s.room_id = m.room_id
     WHERE m.role = 'owner' AND s.status = 'active' LIMIT 1`,
  );
  const owner = ownerResult.rows[0];
  assert(owner, "bootstrap owner and season exist");
  const membershipId = String(owner.membership_id);
  const seasonId = String(owner.season_id);
  const start = new Date("2026-09-01T06:00:00.000Z");
  await query("UPDATE seasons SET starts_at = ?, ends_at = ? WHERE id = ?", [
    start.toISOString(),
    new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    seasonId,
  ]);

  const creditIds: string[] = [];
  for (let index = 0; index < 13; index += 1) {
    const id = randomUUID();
    const usedAt = new Date(start.getTime() + index * 6 * 60 * 60 * 1000);
    const saleDay = Math.min(index, 4);
    const awardedAt = index < 5
      ? new Date(start.getTime() + saleDay * 24 * 60 * 60 * 1000)
      : new Date(usedAt.getTime() - 60 * 60 * 1000);
    const expiresAt = index === 12
      ? new Date(usedAt.getTime() + 2 * 60 * 60 * 1000)
      : new Date(usedAt.getTime() + 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO roll_credits
        (id, season_id, membership_id, source_type, reason, status, awarded_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, 'used', ?, ?, ?)`,
      [
        id,
        seasonId,
        membershipId,
        index < 5 ? "sale" : "board",
        `achievement fixture ${index}`,
        awardedAt.toISOString(),
        expiresAt.toISOString(),
        usedAt.toISOString(),
      ],
    );
    creditIds.push(id);
  }

  const rollFixtures = [
    ["accelerate", 0, 2],
    ["accelerate", 2, 4],
    ["setback", 4, 5],
    ["setback", 5, 6],
    ["setback", 6, 7],
    ["surprise", 7, 9],
    ["surprise", 9, 11],
    ["surprise", 11, 13],
    ["normal", 13, 17],
    ["normal", 17, 21],
    ["normal", 21, 25],
  ] as const;
  for (let index = 0; index < rollFixtures.length; index += 1) {
    const [cellType, from, to] = rollFixtures[index];
    await query(
      `INSERT INTO rolls
        (id, request_id, credit_id, season_id, membership_id, dice_value, start_position,
          base_position, cell_number, cell_type, effect_value, effect_text, final_position, created_at)
       VALUES (?, ?, ?, ?, ?, 4, ?, ?, ?, ?, ?, '', ?, ?)`,
      [
        randomUUID(),
        randomUUID(),
        creditIds[index],
        seasonId,
        membershipId,
        from,
        to,
        to,
        cellType,
        to - from,
        to,
        new Date(start.getTime() + (index + 1) * 60 * 60 * 1000).toISOString(),
      ],
    );
  }
  await query("UPDATE season_players SET position = 25 WHERE season_id = ? AND membership_id = ?", [seasonId, membershipId]);

  const catalog = await query("SELECT id, name, value, brand_choices_json FROM reward_catalog ORDER BY value LIMIT 1");
  const reward = catalog.rows[0];
  assert(reward, "reward catalog is seeded");
  for (let index = 0; index < 3; index += 1) {
    await query(
      `INSERT INTO reward_grants
        (id, season_id, membership_id, catalog_id, cell_number, name_snapshot, value,
          brand_choices_json, status, granted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        randomUUID(), seasonId, membershipId, String(reward.id), 4 + index,
        String(reward.name), Number(reward.value), String(reward.brand_choices_json),
        new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
      ],
    );
  }

  const taskTags = ["review", "client_photo", null] as const;
  for (let index = 0; index < taskTags.length; index += 1) {
    await query(
      `INSERT INTO task_assignments
        (id, season_id, membership_id, cell_number, title_snapshot, description_snapshot,
          achievement_tag_snapshot, status, assigned_at, completed_at)
       VALUES (?, ?, ?, ?, ?, 'Проверяемое условие', ?, 'completed', ?, ?)`,
      [
        randomUUID(), seasonId, membershipId, 11 + index,
        `Испытание ${index + 1}`, taskTags[index],
        new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
        new Date(start.getTime() + (index + 1) * 60 * 60 * 1000).toISOString(),
      ],
    );
  }

  const result = await writeTransaction((tx) =>
    syncPlayerAchievements(tx, seasonId, membershipId, new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString()),
  );
  const expected = [
    "fast-start", "dawn-streak", "pride-rhythm", "royal-week", "no-losses",
    "just-in-time", "treasure-seeker", "savanna-collector", "wind-master",
    "unshakable", "mystery-explorer", "trial-conqueror", "client-voice",
    "pride-face", "final-sprint",
  ];
  const unlocked = new Set(result.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.key));
  for (const key of expected) assert(unlocked.has(key), `${key} unlocks from its exact season evidence`);

  await query("UPDATE roll_credits SET status = 'cancelled' WHERE season_id = ? AND source_type = 'sale'", [seasonId]);
  const corrected = await writeTransaction((tx) =>
    syncPlayerAchievements(tx, seasonId, membershipId, new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  );
  const correctedUnlocked = new Set(corrected.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.key));
  for (const key of ["fast-start", "dawn-streak", "pride-rhythm", "royal-week"]) {
    assert(!correctedUnlocked.has(key), `${key} is revoked after all source sales are cancelled`);
  }

  console.log("Achievement scenario passed: all 15 new conditions unlock from season-scoped evidence and sale corrections are reversible.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
