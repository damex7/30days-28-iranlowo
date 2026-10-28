// Applies db/migrations/*.sql in filename order, once each.
//
//   npm run db:migrate   (node --env-file=.env.local scripts/migrate.mjs)
//
// Rules:
//   * files are numbered (001_, 002_, ...) so every database applies them in
//     the same order;
//   * each file runs in its own transaction: it either fully applies and is
//     recorded in schema_migrations, or leaves no trace;
//   * files already recorded are skipped;
//   * the first error stops the run, so later files never build on a broken one.
// Migrations are forward-only and never edited after they are applied: fix
// a mistake with a new file.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local.");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "db", "migrations");
// A Pool speaks the WebSocket protocol, which allows multi-statement files
// and BEGIN/COMMIT on one connection (the HTTP driver cannot).
const pool = new Pool({ connectionString: url });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await client.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename),
  );
  const files = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("ok");
      ran++;
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      break;
    }
  }
  if (process.exitCode !== 1) {
    console.log(ran === 0 ? "Nothing to apply; database is up to date." : `Applied ${ran} migration(s).`);
  }
} finally {
  client.release();
  await pool.end();
}
