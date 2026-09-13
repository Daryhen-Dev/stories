import { and, eq, lte } from "drizzle-orm";

import type { DrizzleDb } from "../db/client.js";
import { stories } from "../db/schema.js";

/**
 * Materializes expiry (SL R4): every `published` story whose `expiresAt` is at
 * or before `now` becomes `expired`. Correctness paths (manifest generation,
 * cleanup, API startup) run this sweep first and never trust a stale status
 * column. Returns the number of transitioned rows; re-running at the same
 * instant transitions zero rows (idempotent).
 */
export async function expireStories(db: DrizzleDb, now: Date): Promise<number> {
  const expired = await db
    .update(stories)
    .set({ status: "expired" })
    .where(and(eq(stories.status, "published"), lte(stories.expiresAt, now)))
    .returning({ id: stories.id });
  return expired.length;
}
