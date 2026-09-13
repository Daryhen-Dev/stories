import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DrizzleDb } from "../db/client.js";
import { stories } from "../db/schema.js";
import {
  createTestDb,
  insertStory,
  NOW_MS,
  seedProject,
} from "../db/testing.js";
import { expireStories } from "./expire-stories.js";

async function statusOf(
  db: DrizzleDb,
  storyId: string,
): Promise<string | undefined> {
  const [row] = await db.select().from(stories).where(eq(stories.id, storyId));
  return row?.status;
}

describe("expireStories", () => {
  it("transitions published stories whose expiresAt is past to expired", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const past = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS - 1),
    });
    const future = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS + 1),
    });

    const changed = await expireStories(db, new Date(NOW_MS));

    expect(changed).toBe(1);
    expect(await statusOf(db, past)).toBe("expired");
    expect(await statusOf(db, future)).toBe("published");
  });

  it("transitions at boundary equality (expiresAt exactly now)", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const atNow = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS),
    });

    const changed = await expireStories(db, new Date(NOW_MS));

    expect(changed).toBe(1);
    expect(await statusOf(db, atNow)).toBe("expired");
  });

  it("leaves future stories untouched", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const hourAhead = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS + 3_600_000),
    });
    const dayAhead = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS + 86_400_000),
    });
    const monthAhead = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS + 2_592_000_000),
    });

    const changed = await expireStories(db, new Date(NOW_MS));

    expect(changed).toBe(0);
    expect(await statusOf(db, hourAhead)).toBe("published");
    expect(await statusOf(db, dayAhead)).toBe("published");
    expect(await statusOf(db, monthAhead)).toBe("published");
  });

  it("is idempotent: a re-run transitions zero rows", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const past = await insertStory(db, projectId, {
      expiresAt: new Date(NOW_MS - 60_000),
    });

    expect(await expireStories(db, new Date(NOW_MS))).toBe(1);
    expect(await statusOf(db, past)).toBe("expired");

    expect(await expireStories(db, new Date(NOW_MS))).toBe(0);
    expect(await statusOf(db, past)).toBe("expired");
  });
});
