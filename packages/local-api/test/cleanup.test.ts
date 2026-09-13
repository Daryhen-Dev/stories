import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestDb,
  insertStory,
  seedProject,
} from "../../core/src/db/testing.js";
import type {
  StorageAdapter,
  VerifyResult,
} from "../../storage-adapters/src/index.js";
import { buildServer } from "../src/server.js";

const HOST_HEADERS = { host: "127.0.0.1:3789" } as const;

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
});

describe("cleanup routes (PR 12 EMC R1 / AC5)", () => {
  it("returns null before any cleanup run reports successfully", async () => {
    const db = createTestDb();
    await seedProject(db);
    const app = buildServer({
      db,
      makeAdapter: async () => {
        throw new Error("provider setup is unavailable");
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/cleanup/status",
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it("runs cleanup for one project manually and exposes that report as the latest status", async () => {
    const db = createTestDb();
    const adapter = createCleanupAdapter();
    const app = buildServer({ db, makeAdapter: () => adapter });
    apps.push(app);
    await app.ready();

    const projectId = await seedProject(db);
    const storyId = await insertStory(db, projectId, {
      expiresAt: new Date(Date.now() - 1),
      mediaKey: "stories/manual/media.jpg",
      posterKey: "stories/manual/poster.jpg",
    });

    const cleanup = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/cleanup`,
      headers: HOST_HEADERS,
    });
    const status = await app.inject({
      method: "GET",
      url: "/api/cleanup/status",
      headers: HOST_HEADERS,
    });

    const expected = {
      attempted: 1,
      deleted: 1,
      failed: 0,
      errors: [],
    };
    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json()).toEqual(expected);
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual(expected);
    expect(adapter.deletedKeys).toEqual([
      "stories/manual/media.jpg",
      "stories/manual/poster.jpg",
    ]);
    expect(storyId).toEqual(expect.any(String));
  });
});
