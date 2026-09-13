import { eq } from "drizzle-orm";
import { MANIFEST_VERSION } from "@stories/manifest-schema";
import { AdapterError } from "@stories/storage-adapters";
import type {
  ObjectExpectation,
  StorageAdapter,
} from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { projects } from "../db/schema.js";
import type { StoryRow } from "../domain/story-service.js";
import { generateManifest } from "./generate-manifest.js";
import { listPublishHistory, recordFailure, recordSuccess } from "./history.js";
import {
  MANIFEST_CACHE_CONTROL_SECONDS,
  MANIFEST_CONTENT_TYPE,
  MEDIA_CACHE_CONTROL_SECONDS,
} from "./policy.js";
import { rollbackToLatestSuccess } from "./rollback.js";
import { verifyPublishedManifest } from "./verify-manifest.js";

export type ProjectRow = typeof projects.$inferSelect;

/** Thrown when a project id does not exist (endpoints map it to 404 in PR 11). */
export class ProjectNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`project ${projectId} not found`);
    this.name = "ProjectNotFoundError";
  }
}

/**
 * Pending-media source: provides the bytes of a story's media or poster whose
 * upload never happened (e.g. a crash between row insert and upload). The
 * normal creation flow (PR 10) uploads before auto-publish, so this stays
 * unused on the happy path.
 */
export type PendingMediaLoader = (
  story: StoryRow,
  kind: "media" | "poster",
) => Promise<Uint8Array | undefined> | Uint8Array | undefined;

export interface PublicationDeps {
  readonly db: DrizzleDb;
  /** Builds the project's adapter from its stored configuration (contract only). */
  readonly makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter;
  /** Step-5 read-back fetcher; defaults to globalThis.fetch (tests stub it). */
  readonly fetcher?: typeof fetch;
  readonly loadPendingMedia?: PendingMediaLoader;
}

export interface PublicationClock {
  /** Reference instant for the sweep, generatedAt and history rows; tests pin it. */
  readonly now?: Date;
}

export interface PublicationOutcome {
  readonly manifestUrl: string;
  readonly storyIds: readonly string[];
}

const POSTER_CONTENT_TYPE = "image/jpeg";

interface PendingUploadPlan {
  readonly contentType: string;
  readonly cacheControlSeconds: number;
  /** Declared upload length; defaults to the provided body size. */
  readonly contentLength?: number;
}

/**
 * Publication service (MP R4, design steps 1–6). The single manifest PUT is
 * the only production write path (MP R7): media is uploaded at story creation
 * (PR 10) and only pending media is uploaded here, through `loadPendingMedia`.
 */
export function createPublicationService(deps: PublicationDeps) {
  const fetcher = deps.fetcher ?? globalThis.fetch;

  async function loadProject(projectId: string): Promise<ProjectRow> {
    const [row] = await deps.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!row) throw new ProjectNotFoundError(projectId);
    return row;
  }

  /**
   * Runs design steps 1–6. Every failure AFTER the project is loaded leaves
   * the previous manifest serving, records a `result='failed'` history row,
   * and surfaces the typed error (AdapterError or read-back failure).
   */
  async function publish(
    projectId: string,
    clock: PublicationClock = {},
  ): Promise<PublicationOutcome> {
    const now = clock.now ?? new Date();
    const project = await loadProject(projectId);
    const adapter = await deps.makeAdapter(project);
    try {
      // Steps 1+3: sweep first, build and serialize deterministically.
      const generated = await generateManifest(deps.db, project, now);
      // Step 2: media/poster upload + verify (pending media only — MP R7).
      for (const story of generated.includedStories) {
        await ensureStoryMedia(adapter, story, deps.loadPendingMedia);
      }
      // Step 4: the atomic cutover — one manifest PUT.
      await adapter.upload({
        key: project.manifestKey,
        body: generated.bytes,
        contentType: MANIFEST_CONTENT_TYPE,
        contentLength: generated.bytes.byteLength,
        cacheControlSeconds: MANIFEST_CACHE_CONTROL_SECONDS,
      });
      // Step 5: verify round + read-back parse + story-id set equality
      // (shared helper also used by rollback).
      await verifyPublishedManifest({
        adapter,
        manifestKey: project.manifestKey,
        expectedSize: generated.bytes.byteLength,
        expectedStoryIds: generated.storyIds,
        fetcher,
      });
      // Step 6: history with the exact bytes, pruned to the last 50 rows.
      await recordSuccess(deps.db, {
        projectId,
        manifestVersion: generated.manifest.version,
        json: generated.json,
        storyIds: generated.storyIds,
        publishedAt: now,
      });
      return {
        manifestUrl: adapter.publicUrl(project.manifestKey),
        storyIds: generated.storyIds,
      };
    } catch (error) {
      await recordFailure(deps.db, {
        projectId,
        manifestVersion: MANIFEST_VERSION,
        publishedAt: now,
        error,
      });
      throw error;
    }
  }

  /** Verbatim rollback (MP R5) — see `rollback.ts`. */
  async function rollback(
    projectId: string,
    clock: PublicationClock = {},
  ): Promise<PublicationOutcome> {
    const now = clock.now ?? new Date();
    const project = await loadProject(projectId);
    const adapter = await deps.makeAdapter(project);
    return rollbackToLatestSuccess({
      db: deps.db,
      adapter,
      project,
      now,
      fetcher,
    });
  }

  /** Lists the newest retained rows after confirming the project exists. */
  async function listHistory(projectId: string) {
    await loadProject(projectId);
    return listPublishHistory(deps.db, projectId);
  }

  return { listHistory, publish, rollback } as const;
}

/**
 * Design step 2: already-uploaded media only needs verification; pending
 * (OBJECT_NOT_FOUND) media is uploaded through the injected source and
 * re-verified. Any other failure aborts publication with the manifest
 * untouched.
 */
async function ensureStoryMedia(
  adapter: StorageAdapter,
  story: StoryRow,
  loadPendingMedia: PendingMediaLoader | undefined,
): Promise<void> {
  await ensureObject(
    adapter,
    story.mediaKey,
    { size: story.sizeBytes, contentType: story.mimeType },
    loadPendingMedia === undefined
      ? undefined
      : () => loadPendingMedia(story, "media"),
    {
      contentType: story.mimeType,
      cacheControlSeconds: MEDIA_CACHE_CONTROL_SECONDS,
      contentLength: story.sizeBytes,
    },
  );
  if (story.posterKey !== null) {
    await ensureObject(
      adapter,
      story.posterKey,
      { contentType: POSTER_CONTENT_TYPE },
      loadPendingMedia === undefined
        ? undefined
        : () => loadPendingMedia(story, "poster"),
      {
        contentType: POSTER_CONTENT_TYPE,
        cacheControlSeconds: MEDIA_CACHE_CONTROL_SECONDS,
      },
    );
  }
}

type PendingBodyLoader = () =>
  Uint8Array | undefined | Promise<Uint8Array | undefined>;

async function ensureObject(
  adapter: StorageAdapter,
  key: string,
  expected: ObjectExpectation,
  load: PendingBodyLoader | undefined,
  plan: PendingUploadPlan,
): Promise<void> {
  const verified = await adapter.verify(key, expected);
  if (verified.ok) return;
  if (verified.code !== "OBJECT_NOT_FOUND" || load === undefined) {
    throw new AdapterError(
      verified.code,
      adapter.provider,
      `media verification failed for "${key}": ${verified.detail}`,
    );
  }
  const body = await load();
  if (body === undefined) {
    throw new AdapterError(
      "UPLOAD_FAILED",
      adapter.provider,
      `pending media "${key}" has no upload source; recreate the story or fix its media record`,
    );
  }
  await adapter.upload({
    key,
    body,
    contentType: plan.contentType,
    contentLength: plan.contentLength ?? body.byteLength,
    cacheControlSeconds: plan.cacheControlSeconds,
  });
  const recheckExpectation: ObjectExpectation =
    plan.contentLength === undefined
      ? { ...expected, size: body.byteLength }
      : expected;
  const recheck = await adapter.verify(key, recheckExpectation);
  if (!recheck.ok) {
    throw new AdapterError(
      recheck.code,
      adapter.provider,
      `media verification failed after upload for "${key}": ${recheck.detail}`,
    );
  }
}
