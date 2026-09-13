import { and, eq } from "drizzle-orm";
import {
  AdapterError,
  type AdapterErrorCode,
  type StorageAdapter,
} from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { projects, stories, storyMediaPendingDeletion } from "../db/schema.js";
import { expireStories } from "../domain/expire-stories.js";
import {
  ProjectNotFoundError,
  type ProjectRow,
} from "../publication/publication-service.js";

export interface CleanupReport {
  readonly attempted: number;
  readonly deleted: number;
  readonly failed: number;
  readonly errors: readonly CleanupError[];
}

export interface CleanupError {
  readonly storyId: string;
  readonly code: AdapterErrorCode;
}

export interface CleanupClock {
  /** Reference instant for expiry materialization and successful cleanup rows. */
  readonly now?: Date;
}

export type CleanupAdapterFactory = (
  project: ProjectRow,
) => Promise<StorageAdapter> | StorageAdapter;

interface FailureDetail {
  readonly code: AdapterErrorCode;
  readonly detail: string;
}

/**
 * Best-effort provider hygiene (EMC R2–R5): cleanup never participates in
 * expiry or publication correctness. Each record is independent so a provider
 * failure remains visible locally while later records are still attempted.
 */
export function createCleanupService(
  db: DrizzleDb,
  makeAdapter: CleanupAdapterFactory,
) {
  async function cleanup(
    projectId: string,
    clock: CleanupClock = {},
  ): Promise<CleanupReport> {
    const now = clock.now ?? new Date();
    const project = await loadProject(db, projectId);
    const adapter = await makeAdapter(project);
    const report: MutableCleanupReport = {
      attempted: 0,
      deleted: 0,
      failed: 0,
      errors: [],
    };

    // Match manifest generation: materialize expiry before selecting the rows.
    await expireStories(db, now);

    const expiredStories = await db
      .select()
      .from(stories)
      .where(
        and(eq(stories.projectId, projectId), eq(stories.status, "expired")),
      );
    for (const story of expiredStories) {
      report.attempted += 1;
      try {
        await deleteObjects(adapter, story.mediaKey, story.posterKey);
        await db
          .update(stories)
          .set({ status: "cleaned", cleanedAt: now, lastCleanupError: null })
          .where(eq(stories.id, story.id));
        report.deleted += 1;
      } catch (error) {
        const failure = failureDetail(error);
        await db
          .update(stories)
          .set({ lastCleanupError: `${failure.code}: ${failure.detail}` })
          .where(eq(stories.id, story.id));
        recordFailure(report, story.id, failure.code);
      }
    }

    const pendingDeletions = await db
      .select()
      .from(storyMediaPendingDeletion)
      .where(eq(storyMediaPendingDeletion.projectId, projectId));
    for (const pending of pendingDeletions) {
      report.attempted += 1;
      try {
        await deleteObjects(adapter, pending.mediaKey, pending.posterKey);
        await db
          .delete(storyMediaPendingDeletion)
          .where(eq(storyMediaPendingDeletion.id, pending.id));
        report.deleted += 1;
      } catch (error) {
        recordFailure(report, pending.storyId, failureDetail(error).code);
      }
    }

    return report;
  }

  return { cleanup } as const;
}

interface MutableCleanupReport {
  attempted: number;
  deleted: number;
  failed: number;
  errors: CleanupError[];
}

async function loadProject(
  db: DrizzleDb,
  projectId: string,
): Promise<ProjectRow> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) throw new ProjectNotFoundError(projectId);
  return project;
}

async function deleteObjects(
  adapter: StorageAdapter,
  mediaKey: string,
  posterKey: string | null,
): Promise<void> {
  await deleteObject(adapter, mediaKey);
  if (posterKey !== null) await deleteObject(adapter, posterKey);
}

async function deleteObject(
  adapter: StorageAdapter,
  key: string,
): Promise<void> {
  try {
    await adapter.delete(key);
  } catch (error) {
    if (error instanceof AdapterError && error.code === "OBJECT_NOT_FOUND")
      return;
    throw error;
  }
}

function failureDetail(error: unknown): FailureDetail {
  if (error instanceof AdapterError) {
    return { code: error.code, detail: error.message };
  }
  return {
    code: "UNKNOWN",
    detail: error instanceof Error ? error.message : String(error),
  };
}

function recordFailure(
  report: MutableCleanupReport,
  storyId: string,
  code: AdapterErrorCode,
): void {
  report.failed += 1;
  report.errors.push({ storyId, code });
}
