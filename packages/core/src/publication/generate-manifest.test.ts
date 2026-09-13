import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { manifestSchemaV1 } from "@stories/manifest-schema";

import type { DrizzleDb } from "../db/client.js";
import { projects, stories } from "../db/schema.js";
import {
  createTestDb,
  insertStory,
  NOW_MS,
  seedProject,
} from "../db/testing.js";
import type { ProjectRow } from "./publication-service.js";
import { generateManifest } from "./generate-manifest.js";

const HOUR_MS = 3_600_000;

/** Loads the seeded project row (generation consumes the row, not the id). */
async function loadProjectRow(
  db: DrizzleDb,
  projectId: string,
): Promise<ProjectRow> {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) throw new Error(`fixture project ${projectId} missing`);
  return row;
}

async function seededProject(
  db: DrizzleDb,
  overrides: Partial<ProjectRow> = {},
): Promise<ProjectRow> {
  return loadProjectRow(db, await seedProject(db, overrides));
}

describe("generateManifest", () => {
  it("excludes expired stories even when the status column is stale (sweep runs first)", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    const staleId = await insertStory(db, project.id, {
      mediaKey: "stories/stale/media.jpg",
      expiresAt: new Date(NOW_MS - 1_000),
    });
    const validId = await insertStory(db, project.id, {
      mediaKey: "stories/valid/media.jpg",
      expiresAt: new Date(NOW_MS + HOUR_MS),
    });

    const generated = await generateManifest(db, project, new Date(NOW_MS));

    expect(generated.storyIds).toEqual([validId]);
    const [stale] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, staleId));
    expect(stale?.status).toBe("expired");
  });

  it("orders stories by position ascending with createdAt descending as tiebreak", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    const second = await insertStory(db, project.id, {
      mediaKey: "stories/second/media.jpg",
      position: 0,
      createdAt: new Date(NOW_MS - 2 * HOUR_MS),
    });
    const first = await insertStory(db, project.id, {
      mediaKey: "stories/first/media.jpg",
      position: 0,
      createdAt: new Date(NOW_MS - 1 * HOUR_MS),
    });
    const third = await insertStory(db, project.id, {
      mediaKey: "stories/third/media.jpg",
      position: 1,
      createdAt: new Date(NOW_MS - 3 * HOUR_MS),
    });
    const fourth = await insertStory(db, project.id, {
      mediaKey: "stories/fourth/media.jpg",
      position: 2,
      createdAt: new Date(NOW_MS - 4 * HOUR_MS),
    });

    const generated = await generateManifest(db, project, new Date(NOW_MS));

    const objectOrder = generated.manifest.stories.map((story) => story.id);
    expect(objectOrder).toEqual([first, second, third, fourth]);
    const bytesOrder = JSON.parse(generated.json)["stories"].map(
      (story: { id: string }) => story.id,
    );
    expect(bytesOrder).toEqual([first, second, third, fourth]);
  });

  it("produces identical bytes for equal inputs (deterministic serialization)", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    await insertStory(db, project.id, { position: 1 });
    await insertStory(db, project.id, {
      mediaKey: "stories/story-2/media.jpg",
      position: 0,
    });

    const first = await generateManifest(db, project, new Date(NOW_MS));
    const second = await generateManifest(db, project, new Date(NOW_MS));

    expect(second.json).toBe(first.json);
    expect(second.bytes).toEqual(first.bytes);
  });

  it("builds media and poster URLs from the project publicBaseUrl", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    await insertStory(db, project.id, {
      mediaKey: "stories/story-1/media.jpg",
      posterKey: "stories/story-1/poster.jpg",
    });

    const generated = await generateManifest(db, project, new Date(NOW_MS));
    const story = generated.manifest.stories[0];
    expect(story?.mediaUrl).toBe(
      `${project.publicBaseUrl}/stories/story-1/media.jpg`,
    );
    expect(story?.posterUrl).toBe(
      `${project.publicBaseUrl}/stories/story-1/poster.jpg`,
    );
  });

  it("includes posterUrl only when the story has a poster key", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    await insertStory(db, project.id, {
      mediaKey: "stories/with-poster/media.jpg",
      posterKey: "stories/with-poster/poster.jpg",
    });
    await insertStory(db, project.id, {
      mediaKey: "stories/without-poster/media.jpg",
    });

    const generated = await generateManifest(db, project, new Date(NOW_MS));
    const parsed = manifestSchemaV1.parse(JSON.parse(generated.json));
    const [withPoster, withoutPoster] = parsed.stories;
    expect(withPoster?.posterUrl).toBeDefined();
    expect(Object.hasOwn(withoutPoster ?? {}, "posterUrl")).toBe(false);
  });

  it("accepts an empty project as a valid v1 manifest", async () => {
    const db = createTestDb();
    const project = await seededProject(db);

    const generated = await generateManifest(db, project, new Date(NOW_MS));
    const parsed = manifestSchemaV1.parse(JSON.parse(generated.json));

    expect(parsed.version).toBe(1);
    expect(parsed.projectId).toBe(project.id);
    expect(parsed.generatedAt).toBe(new Date(NOW_MS).toISOString());
    expect(parsed.stories).toEqual([]);
  });

  it("accepts a 100-story project as a valid v1 manifest", async () => {
    const db = createTestDb();
    const project = await seededProject(db);
    for (let index = 0; index < 100; index += 1) {
      await insertStory(db, project.id, {
        mediaKey: `stories/story-${index}/media.jpg`,
        position: index,
        expiresAt: new Date(NOW_MS + HOUR_MS),
      });
    }

    const generated = await generateManifest(db, project, new Date(NOW_MS));
    const parsed = manifestSchemaV1.parse(JSON.parse(generated.json));

    expect(parsed.stories).toHaveLength(100);
    expect(generated.storyIds).toHaveLength(100);
  });
});
