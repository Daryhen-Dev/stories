import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTestDb,
  insertStory,
  seedProject,
} from "../../core/src/db/testing.js";
import { stories } from "../../core/src/db/schema.js";
import type {
  StorageAdapter,
  VerifyResult,
} from "../../storage-adapters/src/index.js";
import { buildServer } from "./server.js";

const HOUR_MS = 60 * 60 * 1_000;

interface CleanupAdapter extends StorageAdapter {
  readonly deletedKeys: readonly string[];
}

function createCleanupAdapter(): CleanupAdapter {
  const deletedKeys: string[] = [];
  return {
    provider: "supabase",
    async upload() {
      return {};
    },
    async verify(): Promise<VerifyResult> {
      return { ok: true, size: 0, contentType: null };
    },
    publicUrl(key) {
      return `https://storage.example/${key}`;
    },
    async delete(key) {
      deletedKeys.push(key);
    },
    async checkPublicRead() {
      return { ok: true, httpStatus: 200 };
    },
    deletedKeys,
  };
}

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cleanup scheduler (PR 12 EMC R1 / D1)", () => {
  it("runs all existing projects during server startup and stores the aggregate report", async () => {
    const db = createTestDb();
    const adapter = createCleanupAdapter();
    const projectId = await seedProject(db);
    const storyId = await insertStory(db, projectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/startup/media.jpg",
    });
    const app = buildServer({ db, makeAdapter: () => adapter });
    apps.push(app);

    await app.ready();

    const status = await app.inject({
      method: "GET",
      url: "/api/cleanup/status",
      headers: { host: "127.0.0.1:3789" },
    });
    const [story] = await db.select().from(stories);

    expect(adapter.deletedKeys).toEqual(["stories/startup/media.jpg"]);
    expect(story).toMatchObject({ id: storyId, status: "cleaned" });
    expect(status.json()).toEqual({
      attempted: 1,
      deleted: 1,
      failed: 0,
      errors: [],
    });
  });

  it("runs again after the default 60-minute interval", async () => {
    vi.useFakeTimers();
    const db = createTestDb();
    const adapter = createCleanupAdapter();
    const app = buildServer({ db, makeAdapter: () => adapter });
    apps.push(app);
    await app.ready();

    const projectId = await seedProject(db);
    await insertStory(db, projectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/default-interval/media.jpg",
    });
    await vi.advanceTimersByTimeAsync(HOUR_MS - 1);
    expect(adapter.deletedKeys).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(adapter.deletedKeys).toEqual(["stories/default-interval/media.jpg"]);
  });

  it("uses STORIES_CLEANUP_INTERVAL_MINUTES as a positive-integer interval override", async () => {
    vi.useFakeTimers();
    vi.stubEnv("STORIES_CLEANUP_INTERVAL_MINUTES", "2");
    const db = createTestDb();
    const adapter = createCleanupAdapter();
    const app = buildServer({ db, makeAdapter: () => adapter });
    apps.push(app);
    await app.ready();

    const projectId = await seedProject(db);
    await insertStory(db, projectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/configured-interval/media.jpg",
    });
    await vi.advanceTimersByTimeAsync(2 * 60 * 1_000 - 1);
    expect(adapter.deletedKeys).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(adapter.deletedKeys).toEqual([
      "stories/configured-interval/media.jpg",
    ]);
  });

  it("publishes a zero aggregate report when startup finds no projects", async () => {
    const db = createTestDb();
    const app = buildServer({ db, makeAdapter: () => createCleanupAdapter() });
    apps.push(app);

    await app.ready();

    const status = await app.inject({
      method: "GET",
      url: "/api/cleanup/status",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      attempted: 0,
      deleted: 0,
      failed: 0,
      errors: [],
    });
  });

  it("aggregates completed cleanup reports across projects", async () => {
    const db = createTestDb();
    const adapter = createCleanupAdapter();
    const firstProjectId = await seedProject(db, { name: "Alpha" });
    const secondProjectId = await seedProject(db, { name: "Bravo" });
    await insertStory(db, firstProjectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/alpha/media.jpg",
    });
    await insertStory(db, secondProjectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/bravo/media.jpg",
    });
    const app = buildServer({ db, makeAdapter: () => adapter });
    apps.push(app);

    await app.ready();

    const status = await app.inject({
      method: "GET",
      url: "/api/cleanup/status",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(adapter.deletedKeys).toEqual([
      "stories/alpha/media.jpg",
      "stories/bravo/media.jpg",
    ]);
    expect(status.json()).toEqual({
      attempted: 2,
      deleted: 2,
      failed: 0,
      errors: [],
    });
  });

  it("attempts and swallows automatic setup failures so Fastify remains available", async () => {
    const db = createTestDb();
    await seedProject(db);
    const makeAdapter = vi.fn(async () => {
      throw new Error("adapter creation failed");
    });
    const app = buildServer({ db, makeAdapter });
    apps.push(app);

    await app.ready();
    const health = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(makeAdapter).toHaveBeenCalledTimes(1);
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
  });
});
