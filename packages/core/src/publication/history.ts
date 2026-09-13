import { and, desc, eq, inArray } from "drizzle-orm";

import { AdapterError } from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { publishHistory } from "../db/schema.js";
import { PUBLISH_HISTORY_LIMIT } from "./policy.js";

export type PublishHistoryRow = typeof publishHistory.$inferSelect;

export interface RecordSuccessInput {
  readonly projectId: string;
  readonly manifestVersion: number;
  /** Exact published bytes (rollback source). */
  readonly json: string;
  readonly storyIds: readonly string[];
  readonly publishedAt: Date;
}

export interface RecordFailureInput {
  readonly projectId: string;
  readonly manifestVersion: number;
  readonly publishedAt: Date;
  readonly error: unknown;
}

/** `<code>: <detail>` per design; non-adapter failures normalize to UNKNOWN. */
export function describePublicationError(error: unknown): string {
  if (error instanceof AdapterError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return `UNKNOWN: ${error.message}`;
  return `UNKNOWN: ${String(error)}`;
}

/** Design step 6: append a `result='success'` row carrying the exact bytes. */
export async function recordSuccess(
  db: DrizzleDb,
  input: RecordSuccessInput,
): Promise<void> {
  await db.insert(publishHistory).values({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    manifestVersion: input.manifestVersion,
    contentJson: input.json,
    storyIdsJson: JSON.stringify(input.storyIds),
    result: "success",
    errorDetail: null,
    publishedAt: input.publishedAt,
  });
  await pruneHistory(db, input.projectId);
}

/** Every failure appends a `result='failed'` row with the typed detail. */
export async function recordFailure(
  db: DrizzleDb,
  input: RecordFailureInput,
): Promise<void> {
  await db.insert(publishHistory).values({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    manifestVersion: input.manifestVersion,
    contentJson: "",
    storyIdsJson: "[]",
    result: "failed",
    errorDetail: describePublicationError(input.error),
    publishedAt: input.publishedAt,
  });
  await pruneHistory(db, input.projectId);
}

/** Lists the newest retained publication rows for the local API history façade. */
export async function listPublishHistory(
  db: DrizzleDb,
  projectId: string,
): Promise<PublishHistoryRow[]> {
  return db
    .select()
    .from(publishHistory)
    .where(eq(publishHistory.projectId, projectId))
    .orderBy(desc(publishHistory.publishedAt))
    .limit(PUBLISH_HISTORY_LIMIT);
}

/** Newest `result='success'` row for the project (rollback source, MP R5). */
export async function latestSuccessRow(
  db: DrizzleDb,
  projectId: string,
): Promise<PublishHistoryRow | undefined> {
  const [row] = await db
    .select()
    .from(publishHistory)
    .where(
      and(
        eq(publishHistory.projectId, projectId),
        eq(publishHistory.result, "success"),
      ),
    )
    .orderBy(desc(publishHistory.publishedAt))
    .limit(1);
  return row;
}

/** Keeps only the newest PUBLISH_HISTORY_LIMIT rows for the project. */
async function pruneHistory(db: DrizzleDb, projectId: string): Promise<void> {
  const rows = await db
    .select({ id: publishHistory.id })
    .from(publishHistory)
    .where(eq(publishHistory.projectId, projectId))
    .orderBy(desc(publishHistory.publishedAt));
  const staleIds = rows.slice(PUBLISH_HISTORY_LIMIT).map((row) => row.id);
  if (staleIds.length > 0) {
    await db.delete(publishHistory).where(inArray(publishHistory.id, staleIds));
  }
}
