import { gzipSync } from "node:zlib";
import { del, list, put } from "@vercel/blob";
import { assertCron } from "@/lib/cron";
import { db, ensureDatabase } from "@/lib/db";
import { apiError, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const backupTables = [
  "users",
  "rooms",
  "memberships",
  "seasons",
  "season_players",
  "invitations",
  "roll_credits",
  "rolls",
  "task_templates",
  "task_assignments",
  "reward_catalog",
  "reward_grants",
  "board_cell_configs",
  "game_events",
  "notification_log",
] as const;

export async function GET(request: Request) {
  try {
    assertCron(request);
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "Vercel Blob для резервных копий не настроен.");
    await ensureDatabase();
    const snapshot: Record<string, unknown> = {
      version: 1,
      createdAt: new Date().toISOString(),
      tables: {},
    };
    const tables = snapshot.tables as Record<string, unknown>;
    for (const table of backupTables) {
      const result = await db().execute(`SELECT * FROM ${table}`);
      tables[table] = result.rows.map((row) => Object.fromEntries(Object.entries(row)));
    }
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const body = gzipSync(Buffer.from(JSON.stringify(snapshot)));
    const uploaded = await put(`golden-savanna-backups/${date}.json.gz`, body, {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/gzip",
    });

    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "golden-savanna-backups/", cursor, limit: 100 });
      const stale = page.blobs.filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff);
      if (stale.length) await del(stale.map((blob) => blob.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return Response.json({ ok: true, pathname: uploaded.pathname, bytes: body.byteLength });
  } catch (error) {
    return apiError(error);
  }
}
