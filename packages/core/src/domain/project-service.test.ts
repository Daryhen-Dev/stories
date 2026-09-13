import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  projects,
  publishHistory,
  stories,
  storyMediaPendingDeletion,
} from "../db/schema.js";
import {
  createTestDb,
  makeHistory,
  makePendingDeletion,
  makeStory,
  seedProject,
} from "../db/testing.js";
import {
  createProjectService,
  ProjectServiceNotFoundError,
} from "./project-service.js";

const NOW = new Date("2027-01-15T08:00:00.000Z");
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function projectInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Marketing site",
    provider: "supabase" as const,
    bucket: "marketing-stories",
    publicBaseUrl:
      "https://ref.supabase.co/storage/v1/object/public/marketing-stories",
    credentialsJson: JSON.stringify({
      serviceRoleKey: "fixture-project-secret",
    }),
    ...overrides,
  };
}

describe("project service (PM R1 / D8)", () => {
  it("creates an app-generated UUID project and lists only non-secret DTO fields", async () => {
    const db = createTestDb();
    const service = createProjectService(db);

    const created = await service.createProject(projectInput(), { now: NOW });
    const listed = await service.listProjects();

    expect(created).toMatchObject({
      id: expect.stringMatching(UUID_V4),
      name: "Marketing site",
      provider: "supabase",
      bucket: "marketing-stories",
      manifestKey: "stories.json",
      publicBaseUrl:
        "https://ref.supabase.co/storage/v1/object/public/marketing-stories",
      lastConnectionCheck: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(created).not.toHaveProperty("credentialsJson");
    expect(listed).toEqual([created]);

    const [stored] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, created.id));
    expect(stored?.credentialsJson).toContain("fixture-project-secret");
  });

  it("updates mutable project configuration without exposing replacement credentials", async () => {
    const db = createTestDb();
    const service = createProjectService(db);
    const created = await service.createProject(projectInput(), { now: NOW });
    const updatedAt = new Date(NOW.getTime() + 1_000);

    const updated = await service.updateProject(
      created.id,
      {
        bucket: "replacement-bucket",
        manifestKey: "published/stories.json",
        credentialsJson: JSON.stringify({
          serviceRoleKey: "replacement-secret",
        }),
      },
      { now: updatedAt },
    );

    expect(updated).toMatchObject({
      id: created.id,
      bucket: "replacement-bucket",
      manifestKey: "published/stories.json",
      updatedAt: updatedAt.toISOString(),
    });
    expect(updated).not.toHaveProperty("credentialsJson");

    const loaded = await service.loadProject(created.id);
    expect(loaded.credentialsJson).toContain("replacement-secret");
  });

  it("deletes a project and cascades its stories, history, and pending deletions", async () => {
    const db = createTestDb();
    const service = createProjectService(db);
    const deletedProjectId = await seedProject(db, { name: "Delete me" });
    const retainedProjectId = await seedProject(db, { name: "Keep me" });
    await db
      .insert(stories)
      .values([makeStory(deletedProjectId), makeStory(retainedProjectId)]);
    await db
      .insert(publishHistory)
      .values([makeHistory(deletedProjectId), makeHistory(retainedProjectId)]);
    await db
      .insert(storyMediaPendingDeletion)
      .values([
        makePendingDeletion(deletedProjectId),
        makePendingDeletion(retainedProjectId),
      ]);

    await service.deleteProject(deletedProjectId);

    expect(
      await db.select().from(projects).where(eq(projects.id, deletedProjectId)),
    ).toEqual([]);
    for (const table of [stories, publishHistory, storyMediaPendingDeletion]) {
      expect(
        await db
          .select()
          .from(table)
          .where(eq(table.projectId, deletedProjectId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(table)
          .where(eq(table.projectId, retainedProjectId)),
      ).toHaveLength(1);
    }
  });

  it("rejects unknown project ids rather than treating them as empty records", async () => {
    const service = createProjectService(createTestDb());

    await expect(service.getProject("missing-project")).rejects.toBeInstanceOf(
      ProjectServiceNotFoundError,
    );
  });
});
