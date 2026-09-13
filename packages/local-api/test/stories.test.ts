import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestDb, seedProject } from "../../core/src/db/testing.js";
import {
  stories,
  storyMediaPendingDeletion,
} from "../../core/src/db/schema.js";
import {
  AdapterError,
  type ObjectExpectation,
  type StorageAdapter,
  type UploadInput,
  type VerifyResult,
} from "../../storage-adapters/src/index.js";
import { buildServer } from "../src/server.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MEDIA_CACHE_CONTROL_SECONDS = 31_536_000;
const PUBLIC_BASE_URL =
  "https://ref.supabase.co/storage/v1/object/public/stories-bucket";
const HOST_HEADERS = { host: "127.0.0.1:3789" } as const;

interface RecordedUpload {
  readonly body: Uint8Array;
  readonly cacheControlSeconds: number;
  readonly contentLength: number;
  readonly contentType: string;
  readonly key: string;
  readonly receivedUnreadWebStream: boolean;
}

interface RecordingAdapterOptions {
  readonly afterUpload?: (input: UploadInput) => void | Promise<void>;
  readonly failUpload?: (input: UploadInput) => AdapterError | undefined;
  readonly verifyFailure?: (key: string) => VerifyResult | undefined;
}

interface RecordingAdapter extends StorageAdapter {
  readonly uploads: readonly RecordedUpload[];
  readonly readBack: typeof fetch;
}

async function readStream(
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    length += next.value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Adapter double that consumes route streams, like a provider SDK would. */
function createRecordingAdapter(
  options: RecordingAdapterOptions = {},
): RecordingAdapter {
  const stored = new Map<string, RecordedUpload>();
  const uploads: RecordedUpload[] = [];

  const adapter: StorageAdapter = {
    provider: "supabase",
    async upload(input) {
      const failure = options.failUpload?.(input);
      if (failure !== undefined) throw failure;
      const receivedUnreadWebStream =
        !(input.body instanceof Uint8Array) && !input.body.locked;
      const body =
        input.body instanceof Uint8Array
          ? input.body
          : await readStream(input.body);
      const recorded: RecordedUpload = {
        body,
        cacheControlSeconds: input.cacheControlSeconds,
        contentLength: input.contentLength,
        contentType: input.contentType,
        key: input.key,
        receivedUnreadWebStream,
      };
      uploads.push(recorded);
      stored.set(input.key, recorded);
      await options.afterUpload?.(input);
      return { etag: `"${input.key}:${body.byteLength}"` };
    },
    async verify(key, expected: ObjectExpectation = {}) {
      const configuredFailure = options.verifyFailure?.(key);
      if (configuredFailure !== undefined) return configuredFailure;
      const object = stored.get(key);
      if (object === undefined) {
        return {
          ok: false,
          code: "OBJECT_NOT_FOUND",
          detail: `object ${key} was not uploaded`,
        };
      }
      if (
        expected.size !== undefined &&
        expected.size !== object.body.byteLength
      ) {
        return {
          ok: false,
          code: "VERIFY_MISMATCH",
          detail: `expected ${expected.size} bytes but stored ${object.body.byteLength}`,
        };
      }
      if (
        expected.contentType !== undefined &&
        expected.contentType !== object.contentType
      ) {
        return {
          ok: false,
          code: "VERIFY_MISMATCH",
          detail: `expected ${expected.contentType} but stored ${object.contentType}`,
        };
      }
      return {
        ok: true,
        size: object.body.byteLength,
        contentType: object.contentType,
      };
    },
    publicUrl(key) {
      return `${PUBLIC_BASE_URL}/${key}`;
    },
    async delete() {},
    async checkPublicRead() {
      return { ok: true, httpStatus: 200 };
    },
  };

  const readBack = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const key = url.startsWith(`${PUBLIC_BASE_URL}/`)
      ? url.slice(PUBLIC_BASE_URL.length + 1)
      : "";
    const object = stored.get(key);
    return object === undefined
      ? new Response("not found", { status: 404 })
      : new Response(new Uint8Array(object.body), {
          status: 200,
          headers: { "content-type": object.contentType },
        });
  }) as typeof fetch;

  return { ...adapter, uploads, readBack };
}

interface MultipartFile {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
  readonly name: string;
}

function multipart(
  fields: readonly (readonly [name: string, value: string])[],
  files: readonly MultipartFile[],
): { readonly body: Buffer; readonly contentType: string } {
  const boundary = "stories-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      Buffer.from(file.body),
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function futureExpiry(days = 7): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function storyFields(overrides: Record<string, string> = {}) {
  const fields = {
    type: "photo",
    expiresAt: futureExpiry(),
    position: "0",
    mediaSize: "5",
    ...overrides,
  };
  return Object.entries(fields) as readonly (readonly [string, string])[];
}

async function submitStory(
  app: FastifyInstance,
  projectId: string,
  fields: readonly (readonly [name: string, value: string])[],
  files: readonly MultipartFile[],
) {
  const form = multipart(fields, files);
  return app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/stories`,
    headers: { ...HOST_HEADERS, "content-type": form.contentType },
    payload: form.body,
  });
}

interface AppHarness {
  readonly adapter: RecordingAdapter;
  readonly app: FastifyInstance;
  readonly db: ReturnType<typeof createTestDb>;
  readonly projectId: string;
}

const apps: FastifyInstance[] = [];

async function createApp(
  options: RecordingAdapterOptions = {},
): Promise<AppHarness> {
  const db = createTestDb();
  const adapter = createRecordingAdapter(options);
  const projectId = await seedProject(db, {
    bucket: "stories-bucket",
    publicBaseUrl: PUBLIC_BASE_URL,
  });
  const app = buildServer({
    db,
    makeAdapter: () => adapter,
    publicationFetcher: adapter.readBack,
  });
  apps.push(app);
  return { adapter, app, db, projectId };
}

async function countStories(harness: AppHarness): Promise<number> {
  return (await harness.db.select().from(stories)).length;
}

async function withUploadLimit<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env.STORIES_MAX_UPLOAD_MB;
  if (value === undefined) delete process.env.STORIES_MAX_UPLOAD_MB;
  else process.env.STORIES_MAX_UPLOAD_MB = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.STORIES_MAX_UPLOAD_MB;
    else process.env.STORIES_MAX_UPLOAD_MB = previous;
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

describe("story routes (PR 10B streaming creation, edit, and removal)", () => {
  it("streams and verifies a photo, inserts local truth, and auto-publishes it", async () => {
    const harness = await createApp();
    const media = new TextEncoder().encode("photo");

    const response = await submitStory(
      harness.app,
      harness.projectId,
      storyFields(),
      [
        {
          name: "media",
          filename: "launch.jpg",
          contentType: "image/jpeg",
          body: media,
        },
      ],
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      story: {
        id: expect.any(String),
        projectId: harness.projectId,
        status: "published",
        sizeBytes: media.byteLength,
      },
      publication: {
        status: "published",
        manifestUrl: `${PUBLIC_BASE_URL}/stories.json`,
      },
    });
    const story = response.json<{ story: { id: string; mediaKey: string } }>()
      .story;
    const mediaUpload = harness.adapter.uploads.find(
      (upload) => upload.key === story.mediaKey,
    );
    expect(mediaUpload).toMatchObject({
      body: media,
      contentLength: media.byteLength,
      contentType: "image/jpeg",
      cacheControlSeconds: MEDIA_CACHE_CONTROL_SECONDS,
      receivedUnreadWebStream: true,
    });
    expect(story.mediaKey).toBe(`stories/${story.id}/media.jpg`);
    expect(harness.adapter.uploads.map((upload) => upload.key)).toEqual([
      story.mediaKey,
      "stories.json",
    ]);
    const stored = (await harness.db.select().from(stories)).find(
      (candidate) => candidate.id === story.id,
    );
    expect(stored).toMatchObject({ id: story.id, status: "published" });
  });

  it("keeps the 24-hour expiry boundary valid through media upload and insertion", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2030-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const harness = await createApp({
      afterUpload: (input) => {
        if (input.key.endsWith("/media.jpg")) vi.setSystemTime(now + 1);
      },
    });

    const response = await submitStory(
      harness.app,
      harness.projectId,
      storyFields({ expiresAt: new Date(now + DAY_MS).toISOString() }),
      [
        {
          name: "media",
          filename: "boundary.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );

    expect(response.statusCode).toBe(201);
    expect(await countStories(harness)).toBe(1);
  });

  it("rejects an expiry one millisecond short before starting an upload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2030-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const harness = await createApp();

    const response = await submitStory(
      harness.app,
      harness.projectId,
      storyFields({ expiresAt: new Date(now + DAY_MS - 1).toISOString() }),
      [
        {
          name: "media",
          filename: "too-short.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "INVALID_STORY_METADATA" });
    expect(harness.adapter.uploads).toHaveLength(0);
    expect(await countStories(harness)).toBe(0);
  });

  it("rejects invalid expiry metadata and file-first input before an adapter upload or file-stream bridge", async () => {
    const harness = await createApp();
    const media: MultipartFile = {
      name: "media",
      filename: "invalid.jpg",
      contentType: "image/jpeg",
      body: new TextEncoder().encode("photo"),
    };

    const invalidExpiry = await submitStory(
      harness.app,
      harness.projectId,
      storyFields({
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1_000).toISOString(),
      }),
      [media],
    );
    const fileFirst = await submitStory(
      harness.app,
      harness.projectId,
      [],
      [media],
    );

    expect(invalidExpiry.statusCode).toBe(400);
    expect(invalidExpiry.json()).toMatchObject({
      error: "INVALID_STORY_METADATA",
    });
    expect(fileFirst.statusCode).toBe(400);
    expect(fileFirst.json()).toMatchObject({ error: "INVALID_STORY_METADATA" });
    expect(harness.adapter.uploads).toHaveLength(0);
    expect(await countStories(harness)).toBe(0);
  });

  it("maps declared and streamed configured-limit breaches to 413, while ordinary length mismatches stay typed client errors", async () => {
    await withUploadLimit("0.0009765625", async () => {
      const declaredLimitHarness = await createApp();
      const declaredLimit = await submitStory(
        declaredLimitHarness.app,
        declaredLimitHarness.projectId,
        storyFields({ mediaSize: "1025" }),
        [
          {
            name: "media",
            filename: "large.jpg",
            contentType: "image/jpeg",
            body: new Uint8Array(1_025),
          },
        ],
      );
      expect(declaredLimit.statusCode).toBe(413);
      expect(declaredLimit.json()).toMatchObject({
        error: "DECLARED_SIZE_EXCEEDS_LIMIT",
      });
      expect(declaredLimitHarness.adapter.uploads).toHaveLength(0);
      expect(await countStories(declaredLimitHarness)).toBe(0);

      const actualLimitHarness = await createApp();
      const actualLimit = await submitStory(
        actualLimitHarness.app,
        actualLimitHarness.projectId,
        storyFields({ mediaSize: "1024" }),
        [
          {
            name: "media",
            filename: "actual-large.jpg",
            contentType: "image/jpeg",
            body: new Uint8Array(1_025),
          },
        ],
      );
      expect(actualLimit.statusCode).toBe(413);
      expect(actualLimit.json()).toMatchObject({
        error: "ACTUAL_SIZE_EXCEEDS_LIMIT",
      });
      expect(await countStories(actualLimitHarness)).toBe(0);

      const mismatchHarness = await createApp();
      const mismatch = await submitStory(
        mismatchHarness.app,
        mismatchHarness.projectId,
        storyFields({ mediaSize: "4" }),
        [
          {
            name: "media",
            filename: "mismatch.jpg",
            contentType: "image/jpeg",
            body: new Uint8Array(3),
          },
        ],
      );
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json()).toMatchObject({ error: "UNDERFLOW" });
      expect(await countStories(mismatchHarness)).toBe(0);
    });
  });

  it("rejects an invalid configured MiB limit safely before uploading or inserting", async () => {
    await withUploadLimit("not-a-number", async () => {
      const harness = await createApp();
      const response = await submitStory(
        harness.app,
        harness.projectId,
        storyFields(),
        [
          {
            name: "media",
            filename: "invalid-config.jpg",
            contentType: "image/jpeg",
            body: new TextEncoder().encode("photo"),
          },
        ],
      );

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: "INVALID_CONFIGURATION" });
      expect(harness.adapter.uploads).toHaveLength(0);
      expect(await countStories(harness)).toBe(0);
    });
  });

  it("accepts a video duration and a JPEG poster after scalar metadata", async () => {
    const harness = await createApp();
    const video = new Uint8Array([1, 2, 3, 4]);
    const poster = new Uint8Array([5, 6, 7]);
    const response = await submitStory(
      harness.app,
      harness.projectId,
      [
        ["type", "video"],
        ["expiresAt", futureExpiry()],
        ["position", "3"],
        ["mediaSize", String(video.byteLength)],
        ["durationSeconds", "42"],
        ["posterSize", String(poster.byteLength)],
      ],
      [
        {
          name: "media",
          filename: "clip.mp4",
          contentType: "video/mp4",
          body: video,
        },
        {
          name: "poster",
          filename: "poster.jpg",
          contentType: "image/jpeg",
          body: poster,
        },
      ],
    );

    expect(response.statusCode).toBe(201);
    const story = response.json<{
      story: { durationSeconds: number; posterKey: string; type: string };
    }>().story;
    expect(story).toMatchObject({ type: "video", durationSeconds: 42 });
    expect(story.posterKey).toMatch(/\/poster\.jpg$/);
    const posterUpload = harness.adapter.uploads.find(
      (upload) => upload.key === story.posterKey,
    );
    expect(posterUpload).toMatchObject({
      body: poster,
      contentLength: poster.byteLength,
      contentType: "image/jpeg",
      cacheControlSeconds: MEDIA_CACHE_CONTROL_SECONDS,
    });
  });

  it("preserves typed adapter upload and verification failures without inserting a row", async () => {
    const uploadHarness = await createApp({
      failUpload: (input) =>
        input.key.endsWith("/media.jpg")
          ? new AdapterError(
              "NETWORK_ERROR",
              "supabase",
              "provider connection dropped",
            )
          : undefined,
    });
    const uploadFailure = await submitStory(
      uploadHarness.app,
      uploadHarness.projectId,
      storyFields(),
      [
        {
          name: "media",
          filename: "network.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );
    expect(uploadFailure.statusCode).toBe(502);
    expect(uploadFailure.json()).toMatchObject({
      error: "NETWORK_ERROR",
      detail: "provider connection dropped",
    });
    expect(await countStories(uploadHarness)).toBe(0);

    const verifyHarness = await createApp({
      verifyFailure: (key) =>
        key.endsWith("/media.jpg")
          ? {
              ok: false,
              code: "VERIFY_MISMATCH",
              detail: "provider stored the wrong content type",
            }
          : undefined,
    });
    const verificationFailure = await submitStory(
      verifyHarness.app,
      verifyHarness.projectId,
      storyFields(),
      [
        {
          name: "media",
          filename: "verify.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );
    expect(verificationFailure.statusCode).toBe(502);
    expect(verificationFailure.json()).toMatchObject({
      error: "VERIFY_MISMATCH",
      detail: "provider stored the wrong content type",
    });
    expect(await countStories(verifyHarness)).toBe(0);
  });

  it("retains the inserted story and reports a distinct publication failure", async () => {
    const harness = await createApp({
      failUpload: (input) =>
        input.key === "stories.json"
          ? new AdapterError(
              "UPLOAD_FAILED",
              "supabase",
              "manifest upload failed after local insert",
            )
          : undefined,
    });
    const response = await submitStory(
      harness.app,
      harness.projectId,
      storyFields(),
      [
        {
          name: "media",
          filename: "publish-failure.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      story: { id: expect.any(String), status: "published" },
      publication: {
        status: "failed",
        error: {
          code: "UPLOAD_FAILED",
          detail: "manifest upload failed after local insert",
        },
      },
    });
    expect(await countStories(harness)).toBe(1);
  });

  it("revalidates edits, records pending deletion, and maps unknown story ids to 404", async () => {
    const harness = await createApp();
    const created = await submitStory(
      harness.app,
      harness.projectId,
      storyFields(),
      [
        {
          name: "media",
          filename: "edit.jpg",
          contentType: "image/jpeg",
          body: new TextEncoder().encode("photo"),
        },
      ],
    );
    const id = created.json<{ story: { id: string } }>().story.id;

    const updated = await harness.app.inject({
      method: "PATCH",
      url: `/api/stories/${id}`,
      headers: HOST_HEADERS,
      payload: { position: 2 },
    });
    const invalidUpdate = await harness.app.inject({
      method: "PATCH",
      url: `/api/stories/${id}`,
      headers: HOST_HEADERS,
      payload: {
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1_000).toISOString(),
      },
    });
    const removed = await harness.app.inject({
      method: "DELETE",
      url: `/api/stories/${id}`,
      headers: HOST_HEADERS,
    });
    const missingPatch = await harness.app.inject({
      method: "PATCH",
      url: "/api/stories/unknown-story",
      headers: HOST_HEADERS,
      payload: { position: 2 },
    });
    const missingDelete = await harness.app.inject({
      method: "DELETE",
      url: "/api/stories/unknown-story",
      headers: HOST_HEADERS,
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id, position: 2 });
    expect(invalidUpdate.statusCode).toBe(400);
    expect(invalidUpdate.json()).toMatchObject({
      error: "INVALID_STORY_UPDATE",
    });
    expect(removed.statusCode).toBe(204);
    expect(
      (await harness.db.select().from(stories)).filter(
        (story) => story.id === id,
      ),
    ).toEqual([]);
    expect(
      (await harness.db.select().from(storyMediaPendingDeletion)).filter(
        (pending) => pending.storyId === id,
      ),
    ).toHaveLength(1);
    expect(missingPatch.statusCode).toBe(404);
    expect(missingPatch.json()).toMatchObject({ error: "STORY_NOT_FOUND" });
    expect(missingDelete.statusCode).toBe(404);
    expect(missingDelete.json()).toMatchObject({ error: "STORY_NOT_FOUND" });
  });
});
