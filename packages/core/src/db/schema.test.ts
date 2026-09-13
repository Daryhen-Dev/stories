import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  projects,
  publishHistory,
  stories,
  storyMediaPendingDeletion,
} from "./schema.js";
import {
  createTestDb,
  makeHistory,
  makePendingDeletion,
  makeProject,
  makeStory,
  NOW_MS,
  PROJECT_EPOCH_MS,
  seedProject,
} from "./testing.js";

describe("projects table", () => {
  it("stores the design columns and round-trips epoch-ms timestamps", async () => {
    const db = createTestDb();
    const project = makeProject();
    await db.insert(projects).values(project);

    const [row] = await db.select().from(projects);
    expect(row).toMatchObject({
      id: project.id,
      name: "Panel Project",
      provider: "supabase",
      bucket: "stories-bucket",
      manifestKey: "stories.json", // design default
      publicBaseUrl: project.publicBaseUrl,
      credentialsJson: project.credentialsJson, // D8: storage column only; never mapped into DTOs
      lastConnectionCheck: null,
    });
    expect(row?.createdAt.getTime()).toBe(PROJECT_EPOCH_MS);
    expect(row?.updatedAt.getTime()).toBe(PROJECT_EPOCH_MS);

    // Storage contract: the raw column holds the integer epoch-ms value (never
    // an ISO string); Drizzle's timestamp_ms mode maps it back into a Date.
    const [raw] = await db
      .select({ rawCreatedAt: sql<number>`created_at` })
      .from(projects);
    expect(raw?.rawCreatedAt).toBe(PROJECT_EPOCH_MS);
  });
});

describe("stories table", () => {
  it("defaults status to 'published' and position to 0, storing epoch-ms instants", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    const story = makeStory(projectId);
    await db.insert(stories).values(story);

    const [row] = await db.select().from(stories);
    expect(row).toMatchObject({
      id: story.id,
      projectId,
      type: "photo",
      mediaKey: story.mediaKey,
      posterKey: null,
      mimeType: "image/jpeg",
      sizeBytes: 1_024,
      durationSeconds: null,
      position: 0,
      status: "published", // design default status (SL R4)
      cleanedAt: null,
      lastCleanupError: null,
    });
    expect(row?.createdAt.getTime()).toBe(PROJECT_EPOCH_MS);
    expect(row?.expiresAt.getTime()).toBe(NOW_MS + 86_400_000);

    const [raw] = await db
      .select({ rawExpiresAt: sql<number>`expires_at` })
      .from(stories);
    expect(raw?.rawExpiresAt).toBe(NOW_MS + 86_400_000);
  });
});

describe("project delete cascade", () => {
  it("deletes the project's stories, publish history, and pending-deletion rows", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);
    await db
      .insert(stories)
      .values([makeStory(projectId), makeStory(projectId)]);
    await db
      .insert(publishHistory)
      .values([makeHistory(projectId), makeHistory(projectId)]);
    await db
      .insert(storyMediaPendingDeletion)
      .values([makePendingDeletion(projectId), makePendingDeletion(projectId)]);

    await db.delete(projects).where(eq(projects.id, projectId));

    expect(await db.select().from(stories)).toHaveLength(0);
    expect(await db.select().from(publishHistory)).toHaveLength(0);
    expect(await db.select().from(storyMediaPendingDeletion)).toHaveLength(0);
  });

  it("cascade removal is isolated: sibling projects keep every row kind", async () => {
    const db = createTestDb();
    const kept = await seedProject(db, { name: "Kept Project" });
    const removed = await seedProject(db, { name: "Removed Project" });
    await db.insert(stories).values([makeStory(kept), makeStory(removed)]);
    await db
      .insert(publishHistory)
      .values([makeHistory(kept), makeHistory(removed)]);
    await db
      .insert(storyMediaPendingDeletion)
      .values([makePendingDeletion(kept), makePendingDeletion(removed)]);

    await db.delete(projects).where(eq(projects.id, removed));

    for (const table of [stories, publishHistory, storyMediaPendingDeletion]) {
      expect(
        await db.select().from(table).where(eq(table.projectId, removed)),
      ).toHaveLength(0);
      expect(
        await db.select().from(table).where(eq(table.projectId, kept)),
      ).toHaveLength(1);
    }
  });
});

describe("constraints and id generation", () => {
  it("enforces unique project names", async () => {
    const db = createTestDb();
    await db.insert(projects).values(makeProject({ name: "Same Name" }));

    await expect(
      db.insert(projects).values(makeProject({ name: "Same Name" })),
    ).rejects.toThrowError(/UNIQUE constraint failed: projects\.name/);
  });

  it("ids are app-side UUID v4 (no database-side default)", async () => {
    const db = createTestDb();
    const projectId = await seedProject(db);

    const [row] = await db.select().from(projects);
    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(row?.id).toBe(projectId); // the app-generated id is stored verbatim

    // Prove there is no database-side id default: strip the app-side id; the
    // column is NOT NULL without a default, so the insert must fail.
    const withoutId = { ...makeProject() };
    delete (withoutId as { id?: string }).id;
    await expect(db.insert(projects).values(withoutId)).rejects.toThrowError(
      /NOT NULL constraint failed: projects\.id/,
    );
  });
});
