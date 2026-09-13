import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

/** Schema-aware Drizzle handle over a better-sqlite3 connection. */
export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface CreateDbOptions {
  /** SQLite file path; defaults to a private in-memory database. */
  readonly file?: string;
}

/**
 * Opens a SQLite database through better-sqlite3 and wraps it in Drizzle.
 * Foreign keys are enforced explicitly so the `ON DELETE CASCADE` edges
 * (stories, publish history, pending deletions) behave as designed.
 */
export function createDb(options: CreateDbOptions = {}): DrizzleDb {
  const sqlite = new Database(options.file ?? ":memory:");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
