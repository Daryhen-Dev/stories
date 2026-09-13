import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MANIFEST_VERSION, manifestSchemaV1 } from "@stories/manifest-schema";
import {
  AdapterError,
  createFakeStorageAdapter,
  type FakeStorageAdapter,
  type StorageAdapter,
  type UploadInput,
} from "@stories/storage-adapters";

import type { DrizzleDb } from "../db/client.js";
import { projects, publishHistory, stories } from "../db/schema.js";
import type { StoryRow } from "../domain/story-service.js";
import {
  createTestDb,
  insertStory,
  NOW_MS,
  seedProject,
} from "../db/testing.js";
import { generateManifest } from "./generate-manifest.js";
import type { PendingMediaLoader, ProjectRow } from "./publication-service.js";
import {
  createPublicationService,
  ProjectNotFoundError,
} from "./publication-service.js";
import { NoSuccessfulPublicationError } from "./rollback.js";

type StoryInsert = typeof stories.$inferInsert;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3_600_000;
const MEDIA_TTL_SECONDS = 31_536_000;
const MEDIA_BYTES = new Uint8Array(64).fill(7);
const POSTER_BYTES = new Uint8Array(16).fill(9);

type StoryOverrides = Partial<StoryInsert>;

interface RecordedUploads {
  readonly uploaded: Map<string, Uint8Array>;
  readonly uploadKeys: string[];
}

/**
 * Test double decorator: delegates to the fake adapter while recording the
 * exact bytes of every upload, so read-back fetches can serve the real
 * manifest object without any network.
 */
function recordingAdapter(inner: FakeStorageAdapter): {
  adapter: StorageAdapter;
  recorded: RecordedUploads;
} {
  const uploaded = new Map<string, Uint8Array>();
  const uploadKeys: string[] = [];
  const adapter: StorageAdapter = {
    provider: inner.provider,
    upload: async (input: UploadInput) => {
      const result = await inner.upload(input);
      uploadKeys.push(input.key);
      uploaded.set(input.key, input.body as Uint8Array);
      return result;
    },
    verify: (key, expected) => inner.verify(key, expected),
    publicUrl: (key) => inner.publicUrl(key),
    delete: (key) => inner.delete(key),
    checkPublicRead: () => inner.checkPublicRead(),
  };
  return { adapter, recorded: { uploaded, uploadKeys } };
}

/** Injectable step-5 read-back fetcher: serves recorded uploads as responses. */
function fetcherServing(
  recorded: RecordedUploads,
  trackedUrls: string[],
  publicBaseUrl: string,
): typeof fetch {
  return (async (input: string | URL): Promise<Response> => {
    const url = String(input);
    trackedUrls.push(url);
    const prefix = `${publicBaseUrl.replace(/\/+$/, "")}/`;
    const key = url.startsWith(prefix) ? url.slice(prefix.length) : null;
    const bytes = key === null ? undefined : recorded.uploaded.get(key);
    if (bytes === undefined) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as unknown as typeof fetch;
}

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

interface Harness {
  readonly db: DrizzleDb;
  readonly fake: FakeStorageAdapter;
  readonly adapter: StorageAdapter;
  readonly recorded: RecordedUploads;
  readonly readBackUrls: string[];
  readonly service: ReturnType<typeof createPublicationService>;
  readonly projectId: string;
  readonly project: ProjectRow;
}

let storySequence = 0;

async function setupHarness(
  overrides: {
    readonly makeAdapter?: (
      project: ProjectRow,
    ) => Promise<StorageAdapter> | StorageAdapter;
    readonly fetcher?: typeof fetch;
    readonly loadPendingMedia?: PendingMediaLoader;
    readonly projectOverrides?: Partial<ProjectRow>;
  } = {},
): Promise<Harness> {
  const db = createTestDb();
  const projectId = await seedProject(db, overrides.projectOverrides);
  const project = await loadProjectRow(db, projectId);
  const fake = createFakeStorageAdapter({
    bucket: project.bucket,
    publicBaseUrl: project.publicBaseUrl,
  });
  const { adapter, recorded } = recordingAdapter(fake);
  const readBackUrls: string[] = [];
  const service = createPublicationService({
    db,
    makeAdapter: overrides.makeAdapter ?? (() => adapter),
    fetcher:
      overrides.fetcher ??
      fetcherServing(recorded, readBackUrls, project.publicBaseUrl),
    ...(overrides.loadPendingMedia === undefined
      ? {}
      : { loadPendingMedia: overrides.loadPendingMedia }),
  });
  return {
    db,
    fake,
    adapter,
    recorded,
    readBackUrls,
    service,
    projectId,
    project,
  };
}

/**
 * Seeds a story row and performs its creation-time media upload into the fake
 * adapter (the normal PR 10 flow: upload + verify before auto-publish).
 */
async function seedUploadedStory(
  harness: Harness,
  overrides: StoryOverrides = {},
): Promise<string> {
  const mediaKey =
    overrides.mediaKey ?? `stories/story-${(storySequence += 1)}/media.jpg`;
  const posterKey = overrides.posterKey ?? null;
  const id = await insertStory(harness.db, harness.projectId, {
    mediaKey,
    posterKey,
    mimeType: "image/jpeg",
    sizeBytes: MEDIA_BYTES.byteLength,
    expiresAt: new Date(NOW_MS + DAY_MS),
    ...overrides,
  });
  await harness.fake.upload({
    key: mediaKey,
    body: MEDIA_BYTES,
    contentType: "image/jpeg",
    contentLength: MEDIA_BYTES.byteLength,
    cacheControlSeconds: MEDIA_TTL_SECONDS,
  });
  if (posterKey !== null) {
    await harness.fake.upload({
      key: posterKey,
      body: POSTER_BYTES,
      contentType: "image/jpeg",
      contentLength: POSTER_BYTES.byteLength,
      cacheControlSeconds: MEDIA_TTL_SECONDS,
    });
  }
  return id;
}

function uploadedManifestBytes(harness: Harness): Uint8Array {
  const bytes = harness.recorded.uploaded.get(harness.project.manifestKey);
  if (bytes === undefined) {
    throw new Error("expected the manifest object to have been uploaded");
  }
  return bytes;
}

async function historyRows(harness: Harness) {
  return harness.db
    .select()
    .from(publishHistory)
    .where(eq(publishHistory.projectId, harness.projectId))
    .orderBy(asc(publishHistory.publishedAt));
}

describe("createPublicationService", () => {
  it("publishes the manifest with a 60 s TTL, verifies it by read-back, and records the exact bytes as success", async () => {
    const harness = await setupHarness();
    const storyId = await seedUploadedStory(harness, { position: 0 });

    const outcome = await harness.service.publish(harness.projectId, {
      now: new Date(NOW_MS),
    });

    expect(outcome.manifestUrl).toBe(
      `${harness.project.publicBaseUrl}/${harness.project.manifestKey}`,
    );
    expect(outcome.storyIds).toEqual([storyId]);
    // MP R7 happy path: media was uploaded at creation, so the single manifest
    // PUT is the only write this flow performs.
    expect(harness.recorded.uploadKeys).toEqual([harness.project.manifestKey]);
    expect(
      harness.fake.stored.get(harness.project.manifestKey)?.cacheControlSeconds,
    ).toBe(60);
    expect(harness.readBackUrls).toEqual([
      `${harness.project.publicBaseUrl}/${harness.project.manifestKey}`,
    ]);
    const rows = await historyRows(harness);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.result).toBe("success");
    expect(row?.errorDetail).toBeNull();
    expect(row?.manifestVersion).toBe(MANIFEST_VERSION);
    expect(row?.contentJson).toBe(
      new TextDecoder().decode(uploadedManifestBytes(harness)),
    );
    const parsed = manifestSchemaV1.parse(JSON.parse(row?.contentJson ?? ""));
    expect(parsed.stories.map((story) => story.id)).toEqual([storyId]);
    expect(JSON.parse(row?.storyIdsJson ?? "")).toEqual([storyId]);
  });

  it("aborts with a typed AdapterError and leaves the previous manifest bytes unchanged when media verification fails", async () => {
    const harness = await setupHarness();
    await seedUploadedStory(harness, { position: 0 });
    await harness.service.publish(harness.projectId, { now: new Date(NOW_MS) });
    const previousBytes = uploadedManifestBytes(harness);

    const brokenMediaKey = "stories/story-broken/media.jpg";
    await seedUploadedStory(harness, { position: 1, mediaKey: brokenMediaKey });

    const innerVerify = harness.adapter.verify.bind(harness.adapter);
    const failingAdapter: StorageAdapter = {
      ...harness.adapter,
      verify: async (key, expected) =>
        key === brokenMediaKey
          ? {
              ok: false,
              code: "VERIFY_MISMATCH",
              detail: "stored object drifted",
            }
          : innerVerify(key, expected),
    };
    const failingService = createPublicationService({
      db: harness.db,
      makeAdapter: () => failingAdapter,
      fetcher: fetcherServing(
        harness.recorded,
        harness.readBackUrls,
        harness.project.publicBaseUrl,
      ),
    });

    const outcome = failingService.publish(harness.projectId, {
      now: new Date(NOW_MS + MINUTE_MS),
    });
    await expect(outcome).rejects.toBeInstanceOf(AdapterError);
    await expect(outcome).rejects.toMatchObject({
      code: "VERIFY_MISMATCH",
      provider: "supabase",
    });
    expect(uploadedManifestBytes(harness)).toEqual(previousBytes);
    const rows = await historyRows(harness);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.result).toBe("success");
    expect(rows[1]?.result).toBe("failed");
    expect(rows[1]?.errorDetail).toContain("VERIFY_MISMATCH");
  });

  it("treats a read-back mismatch as an unverified failure, with previous bytes recoverable from history", async () => {
    const harness = await setupHarness();
    await seedUploadedStory(harness, { position: 0 });
    await harness.service.publish(harness.projectId, { now: new Date(NOW_MS) });
    const goodJson = new TextDecoder().decode(uploadedManifestBytes(harness));

    const tampered: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          version: MANIFEST_VERSION,
          projectId: harness.projectId,
          generatedAt: new Date(NOW_MS).toISOString(),
          stories: [],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const tamperedService = createPublicationService({
      db: harness.db,
      makeAdapter: () => harness.adapter,
      fetcher: tampered,
    });

    await seedUploadedStory(harness, { position: 1 });
    const outcome = tamperedService.publish(harness.projectId, {
      now: new Date(NOW_MS + MINUTE_MS),
    });
    await expect(outcome).rejects.toBeInstanceOf(AdapterError);
    await expect(outcome).rejects.toMatchObject({ code: "VERIFY_MISMATCH" });

    const rows = await historyRows(harness);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.result).toBe("failed");
    const successRows = rows.filter((row) => row.result === "success");
    expect(successRows.map((row) => row.contentJson)).toEqual([goodJson]);
  });

  it("prunes publish history to the last 50 rows per project", async () => {
    const harness = await setupHarness();
    await seedUploadedStory(harness, {
      expiresAt: new Date(NOW_MS + 30 * DAY_MS),
    });

    for (let index = 0; index < 55; index += 1) {
      await harness.service.publish(harness.projectId, {
        now: new Date(NOW_MS + index * MINUTE_MS),
      });
    }

    const rows = await historyRows(harness);
    expect(rows).toHaveLength(50);
    expect(rows[0]?.publishedAt).toEqual(new Date(NOW_MS + 5 * MINUTE_MS));
    const newest = rows[rows.length - 1];
    expect(newest?.publishedAt).toEqual(new Date(NOW_MS + 54 * MINUTE_MS));
    expect(newest?.contentJson).toBe(
      new TextDecoder().decode(uploadedManifestBytes(harness)),
    );
  });

  it("rolls back to the latest successful bytes verbatim — restored expired stories self-expire by data", async () => {
    const harness = await setupHarness();
    const expiringId = await seedUploadedStory(harness, {
      position: 0,
      expiresAt: new Date(NOW_MS + 2 * MINUTE_MS),
    });
    await harness.service.publish(harness.projectId, { now: new Date(NOW_MS) });
    const firstBytes = uploadedManifestBytes(harness);

    const lateId = await seedUploadedStory(harness, {
      position: 1,
      mediaKey: "stories/story-late/media.jpg",
    });
    // Second successful publication while the first story is still valid:
    // it becomes the latest `result='success'` history row.
    await harness.service.publish(harness.projectId, {
      now: new Date(NOW_MS + 1 * MINUTE_MS),
    });
    const secondBytes = uploadedManifestBytes(harness);
    expect(secondBytes).not.toEqual(firstBytes);

    // By now the first story's expiresAt has passed (NOW + 2 min).
    const outcome = await harness.service.rollback(harness.projectId, {
      now: new Date(NOW_MS + 4 * MINUTE_MS),
    });

    expect(outcome.manifestUrl).toBe(
      `${harness.project.publicBaseUrl}/${harness.project.manifestKey}`,
    );
    expect(uploadedManifestBytes(harness)).toEqual(secondBytes);
    const restored = manifestSchemaV1.parse(
      JSON.parse(new TextDecoder().decode(uploadedManifestBytes(harness))),
    );
    // Restored verbatim, INCLUDING the story whose expiry has since passed.
    expect(restored.stories.map((story) => story.id)).toEqual([
      expiringId,
      lateId,
    ]);

    const rows = await historyRows(harness);
    expect(rows).toHaveLength(3);
    expect(rows[2]?.result).toBe("success");
    expect(rows[2]?.contentJson).toBe(new TextDecoder().decode(secondBytes));

    // Self-expire by data: the next generation excludes the expired story.
    const regenerated = await generateManifest(
      harness.db,
      harness.project,
      new Date(NOW_MS + 5 * MINUTE_MS),
    );
    expect(regenerated.storyIds).toEqual([lateId]);
  });

  it("throws a typed error when there is no successful publication to roll back to", async () => {
    const harness = await setupHarness();
    await expect(
      harness.service.rollback(harness.projectId, { now: new Date(NOW_MS) }),
    ).rejects.toBeInstanceOf(NoSuccessfulPublicationError);
  });

  it("throws ProjectNotFoundError for an unknown project", async () => {
    const harness = await setupHarness();
    const unknownId = crypto.randomUUID();
    await expect(
      harness.service.publish(unknownId, { now: new Date(NOW_MS) }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(
      harness.service.rollback(unknownId, { now: new Date(NOW_MS) }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("keeps the previous manifest serving when the manifest upload itself fails at step 4", async () => {
    const harness = await setupHarness();
    await seedUploadedStory(harness, { position: 0 });
    await harness.service.publish(harness.projectId, { now: new Date(NOW_MS) });
    const previousBytes = uploadedManifestBytes(harness);

    await seedUploadedStory(harness, { position: 1 });
    const failingAdapter: StorageAdapter = {
      ...harness.adapter,
      upload: async () => {
        throw new AdapterError(
          "UPLOAD_FAILED",
          "supabase",
          "provider outage during the manifest PUT",
        );
      },
    };
    const failingService = createPublicationService({
      db: harness.db,
      makeAdapter: () => failingAdapter,
      fetcher: fetcherServing(
        harness.recorded,
        harness.readBackUrls,
        harness.project.publicBaseUrl,
      ),
    });

    const outcome = failingService.publish(harness.projectId, {
      now: new Date(NOW_MS + MINUTE_MS),
    });
    await expect(outcome).rejects.toBeInstanceOf(AdapterError);
    await expect(outcome).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
    // A single-object PUT is atomic per object: the previous bytes keep serving.
    expect(uploadedManifestBytes(harness)).toEqual(previousBytes);
    const rows = await historyRows(harness);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.result).toBe("failed");
    expect(rows[1]?.errorDetail).toContain("UPLOAD_FAILED");
  });

  it("accepts crash-window orphan media and never references it in the manifest (D5)", async () => {
    const harness = await setupHarness();
    const keptId = await seedUploadedStory(harness, { position: 0 });
    // Uploaded bytes with no DB row: a crash between upload and story insert.
    await harness.fake.upload({
      key: "stories/orphan/media.jpg",
      body: POSTER_BYTES,
      contentType: "image/jpeg",
      contentLength: POSTER_BYTES.byteLength,
      cacheControlSeconds: MEDIA_TTL_SECONDS,
    });

    const outcome = await harness.service.publish(harness.projectId, {
      now: new Date(NOW_MS),
    });

    expect(outcome.storyIds).toEqual([keptId]);
    const servedJson = new TextDecoder().decode(uploadedManifestBytes(harness));
    expect(servedJson).not.toContain("orphan");
  });

  it("uploads pending media and poster with cacheControlSeconds 31536000 (triangulation)", async () => {
    const loadedKinds: Array<[string, "media" | "poster"]> = [];
    const harness = await setupHarness({
      loadPendingMedia: (story: StoryRow, kind: "media" | "poster") => {
        loadedKinds.push([
          kind === "media" ? story.mediaKey : (story.posterKey ?? ""),
          kind,
        ]);
        return kind === "media" ? MEDIA_BYTES : POSTER_BYTES;
      },
    });
    const mediaKey = "stories/story-pending/media.jpg";
    const posterKey = "stories/story-pending/poster.jpg";
    // No creation-time upload happened: both objects are pending.
    const storyId = await insertStory(harness.db, harness.projectId, {
      mediaKey,
      posterKey,
      mimeType: "image/jpeg",
      sizeBytes: MEDIA_BYTES.byteLength,
      expiresAt: new Date(NOW_MS + DAY_MS),
    });

    const outcome = await harness.service.publish(harness.projectId, {
      now: new Date(NOW_MS),
    });

    expect(outcome.storyIds).toEqual([storyId]);
    expect(harness.fake.stored.get(mediaKey)?.cacheControlSeconds).toBe(
      MEDIA_TTL_SECONDS,
    );
    expect(harness.fake.stored.get(posterKey)?.cacheControlSeconds).toBe(
      MEDIA_TTL_SECONDS,
    );
    expect(loadedKinds).toEqual([
      [mediaKey, "media"],
      [posterKey, "poster"],
    ]);
    const parsed = manifestSchemaV1.parse(
      JSON.parse(new TextDecoder().decode(uploadedManifestBytes(harness))),
    );
    expect(parsed.stories[0]?.posterUrl).toBe(
      `${harness.project.publicBaseUrl}/${posterKey}`,
    );
  });
});
