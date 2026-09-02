import "server-only";

import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { hashPin } from "@/lib/crypto";
import { applyDefaultRoomTemplate } from "@/lib/default-room-template";

const DAY_MS = 24 * 60 * 60 * 1000;

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL DEFAULT 'lioness-sun',
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  max_players INTEGER NOT NULL DEFAULT 12,
  max_bot_token TEXT,
  max_chat_id TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notification_settings_migrated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','player','observer')),
  branch TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL,
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','completed','expired')),
  winner_membership_id TEXT REFERENCES memberships(id),
  completed_at TEXT,
  final_prize_amount INTEGER NOT NULL DEFAULT 10000,
  final_prize TEXT NOT NULL DEFAULT '10 000 ₽',
  final_prize_status TEXT CHECK(final_prize_status IN ('pending','issued')),
  final_prize_issued_at TEXT,
  final_prize_issued_by_membership_id TEXT REFERENCES memberships(id),
  gift_budget INTEGER NOT NULL DEFAULT 10000,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_season_per_room
ON seasons(room_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS season_players (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  UNIQUE(season_id, membership_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS sessions_active
ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('manager','player','observer')),
  token_hash TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  assigned_membership_id TEXT REFERENCES memberships(id),
  created_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roll_credits (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  awarded_by_membership_id TEXT REFERENCES memberships(id),
  source_type TEXT NOT NULL DEFAULT 'sale',
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available','used','cancelled','void','expired')),
  awarded_at TEXT NOT NULL,
  expires_at TEXT,
  paused_at TEXT,
  paused_remaining_ms INTEGER,
  used_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  expired_at TEXT
);

CREATE INDEX IF NOT EXISTS roll_credit_lookup
ON roll_credits(season_id, membership_id, status, awarded_at);

CREATE TABLE IF NOT EXISTS rolls (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  credit_id TEXT NOT NULL UNIQUE REFERENCES roll_credits(id),
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  dice_value INTEGER NOT NULL CHECK(dice_value BETWEEN 1 AND 6),
  start_position INTEGER NOT NULL,
  base_position INTEGER NOT NULL,
  cell_number INTEGER NOT NULL,
  cell_type TEXT NOT NULL,
  effect_value INTEGER NOT NULL DEFAULT 0,
  effect_text TEXT NOT NULL DEFAULT '',
  final_position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  achievement_tag TEXT CHECK(achievement_tag IN ('review','client_photo') OR achievement_tag IS NULL),
  requires_proof INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  template_id TEXT REFERENCES task_templates(id),
  cell_number INTEGER NOT NULL,
  title_snapshot TEXT NOT NULL,
  description_snapshot TEXT NOT NULL,
  achievement_tag_snapshot TEXT CHECK(achievement_tag_snapshot IN ('review','client_photo') OR achievement_tag_snapshot IS NULL),
  status TEXT NOT NULL CHECK(status IN ('pending','completed')),
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  approved_by_membership_id TEXT REFERENCES memberships(id),
  proof_note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_pending_task_per_player
ON task_assignments(season_id, membership_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS reward_catalog (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  value INTEGER NOT NULL,
  brand_choices_json TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_grants (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  catalog_id TEXT NOT NULL REFERENCES reward_catalog(id),
  cell_number INTEGER NOT NULL,
  name_snapshot TEXT NOT NULL,
  value INTEGER NOT NULL,
  brand_choices_json TEXT NOT NULL DEFAULT '[]',
  brand_choice TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','issued')),
  granted_at TEXT NOT NULL,
  issued_at TEXT,
  issued_by_membership_id TEXT REFERENCES memberships(id)
);

CREATE TABLE IF NOT EXISTS board_cell_configs (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cell_number INTEGER NOT NULL CHECK(cell_number BETWEEN 1 AND 59),
  type TEXT NOT NULL CHECK(type IN ('normal','treasure','surprise','setback','trap','accelerate')),
  title TEXT,
  description TEXT,
  task_achievement_tag TEXT CHECK(task_achievement_tag IN ('review','client_photo') OR task_achievement_tag IS NULL),
  effect TEXT CHECK(effect IN ('move','extra_roll') OR effect IS NULL),
  move_value INTEGER,
  reward_catalog_id TEXT REFERENCES reward_catalog(id),
  updated_by_membership_id TEXT REFERENCES memberships(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(room_id, cell_number)
);

CREATE TABLE IF NOT EXISTS game_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT REFERENCES memberships(id),
  actor_membership_id TEXT REFERENCES memberships(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS game_events_feed
ON game_events(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_achievements (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  announced_at TEXT,
  announced_roll_id TEXT REFERENCES rolls(id),
  UNIQUE(season_id, membership_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS player_achievements_lookup
ON player_achievements(season_id, membership_id, unlocked_at);

CREATE TABLE IF NOT EXISTS event_reactions (
  event_id TEXT NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN ('applause','roar','fire','crown')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, membership_id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed','skipped')),
  response_text TEXT,
  created_at TEXT NOT NULL
);
`;

declare global {
  var goldenSavannaDb: Client | undefined;
  var goldenSavannaReady: Promise<void> | undefined;
  var goldenSavannaDatabaseQueue: Promise<void> | undefined;
}

async function withDatabaseLock<T>(work: () => Promise<T>) {
  const previous = globalThis.goldenSavannaDatabaseQueue || Promise.resolve();
  let release = () => {};
  globalThis.goldenSavannaDatabaseQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
  }
}

function createDatabaseClient() {
  const configuredUrl = process.env.TURSO_DATABASE_URL?.trim();
  const url = configuredUrl || "file:./data/golden-savanna.db";
  if (process.env.NODE_ENV === "production" && !configuredUrl) {
    throw new Error("TURSO_DATABASE_URL is required in production.");
  }
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
}

export function db() {
  if (!globalThis.goldenSavannaDb) globalThis.goldenSavannaDb = createDatabaseClient();
  return globalThis.goldenSavannaDb;
}

async function seedInitialRoom(client: Client) {
  const rooms = await client.execute("SELECT id FROM rooms LIMIT 1");
  if (rooms.rows.length > 0) return;

  const now = new Date();
  const end = new Date(now.getTime() + 45 * DAY_MS);
  const roomId = randomUUID();
  const ownerId = randomUUID();
  const membershipId = randomUUID();
  const seasonId = randomUUID();
  const ownerPin = process.env.OWNER_PIN || (process.env.NODE_ENV === "production" ? "" : "2468");
  // A blank production database is initialized through the public room-creation flow.
  // OWNER_PIN is only a backwards-compatible bootstrap for local and existing installs.
  if (!ownerPin) return;
  const ownerPinHash = await hashPin(ownerPin);

  const tx = await client.transaction("write");
  try {
    await tx.batch([
      {
        sql: "INSERT INTO users (id, display_name, avatar_key, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [ownerId, process.env.OWNER_NAME || "Владелец", "lioness-crown", ownerPinHash.hash, ownerPinHash.salt, now.toISOString()],
      },
      {
        sql: "INSERT INTO rooms (id, name, slug, max_players, created_at) VALUES (?, ?, ?, 12, ?)",
        args: [roomId, "Золотая Саванна: Путь к Вершине", "golden-savanna", now.toISOString()],
      },
      {
        sql: "INSERT INTO memberships (id, room_id, user_id, role, branch, joined_at) VALUES (?, ?, ?, 'owner', NULL, ?)",
        args: [membershipId, roomId, ownerId, now.toISOString()],
      },
      {
        sql: "INSERT INTO seasons (id, room_id, name, starts_at, ends_at, status, final_prize_amount, final_prize, gift_budget, created_at) VALUES (?, ?, ?, ?, ?, 'active', 10000, '10 000 ₽', 10000, ?)",
        args: [seasonId, roomId, "Первый сезон", now.toISOString(), end.toISOString(), now.toISOString()],
      },
      {
        sql: "INSERT INTO season_players (id, season_id, membership_id, position, joined_at) VALUES (?, ?, ?, 0, ?)",
        args: [randomUUID(), seasonId, membershipId, now.toISOString()],
      },
    ]);

    await applyDefaultRoomTemplate(tx, roomId, membershipId, now.toISOString());
    await tx.execute({
      sql: "INSERT INTO game_events (id, room_id, season_id, membership_id, actor_membership_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, 'season_started', ?, ?, ?)",
      args: [
        randomUUID(),
        roomId,
        seasonId,
        membershipId,
        membershipId,
        "Солнце взошло над саванной",
        "Первый сезон открыт. Весь прайд начинает путь с клетки 0.",
        now.toISOString(),
      ],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

async function migrateLegacySchema(client: Client) {
  const roomColumns = await client.execute("PRAGMA table_info(rooms)");
  const roomNames = new Set(roomColumns.rows.map((row) => String(row.name)));
  if (!roomNames.has("max_bot_token")) {
    await client.execute("ALTER TABLE rooms ADD COLUMN max_bot_token TEXT");
  }
  if (!roomNames.has("telegram_bot_token")) {
    await client.execute("ALTER TABLE rooms ADD COLUMN telegram_bot_token TEXT");
  }
  if (!roomNames.has("telegram_chat_id")) {
    await client.execute("ALTER TABLE rooms ADD COLUMN telegram_chat_id TEXT");
  }
  if (!roomNames.has("notification_settings_migrated")) {
    await client.execute("ALTER TABLE rooms ADD COLUMN notification_settings_migrated INTEGER NOT NULL DEFAULT 0");
  }
  const notificationColumns = await client.execute("PRAGMA table_info(notification_log)");
  const notificationNames = new Set(notificationColumns.rows.map((row) => String(row.name)));
  if (!notificationNames.has("room_id")) {
    await client.execute("ALTER TABLE notification_log ADD COLUMN room_id TEXT REFERENCES rooms(id)");
  }
  const rollColumns = await client.execute("PRAGMA table_info(rolls)");
  const names = new Set(rollColumns.rows.map((row) => String(row.name)));
  if (!names.has("request_id")) {
    await client.execute("ALTER TABLE rolls ADD COLUMN request_id TEXT");
  }
  if (!names.has("effect_text")) {
    await client.execute("ALTER TABLE rolls ADD COLUMN effect_text TEXT NOT NULL DEFAULT ''");
  }
  const creditColumns = await client.execute("PRAGMA table_info(roll_credits)");
  const creditNames = new Set(creditColumns.rows.map((row) => String(row.name)));
  if (!creditNames.has("expired_at")) {
    await client.execute("ALTER TABLE roll_credits ADD COLUMN expired_at TEXT");
    await client.execute("UPDATE roll_credits SET expired_at = expires_at WHERE status = 'expired' AND expired_at IS NULL");
  }
  await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS rolls_request_id_unique ON rolls(request_id) WHERE request_id IS NOT NULL");
  const seasonColumns = await client.execute("PRAGMA table_info(seasons)");
  const seasonNames = new Set(seasonColumns.rows.map((row) => String(row.name)));
  if (!seasonNames.has("final_prize")) {
    await client.execute("ALTER TABLE seasons ADD COLUMN final_prize TEXT");
    const legacyPrizes = await client.execute("SELECT id, final_prize_amount FROM seasons");
    for (const season of legacyPrizes.rows) {
      const amount = Number(season.final_prize_amount || 10000);
      await client.execute({
        sql: "UPDATE seasons SET final_prize = ? WHERE id = ?",
        args: [`${amount.toLocaleString("ru-RU")} ₽`, String(season.id)],
      });
    }
  }
  if (!seasonNames.has("final_prize_status")) {
    await client.execute("ALTER TABLE seasons ADD COLUMN final_prize_status TEXT CHECK(final_prize_status IN ('pending','issued'))");
  }
  if (!seasonNames.has("final_prize_issued_at")) {
    await client.execute("ALTER TABLE seasons ADD COLUMN final_prize_issued_at TEXT");
  }
  if (!seasonNames.has("final_prize_issued_by_membership_id")) {
    await client.execute("ALTER TABLE seasons ADD COLUMN final_prize_issued_by_membership_id TEXT REFERENCES memberships(id)");
  }
  const taskTemplateColumns = await client.execute("PRAGMA table_info(task_templates)");
  const taskTemplateNames = new Set(taskTemplateColumns.rows.map((row) => String(row.name)));
  if (!taskTemplateNames.has("achievement_tag")) {
    await client.execute("ALTER TABLE task_templates ADD COLUMN achievement_tag TEXT CHECK(achievement_tag IN ('review','client_photo') OR achievement_tag IS NULL)");
    await client.execute("UPDATE task_templates SET achievement_tag = 'review' WHERE title = 'Добрый отзыв о студии'");
    await client.execute("UPDATE task_templates SET achievement_tag = 'client_photo' WHERE title IN ('Фото с клиенткой','Общее фото после тренировки')");
  }
  const taskAssignmentColumns = await client.execute("PRAGMA table_info(task_assignments)");
  const taskAssignmentNames = new Set(taskAssignmentColumns.rows.map((row) => String(row.name)));
  if (!taskAssignmentNames.has("achievement_tag_snapshot")) {
    await client.execute("ALTER TABLE task_assignments ADD COLUMN achievement_tag_snapshot TEXT CHECK(achievement_tag_snapshot IN ('review','client_photo') OR achievement_tag_snapshot IS NULL)");
    await client.execute(`UPDATE task_assignments
      SET achievement_tag_snapshot = CASE
        WHEN title_snapshot = 'Добрый отзыв о студии' THEN 'review'
        WHEN title_snapshot IN ('Фото с клиенткой','Общее фото после тренировки') THEN 'client_photo'
        ELSE NULL END`);
  }
  const boardConfigColumns = await client.execute("PRAGMA table_info(board_cell_configs)");
  const boardConfigNames = new Set(boardConfigColumns.rows.map((row) => String(row.name)));
  if (!boardConfigNames.has("task_achievement_tag")) {
    await client.execute("ALTER TABLE board_cell_configs ADD COLUMN task_achievement_tag TEXT CHECK(task_achievement_tag IN ('review','client_photo') OR task_achievement_tag IS NULL)");
  }
}

async function migrateBrandIdentity(client: Client) {
  await client.batch([
    {
      sql: "UPDATE rooms SET name = ? WHERE name IN (?, ?)",
      args: ["Золотая Саванна: Путь к Вершине", "Королевы Львицы: Золотая саванна", "Золотая саванна"],
    },
    {
      sql: `UPDATE game_events SET title = REPLACE(REPLACE(REPLACE(title,
        'Королева сезона —', 'Победа сезона —'),
        'Скала Королев покорена!', 'Вершина достигнута!'),
        'Новая львица вступила в стаю', 'Прайд становится сильнее')
        WHERE title LIKE '%Королева сезона%'
           OR title LIKE '%Скала Королев%'
           OR title LIKE '%Новая львица%'`,
      args: [],
    },
    {
      sql: `UPDATE game_events SET body = REPLACE(REPLACE(REPLACE(REPLACE(body,
        'Все участницы начинают путь', 'Весь прайд начинает путь'),
        'Финиш достигнут первой. Победительнице положен финальный приз', 'Клетка 60 достигнута раньше остальных. Финальный приз:'),
        ' получила награду:', ': награда отмечена как выданная —'),
        ' получила финальный приз', ': финальный приз отмечен как выданный —')
        WHERE body LIKE '%участницы%'
           OR body LIKE '%Победительнице%'
           OR body LIKE '% получила награду:%'
           OR body LIKE '% получила финальный приз%'`,
      args: [],
    },
    {
      sql: `UPDATE game_events SET body = REPLACE(REPLACE(body,
        '«Наследница Скалы»', '«Зов Вершины»'),
        '«Непоколебимая»', '«Несгибаемый дух»')
        WHERE body LIKE '%Наследница Скалы%'
           OR body LIKE '%Непоколебимая%'`,
      args: [],
    },
    {
      sql: `UPDATE task_templates
        SET description = REPLACE(description, 'общее фото с участницами после тренировки', 'общее фото с группой после тренировки')
        WHERE description LIKE '%общее фото с участницами после тренировки%'`,
      args: [],
    },
    {
      sql: `UPDATE task_assignments
        SET description_snapshot = REPLACE(description_snapshot, 'общее фото с участницами после тренировки', 'общее фото с группой после тренировки')
        WHERE description_snapshot LIKE '%общее фото с участницами после тренировки%'`,
      args: [],
    },
  ]);
}

async function migrateSingleRoomNotificationSettings(client: Client) {
  const rooms = await client.execute(`SELECT id, max_bot_token, max_chat_id, telegram_bot_token, telegram_chat_id
    FROM rooms WHERE notification_settings_migrated = 0 ORDER BY created_at`);
  if (rooms.rows.length !== 1) return;
  const room = rooms.rows[0];
  const roomId = String(room.id);
  const maxToken = process.env.MAX_BOT_TOKEN?.trim() || null;
  const maxChatId = process.env.MAX_CHAT_ID?.trim() || null;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() || null;
  const alreadyConfigured = Boolean(room.max_bot_token || room.max_chat_id || room.telegram_bot_token || room.telegram_chat_id);
  if (!maxToken && !maxChatId && !telegramToken && !telegramChatId && !alreadyConfigured) return;
  await client.execute({
    sql: `UPDATE rooms SET
      max_bot_token = COALESCE(NULLIF(max_bot_token, ''), ?),
      max_chat_id = COALESCE(NULLIF(max_chat_id, ''), ?),
      telegram_bot_token = COALESCE(NULLIF(telegram_bot_token, ''), ?),
      telegram_chat_id = COALESCE(NULLIF(telegram_chat_id, ''), ?),
      notification_settings_migrated = 1
      WHERE id = ?`,
    args: [maxToken, maxChatId, telegramToken, telegramChatId, roomId],
  });
}

export async function ensureDatabase() {
  if (!globalThis.goldenSavannaReady) {
    globalThis.goldenSavannaReady = (async () => {
      const client = db();
      await client.executeMultiple(schemaSql);
      await migrateLegacySchema(client);
      await seedInitialRoom(client);
      await migrateBrandIdentity(client);
      await migrateSingleRoomNotificationSettings(client);
    })().catch((error) => {
      globalThis.goldenSavannaReady = undefined;
      throw error;
    });
  }
  await globalThis.goldenSavannaReady;
}

export async function query(sql: string, args: InValue[] = []) {
  await ensureDatabase();
  return withDatabaseLock(() => db().execute({ sql, args }));
}

export async function writeTransaction<T>(work: (tx: Transaction) => Promise<T>) {
  await ensureDatabase();
  return withDatabaseLock(async () => {
    const tx = await db().transaction("write");
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  });
}

export function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

export function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

export function numberValue(value: unknown) {
  return Number(value ?? 0);
}
