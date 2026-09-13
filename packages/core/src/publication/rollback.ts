import type { StorageAdapter } from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { latestSuccessRow, recordFailure, recordSuccess } from "./history.js";
import {
  MANIFEST_CACHE_CONTROL_SECONDS,
  MANIFEST_CONTENT_TYPE,
} from "./policy.js";
import type { ProjectRow, PublicationOutcome } from "./publication-service.js";
import { verifyPublishedManifest } from "./verify-manifest.js";

/**
 * Thrown when rollback has no `result='success'` history row to restore
 * (endpoints map it to a typed error in PR 11).
 */
export class NoSuccessfulPublicationError extends Error {
  constructor(readonly projectId: string) {
    super(`project ${projectId} has no successful publication to roll back to`);
    this.name = "NoSuccessfulPublicationError";
  }
}

export interface RollbackDeps {
  readonly db: DrizzleDb;
  readonly adapter: StorageAdapter;
  readonly project: ProjectRow;
  readonly now: Date;
  readonly fetcher: typeof fetch;
}

/**
 * Verbatim rollback (MP R5): re-uploads the latest `result='success'` history
 * bytes EXACTLY as stored — never regenerated — then runs the same verify +
 * read-back round as publication. Restored bytes may contain since-expired
 * stories: they still self-expire by data (generation excludes them on the
 * next publish and the embed filters client-side), so rollback can never
 * resurrect an expired story as live.
 */
export async function rollbackToLatestSuccess(
  deps: RollbackDeps,
): Promise<PublicationOutcome> {
  const row = await latestSuccessRow(deps.db, deps.project.id);
  if (!row) throw new NoSuccessfulPublicationError(deps.project.id);
  const bytes = new TextEncoder().encode(row.contentJson);
  try {
    // Inside the guarded block: a corrupted history row surfaces as a typed
    // failed publication instead of an unhandled SyntaxError.
    const storyIds = JSON.parse(row.storyIdsJson) as string[];
    await deps.adapter.upload({
      key: deps.project.manifestKey,
      body: bytes,
      contentType: MANIFEST_CONTENT_TYPE,
      contentLength: bytes.byteLength,
      cacheControlSeconds: MANIFEST_CACHE_CONTROL_SECONDS,
    });
    await verifyPublishedManifest({
      adapter: deps.adapter,
      manifestKey: deps.project.manifestKey,
      expectedSize: bytes.byteLength,
      expectedStoryIds: storyIds,
      fetcher: deps.fetcher,
    });
    await recordSuccess(deps.db, {
      projectId: deps.project.id,
      manifestVersion: row.manifestVersion,
      json: row.contentJson,
      storyIds,
      publishedAt: deps.now,
    });
    return {
      manifestUrl: deps.adapter.publicUrl(deps.project.manifestKey),
      storyIds,
    };
  } catch (error) {
    await recordFailure(deps.db, {
      projectId: deps.project.id,
      manifestVersion: row.manifestVersion,
      publishedAt: deps.now,
      error,
    });
    throw error;
  }
}
