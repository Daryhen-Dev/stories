import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  AdapterError,
  createFakeStorageAdapter,
  type StorageAdapter,
} from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { stories, storyMediaPendingDeletion } from "../db/schema.js";
import {
  createTestDb,
  insertStory,
  makePendingDeletion,
  NOW_MS,
  seedProject,
} from "../db/testing.js";
import { createCleanupService } from "../index.js";

interface DeleteAdapterOptions {
  readonly failures?: ReadonlyMap<string, AdapterError>;
}

function makeDeleteAdapter(options: DeleteAdapterOptions = {}) {
  const deleted: string[] = [];
  const adapter: StorageAdapter = {
    provider: "supabase",
    upload: async () => ({}),
    verify: async () => ({ ok: true, size: 0, contentType: null }),
    publicUrl: (key) => `https://storage.example.test/${key}`,
    delete: async (key) => {
      deleted.push(key);
      const failure = options.failures?.get(key);
      if (failure) throw failure;
    },
    checkPublicRead: async () => ({ ok: true, httpStatus: 200 }),
  };
  return { adapter, deleted };
}

function cleanupService(db: DrizzleDb, adapter: StorageAdapter) {
  return createCleanupService(db, () => adapter);
}

async function makeStatefulRetryAdapter(failFirstKey: string) {
  const fake = createFakeStorageAdapter({
    bucket: "stories-test",
    publicBaseUrl: "https://storage.example.test/stories-test",
  });
  const deleted: string[] = [];
  let failurePending = true;
  const adapter: StorageAdapter = {
    provider: fake.provider,
    upload: fake.upload,
    verify: fake.verify,
    publicUrl: fake.publicUrl,
    delete: async (key) => {
      deleted.push(key);
      if (key === failFirstKey && failurePending) {
        failurePending = false;
        throw new AdapterError(
          "DELETE_FAILED",
          "supabase",
          "transient poster delete failure",
        );
      }
      await fake.delete(key);
    },
    checkPublicRead: fake.checkPublicRead,
  };
  const store = async (key: string) => {
    const body = new TextEncoder().encode(key);
    await fake.upload({
      key,
      body,
      contentType: "application/octet-stream",
      contentLength: body.byteLength,
      cacheControlSeconds: 60,
    });
  };

  return { adapter, deleted, store };
}

async function storyById(db: DrizzleDb, storyId: string) {
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId));
  if (!story) throw new Error(`fixture story ${storyId} missing`);
  return story;
}

async function pendingRows(db: DrizzleDb, projectId: string) {
  return db
    .select()
    .from(storyMediaPendingDeletion)
    .where(eq(storyMediaPendingDeletion.projectId, projectId));
}

describe("createCleanupService", () => {
  it("sweeps expiry before selecting stories, cleans successful media, and clears prior errors", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const expiredId = await insertStory(db, projectId, {
      mediaKey: "stories/expired/media.jpg",
      expiresAt: new Date(NOW_MS - 1),
      lastCleanupError: "DELETE_FAILED: previous failure",
    });
    const futureId = await insertStory(db, projectId, {
      mediaKey: "stories/future/media.jpg",
      expiresAt: new Date(NOW_MS + 1),
    });
    const { adapter, deleted } = makeDeleteAdapter();

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({ attempted: 1, deleted: 1, failed: 0, errors: [] });
    expect(deleted).toEqual(["stories/expired/media.jpg"]);
    expect(await storyById(db, expiredId)).toMatchObject({
      status: "cleaned",
      cleanedAt: new Date(NOW_MS),
      lastCleanupError: null,
    });
    expect(await storyById(db, futureId)).toMatchObject({
      status: "published",
      cleanedAt: null,
    });
  });

  it("records typed failures and continues to clean later expired stories", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const failedId = await insertStory(db, projectId, {
      mediaKey: "stories/fails/media.jpg",
      expiresAt: new Date(NOW_MS - 2),
    });
    const cleanedId = await insertStory(db, projectId, {
      mediaKey: "stories/succeeds/media.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const failure = new AdapterError(
      "NETWORK_ERROR",
      "supabase",
      "provider unreachable",
    );
    const { adapter, deleted } = makeDeleteAdapter({
      failures: new Map([["stories/fails/media.jpg", failure]]),
    });

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({
      attempted: 2,
      deleted: 1,
      failed: 1,
      errors: [{ storyId: failedId, code: "NETWORK_ERROR" }],
    });
    expect(deleted).toEqual([
      "stories/fails/media.jpg",
      "stories/succeeds/media.jpg",
    ]);
    expect(await storyById(db, failedId)).toMatchObject({
      status: "expired",
      cleanedAt: null,
      lastCleanupError: "NETWORK_ERROR: provider unreachable",
    });
    expect(await storyById(db, cleanedId)).toMatchObject({
      status: "cleaned",
      cleanedAt: new Date(NOW_MS),
    });
  });

  it("deletes a poster with its expired story media before marking the story cleaned", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const storyId = await insertStory(db, projectId, {
      mediaKey: "stories/with-poster/media.mp4",
      posterKey: "stories/with-poster/poster.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const { adapter, deleted } = makeDeleteAdapter();

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({ attempted: 1, deleted: 1, failed: 0, errors: [] });
    expect(deleted).toEqual([
      "stories/with-poster/media.mp4",
      "stories/with-poster/poster.jpg",
    ]);
    expect(await storyById(db, storyId)).toMatchObject({
      status: "cleaned",
      cleanedAt: new Date(NOW_MS),
    });
  });

  it("leaves a story expired when deleting its optional poster fails", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const storyId = await insertStory(db, projectId, {
      mediaKey: "stories/poster-fails/media.mp4",
      posterKey: "stories/poster-fails/poster.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const { adapter, deleted } = makeDeleteAdapter({
      failures: new Map([
        [
          "stories/poster-fails/poster.jpg",
          new AdapterError("DELETE_FAILED", "supabase", "poster delete failed"),
        ],
      ]),
    });

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({
      attempted: 1,
      deleted: 0,
      failed: 1,
      errors: [{ storyId, code: "DELETE_FAILED" }],
    });
    expect(deleted).toEqual([
      "stories/poster-fails/media.mp4",
      "stories/poster-fails/poster.jpg",
    ]);
    expect(await storyById(db, storyId)).toMatchObject({
      status: "expired",
      cleanedAt: null,
      lastCleanupError: "DELETE_FAILED: poster delete failed",
    });
  });

  it("retries a partial expired-story deletion when its media is already missing", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const storyId = await insertStory(db, projectId, {
      mediaKey: "stories/retry-story/media.mp4",
      posterKey: "stories/retry-story/poster.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const mediaKey = "stories/retry-story/media.mp4";
    const posterKey = "stories/retry-story/poster.jpg";
    const { adapter, deleted, store } =
      await makeStatefulRetryAdapter(posterKey);
    await store(mediaKey);
    await store(posterKey);

    const firstReport = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(firstReport).toEqual({
      attempted: 1,
      deleted: 0,
      failed: 1,
      errors: [{ storyId, code: "DELETE_FAILED" }],
    });
    expect(deleted).toEqual([mediaKey, posterKey]);
    expect(await storyById(db, storyId)).toMatchObject({
      status: "expired",
      cleanedAt: null,
      lastCleanupError: "DELETE_FAILED: transient poster delete failure",
    });

    const secondReport = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(secondReport).toEqual({
      attempted: 1,
      deleted: 1,
      failed: 0,
      errors: [],
    });
    expect(deleted).toEqual([mediaKey, posterKey, mediaKey, posterKey]);
    expect(await storyById(db, storyId)).toMatchObject({
      status: "cleaned",
      cleanedAt: new Date(NOW_MS),
      lastCleanupError: null,
    });
  });

  it("retries a partial pending-deletion row when its media is already missing", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const pending = makePendingDeletion(projectId, {
      storyId: "removed-retry-story",
      mediaKey: "stories/retry-pending/media.mp4",
      posterKey: "stories/retry-pending/poster.jpg",
    });
    await db.insert(storyMediaPendingDeletion).values(pending);
    const { adapter, deleted, store } = await makeStatefulRetryAdapter(
      pending.posterKey ?? "",
    );
    await store(pending.mediaKey);
    await store(pending.posterKey ?? "");

    const firstReport = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(firstReport).toEqual({
      attempted: 1,
      deleted: 0,
      failed: 1,
      errors: [{ storyId: pending.storyId, code: "DELETE_FAILED" }],
    });
    expect(deleted).toEqual([pending.mediaKey, pending.posterKey]);
    expect(await pendingRows(db, projectId)).toHaveLength(1);

    const secondReport = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(secondReport).toEqual({
      attempted: 1,
      deleted: 1,
      failed: 0,
      errors: [],
    });
    expect(deleted).toEqual([
      pending.mediaKey,
      pending.posterKey,
      pending.mediaKey,
      pending.posterKey,
    ]);
    expect(await pendingRows(db, projectId)).toEqual([]);
  });

  it("sweeps pending-deletion media into the same report and removes successful rows", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const expiredId = await insertStory(db, projectId, {
      mediaKey: "stories/expired/media.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const pending = makePendingDeletion(projectId, {
      storyId: "removed-story-id",
      mediaKey: "stories/removed/media.jpg",
      posterKey: "stories/removed/poster.jpg",
    });
    await db.insert(storyMediaPendingDeletion).values(pending);
    const { adapter, deleted } = makeDeleteAdapter();

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({ attempted: 2, deleted: 2, failed: 0, errors: [] });
    expect(deleted).toEqual([
      "stories/expired/media.jpg",
      "stories/removed/media.jpg",
      "stories/removed/poster.jpg",
    ]);
    expect(await storyById(db, expiredId)).toMatchObject({
      status: "cleaned",
      cleanedAt: new Date(NOW_MS),
    });
    expect(await pendingRows(db, projectId)).toEqual([]);
  });

  it("continues the expired no-poster sweep when a pending deletion fails, with exact mixed counts", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const firstId = await insertStory(db, projectId, {
      mediaKey: "stories/first/media.jpg",
      expiresAt: new Date(NOW_MS - 2),
    });
    const secondId = await insertStory(db, projectId, {
      mediaKey: "stories/second/media.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const pending = makePendingDeletion(projectId, {
      storyId: "removed-story-id",
      mediaKey: "stories/removed/media.jpg",
    });
    await db.insert(storyMediaPendingDeletion).values(pending);
    const { adapter, deleted } = makeDeleteAdapter({
      failures: new Map([
        [
          pending.mediaKey,
          new AdapterError(
            "DELETE_FAILED",
            "supabase",
            "pending delete failed",
          ),
        ],
      ]),
    });

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({
      attempted: 3,
      deleted: 2,
      failed: 1,
      errors: [{ storyId: pending.storyId, code: "DELETE_FAILED" }],
    });
    expect(deleted).toEqual([
      "stories/first/media.jpg",
      "stories/second/media.jpg",
      "stories/removed/media.jpg",
    ]);
    expect(await storyById(db, firstId)).toMatchObject({ status: "cleaned" });
    expect(await storyById(db, secondId)).toMatchObject({ status: "cleaned" });
    expect(await pendingRows(db, projectId)).toHaveLength(1);
  });

  it("completes and reports every failure when the adapter always rejects deletion", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const firstId = await insertStory(db, projectId, {
      mediaKey: "stories/first/media.jpg",
      expiresAt: new Date(NOW_MS - 2),
    });
    const secondId = await insertStory(db, projectId, {
      mediaKey: "stories/second/media.jpg",
      expiresAt: new Date(NOW_MS - 1),
    });
    const { adapter } = makeDeleteAdapter({
      failures: new Map([
        [
          "stories/first/media.jpg",
          new AdapterError("DELETE_FAILED", "supabase", "first delete failed"),
        ],
        [
          "stories/second/media.jpg",
          new AdapterError("DELETE_FAILED", "supabase", "second delete failed"),
        ],
      ]),
    });

    const report = await cleanupService(db, adapter).cleanup(projectId, {
      now: new Date(NOW_MS),
    });

    expect(report).toEqual({
      attempted: 2,
      deleted: 0,
      failed: 2,
      errors: [
        { storyId: firstId, code: "DELETE_FAILED" },
        { storyId: secondId, code: "DELETE_FAILED" },
      ],
    });
    expect(await storyById(db, firstId)).toMatchObject({ status: "expired" });
    expect(await storyById(db, secondId)).toMatchObject({ status: "expired" });
  });
});
