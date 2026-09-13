import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";

import { createDb, type DrizzleDb } from "./client.js";
import {
  projects,
  publishHistory,
  stories,
  storyMediaPendingDeletion,
} from "./schema.js";

type ProjectInsert = typeof projects.$inferInsert;
type StoryInsert = typeof stories.$inferInsert;
type HistoryInsert = typeof publishHistory.$inferInsert;
type PendingDeletionInsert = typeof storyMediaPendingDeletion.$inferInsert;

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/** Fresh in-memory SQLite database migrated to the latest forward-only schema. */
export function createTestDb(): DrizzleDb {
  const db = createDb();
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Fixed project-creation instant used by fixtures (2023-11-14T22:13:20Z). */
export const PROJECT_EPOCH_MS = 1_700_000_000_000;

/** Fixed "now" used by fixtures (2027-01-15T08:00:00.000Z). */
export const NOW_MS = 1_800_000_000_000;

/** Fixture factory: a complete project row per call (credentials are inert JSON). */
export function makeProject(
  overrides: Partial<ProjectInsert> = {},
): ProjectInsert {
  return {
    id: crypto.randomUUID(),
    name: "Panel Project",
    provider: "supabase",
    bucket: "stories-bucket",
    publicBaseUrl:
      "https://ref.supabase.co/storage/v1/object/public/stories-bucket",
    credentialsJson: JSON.stringify({ kind: "fixture" }),
    createdAt: new Date(PROJECT_EPOCH_MS),
    updatedAt: new Date(PROJECT_EPOCH_MS),
    ...overrides,
  };
}

/** Fixture factory: a complete story row under the given project per call. */
export function makeStory(
  projectId: string,
  overrides: Partial<StoryInsert> = {},
): StoryInsert {
  return {
    id: crypto.randomUUID(),
    projectId,
    type: "photo",
    mediaKey: "stories/story-1/media.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1_024,
    createdAt: new Date(PROJECT_EPOCH_MS),
    expiresAt: new Date(NOW_MS + 86_400_000),
    ...overrides,
  };
}

/** Fixture factory: a publish-history row under the given project per call. */
export function makeHistory(
  projectId: string,
  overrides: Partial<HistoryInsert> = {},
): HistoryInsert {
  return {
    id: crypto.randomUUID(),
    projectId,
    manifestVersion: 1,
    contentJson: '{"version":1,"projectId":"fixture","stories":[]}',
    storyIdsJson: "[]",
    result: "success",
    publishedAt: new Date(PROJECT_EPOCH_MS),
    ...overrides,
  };
}

/** Fixture factory: a pending media deletion row under the given project per call. */
export function makePendingDeletion(
  projectId: string,
  overrides: Partial<PendingDeletionInsert> = {},
): PendingDeletionInsert {
  return {
    id: crypto.randomUUID(),
    storyId: crypto.randomUUID(),
    projectId,
    mediaKey: "stories/story-1/media.jpg",
    posterKey: null,
    createdAt: new Date(PROJECT_EPOCH_MS),
    ...overrides,
  };
}

/** Inserts a fixture project and returns its generated id. */
export async function seedProject(
  db: DrizzleDb,
  overrides: Partial<ProjectInsert> = {},
): Promise<string> {
  const project = makeProject(overrides);
  await db.insert(projects).values(project);
  return project.id;
}

/** Inserts a fixture story under the given project and returns its generated id. */
export async function insertStory(
  db: DrizzleDb,
  projectId: string,
  overrides: Partial<StoryInsert> = {},
): Promise<string> {
  const story = makeStory(projectId, overrides);
  await db.insert(stories).values(story);
  return story.id;
}
