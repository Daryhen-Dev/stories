import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { DrizzleDb } from "../db/client.js";
import { stories, storyMediaPendingDeletion } from "../db/schema.js";
import {
  createTestDb,
  insertStory,
  NOW_MS,
  seedProject,
} from "../db/testing.js";
import type { CreateStoryInput, StoryRow } from "./story-service.js";
import { createStoryService, StoryNotFoundError } from "./story-service.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const T0 = NOW_MS;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function photoInput(
  overrides: Partial<CreateStoryInput> = {},
): CreateStoryInput {
  return {
    type: "photo",
    mediaKey: "stories/media-1/photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1_024,
    expiresAt: new Date(NOW_MS + 7 * DAY_MS).toISOString(),
    ...overrides,
  };
}

/** True when the service call resolves; false when it rejects (window rules). */
async function accepts(attempt: () => Promise<unknown>): Promise<boolean> {
  try {
    await attempt();
    return true;
  } catch {
    return false;
  }
}

/** Fresh migrated database + service + a seeded project. */
async function seed(): Promise<{
  db: DrizzleDb;
  projectId: string;
  service: ReturnType<typeof createStoryService>;
}> {
  const db = createTestDb();
  const service = createStoryService(db);
  const projectId = await seedProject(db);
  return { db, projectId, service };
}

describe("createStory (SL R3 local half)", () => {
  it("inserts an app-generated UUID v4 row with status 'published'", async () => {
    const { db, projectId, service } = await seed();
    const row = await service.createStory(projectId, photoInput(), {
      now: new Date(NOW_MS),
    });

    expect(row.id).toMatch(UUID_V4);
    expect(row.status).toBe("published");
    expect(row.projectId).toBe(projectId);
    expect(row.type).toBe("photo");
    expect(row.mediaKey).toBe("stories/media-1/photo.jpg");
    expect(row.mimeType).toBe("image/jpeg");
    expect(row.sizeBytes).toBe(1_024);
    expect(row.position).toBe(0);
    expect(row.posterKey).toBeNull();
    expect(row.durationSeconds).toBeNull();
    expect(row.createdAt).toEqual(new Date(NOW_MS));
    expect(row.expiresAt).toEqual(new Date(NOW_MS + 7 * DAY_MS));

    const [stored] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, row.id));
    expect(stored).toEqual(row);
  });

  it("accepts exactly 24 hours and exactly 30 days (SL R3 boundaries)", async () => {
    const { projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const at24 = await service.createStory(
      projectId,
      photoInput({ expiresAt: new Date(NOW_MS + 24 * HOUR_MS).toISOString() }),
      { now },
    );
    const at30 = await service.createStory(
      projectId,
      photoInput({ expiresAt: new Date(NOW_MS + 30 * DAY_MS).toISOString() }),
      { now },
    );
    expect(at24.status).toBe("published");
    expect(at30.status).toBe("published");
  });

  it("rejects a 12-hour expiry with a Zod error and inserts nothing", async () => {
    const { db, projectId, service } = await seed();
    const attempt = service.createStory(
      projectId,
      photoInput({ expiresAt: new Date(NOW_MS + 12 * HOUR_MS).toISOString() }),
      { now: new Date(NOW_MS) },
    );
    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(stories)).toHaveLength(0);
  });

  it("rejects a 45-day expiry with a Zod error and inserts nothing", async () => {
    const { db, projectId, service } = await seed();
    const attempt = service.createStory(
      projectId,
      photoInput({ expiresAt: new Date(NOW_MS + 45 * DAY_MS).toISOString() }),
      { now: new Date(NOW_MS) },
    );
    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(stories)).toHaveLength(0);
  });

  it("persists the optional poster and duration fields", async () => {
    const { projectId, service } = await seed();
    const row = await service.createStory(
      projectId,
      photoInput({
        type: "video",
        mimeType: "video/mp4",
        posterKey: "stories/media-1/poster.jpg",
        durationSeconds: 42,
      }),
      { now: new Date(NOW_MS) },
    );
    expect(row.type).toBe("video");
    expect(row.mimeType).toBe("video/mp4");
    expect(row.posterKey).toBe("stories/media-1/poster.jpg");
    expect(row.durationSeconds).toBe(42);
  });
});

describe("updateStory (SL R3 at edit time)", () => {
  it("edits expiresAt re-validating the window", async () => {
    const { projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const created = await service.createStory(projectId, photoInput(), { now });
    const updated = await service.updateStory(
      created.id,
      { expiresAt: new Date(NOW_MS + 10 * DAY_MS).toISOString() },
      { now },
    );
    expect(updated.expiresAt).toEqual(new Date(NOW_MS + 10 * DAY_MS));
  });

  it("rejects a too-short expiry patch and leaves the stored expiry unchanged", async () => {
    const { db, projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const created = await service.createStory(projectId, photoInput(), { now });
    const attempt = service.updateStory(
      created.id,
      { expiresAt: new Date(NOW_MS + 12 * HOUR_MS).toISOString() },
      { now },
    );
    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    const [stored] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, created.id));
    expect(stored?.expiresAt).toEqual(new Date(NOW_MS + 7 * DAY_MS));
  });

  it("rejects a too-long expiry patch and leaves the stored expiry unchanged", async () => {
    const { db, projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const created = await service.createStory(projectId, photoInput(), { now });
    const attempt = service.updateStory(
      created.id,
      { expiresAt: new Date(NOW_MS + 45 * DAY_MS).toISOString() },
      { now },
    );
    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    const [stored] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, created.id));
    expect(stored?.expiresAt).toEqual(new Date(NOW_MS + 7 * DAY_MS));
  });

  it("edits position", async () => {
    const { projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const created = await service.createStory(projectId, photoInput(), { now });
    const updated = await service.updateStory(
      created.id,
      { position: 3 },
      { now },
    );
    expect(updated.position).toBe(3);
  });

  it("rejects an empty patch", async () => {
    const { projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const created = await service.createStory(projectId, photoInput(), { now });
    await expect(
      service.updateStory(created.id, {}, { now }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("throws StoryNotFoundError for an unknown story id", async () => {
    const { service } = await seed();
    await expect(
      service.updateStory("missing-story", { position: 1 }),
    ).rejects.toBeInstanceOf(StoryNotFoundError);
  });

  it("enforces the identical window boundaries on create and edit (single shared refinement)", async () => {
    const { projectId, service } = await seed();
    const now = new Date(NOW_MS);
    const story = await service.createStory(projectId, photoInput(), { now });

    // Every boundary offset must produce the SAME outcome on both paths —
    // proof that create and edit reuse one window definition, not two rules.
    const cases: Array<[offsetMs: number, accepted: boolean]> = [
      [12 * HOUR_MS, false],
      [24 * HOUR_MS - 1, false],
      [24 * HOUR_MS, true],
      [24 * HOUR_MS + 1, true],
      [30 * DAY_MS - 1, true],
      [30 * DAY_MS, true],
      [30 * DAY_MS + 1, false],
      [45 * DAY_MS, false],
    ];
    for (const [offsetMs, accepted] of cases) {
      const expiresAt = new Date(NOW_MS + offsetMs).toISOString();
      const createOk = await accepts(() =>
        service.createStory(projectId, photoInput({ expiresAt }), { now }),
      );
      const editOk = await accepts(() =>
        service.updateStory(story.id, { expiresAt }, { now }),
      );
      expect(createOk, `create at +${offsetMs}ms`).toBe(accepted);
      expect(editOk, `edit at +${offsetMs}ms`).toBe(accepted);
    }
  });
});

describe("listStories (SL R5)", () => {
  it("orders same-position stories newest first", async () => {
    const { db, projectId, service } = await seed();
    await insertStory(db, projectId, { position: 0, createdAt: new Date(T0) });
    await insertStory(db, projectId, {
      position: 0,
      createdAt: new Date(T0 + 5_000),
    });
    const listed = await service.listStories(projectId);
    expect(listed.map((story: StoryRow) => story.createdAt.getTime())).toEqual([
      T0 + 5_000,
      T0,
    ]);
  });

  it("orders by position ascending regardless of chronology", async () => {
    const { db, projectId, service } = await seed();
    await insertStory(db, projectId, { position: 1, createdAt: new Date(T0) });
    await insertStory(db, projectId, {
      position: 0,
      createdAt: new Date(T0 + 9_000),
    });
    const listed = await service.listStories(projectId);
    expect(listed.map((story: StoryRow) => story.position)).toEqual([0, 1]);
  });

  it("sorts a mixed set: position asc, createdAt desc within equal positions", async () => {
    const { db, projectId, service } = await seed();
    await insertStory(db, projectId, { position: 2, createdAt: new Date(T0) });
    await insertStory(db, projectId, {
      position: 0,
      createdAt: new Date(T0 + 5_000),
    });
    await insertStory(db, projectId, { position: 1, createdAt: new Date(T0) });
    await insertStory(db, projectId, { position: 0, createdAt: new Date(T0) });
    const listed = await service.listStories(projectId);
    expect(
      listed.map((story: StoryRow) => [
        story.position,
        story.createdAt.getTime(),
      ]),
    ).toEqual([
      [0, T0 + 5_000],
      [0, T0],
      [1, T0],
      [2, T0],
    ]);
  });
});

describe("removeStory (SL R7)", () => {
  it("deletes the story and records media+poster keys in the same transaction", async () => {
    const { db, projectId, service } = await seed();
    const storyId = await insertStory(db, projectId, {
      posterKey: "stories/story-1/poster.jpg",
    });

    await service.removeStory(storyId, { now: new Date(NOW_MS) });

    const remaining = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId));
    expect(remaining).toHaveLength(0);
    const [pending] = await db.select().from(storyMediaPendingDeletion);
    expect(pending).toMatchObject({
      storyId,
      projectId,
      mediaKey: "stories/story-1/media.jpg",
      posterKey: "stories/story-1/poster.jpg",
    });
    expect(pending?.createdAt).toEqual(new Date(NOW_MS));
  });

  it("records only the media key when the story has no poster (triangulation)", async () => {
    const { db, projectId, service } = await seed();
    const storyId = await insertStory(db, projectId); // posterKey defaults to null

    await service.removeStory(storyId, { now: new Date(NOW_MS) });

    const [pending] = await db.select().from(storyMediaPendingDeletion);
    expect(pending?.mediaKey).toBe("stories/story-1/media.jpg");
    expect(pending?.posterKey).toBeNull();
  });

  it("rolls the removal back when the pending-deletion insert fails, leaving the story intact (triangulation)", async () => {
    const { db, projectId, service } = await seed();
    const storyId = await insertStory(db, projectId, {
      posterKey: "stories/story-1/poster.jpg",
    });
    // Force the pending-deletion insert to fail so the transaction must roll
    // its story delete back.
    await db.run(sql`DROP TABLE story_media_pending_deletion`);

    await expect(service.removeStory(storyId)).rejects.toThrow();

    const [survivor] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId));
    expect(survivor?.id).toBe(storyId);
    expect(survivor?.posterKey).toBe("stories/story-1/poster.jpg");
  });
});
