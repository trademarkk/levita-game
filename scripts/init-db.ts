import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { ensureDatabase, query } = await import("../src/lib/db");
  await ensureDatabase();
  const room = await query("SELECT name FROM rooms LIMIT 1");
  console.log(`Database ready: ${String(room.rows[0]?.name || "room created")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
