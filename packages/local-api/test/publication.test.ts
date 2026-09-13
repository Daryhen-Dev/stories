import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createTestDb, seedProject } from "../../core/src/db/testing.js";
import { publishHistory } from "../../core/src/db/schema.js";
import {
  AdapterError,
  type ObjectExpectation,
  type StorageAdapter,
  type UploadInput,
  type VerifyResult,
} from "../../storage-adapters/src/index.js";
import { buildServer } from "../src/server.js";

const HOST_HEADERS = { host: "127.0.0.1:3789" } as const;
const PUBLIC_BASE_URL =
  "https://ref.supabase.co/storage/v1/object/public/stories-bucket";
const PROJECT_ID_MISSING = "missing-project";

interface PublicationAdapter extends StorageAdapter {
  failManifestUploads: boolean;
  failUnexpectedly: boolean;
  bytes(key: string): Uint8Array | undefined;
  replace(key: string, bytes: Uint8Array): void;
  readonly readBack: typeof fetch;
}

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
}

function createPublicationAdapter(): PublicationAdapter {
  const stored = new Map<string, StoredObject>();
  const adapter: PublicationAdapter = {
    provider: "supabase",
    failManifestUploads: false,
    failUnexpectedly: false,
    async upload(input: UploadInput) {
      if (input.key === "stories.json" && adapter.failUnexpectedly) {
        throw new Error("unexpected publication failure");
      }
      if (input.key === "stories.json" && adapter.failManifestUploads) {
        throw new AdapterError(
          "UPLOAD_FAILED",
          "supabase",
          "provider rejected the manifest upload",
        );
      }
      const body =
        input.body instanceof Uint8Array ? input.body : await read(input.body);
      stored.set(input.key, { body, contentType: input.contentType });
      return {};
    },
    async verify(
      key: string,
      expected: ObjectExpectation = {},
    ): Promise<VerifyResult> {
      const object = stored.get(key);
      if (object === undefined) {
        return {
          ok: false,
          code: "OBJECT_NOT_FOUND",
          detail: `missing ${key}`,
        };
      }
      if (
        expected.size !== undefined &&
        object.body.byteLength !== expected.size
      ) {
        return {
          ok: false,
          code: "VERIFY_MISMATCH",
          detail: "unexpected size",
        };
      }
      if (
        expected.contentType !== undefined &&
        object.contentType !== expected.contentType
      ) {
        return {
          ok: false,
          code: "VERIFY_MISMATCH",
          detail: "unexpected content type",
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
    bytes(key) {
      return stored.get(key)?.body;
    },
    replace(key, bytes) {
      stored.set(key, { body: bytes, contentType: "application/json" });
    },
    readBack: (async (input: string | URL | Request) => {
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
    }) as typeof fetch,
  };
  return adapter;
}

async function read(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

interface AppHarness {
  readonly adapter: PublicationAdapter;
  readonly app: FastifyInstance;
  readonly db: ReturnType<typeof createTestDb>;
  readonly projectId: string;
}

const apps: FastifyInstance[] = [];

async function createApp(): Promise<AppHarness> {
  const db = createTestDb();
  const adapter = createPublicationAdapter();
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

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("publication routes (PR 11 MP R4/R5)", () => {
  it("publishes through the core service and returns the provider manifest URL", async () => {
    const harness = await createApp();

    const response = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "published",
      manifestUrl: `${PUBLIC_BASE_URL}/stories.json`,
    });
    expect(harness.adapter.bytes("stories.json")).toBeInstanceOf(Uint8Array);
  });

  it("uses the existing internal-error shape for unexpected publication failures", async () => {
    const harness = await createApp();
    harness.adapter.failUnexpectedly = true;

    const response = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "The local API could not complete the publication request.",
    });
  });

  it("surfaces a publish adapter failure with its typed code and detail", async () => {
    const harness = await createApp();
    harness.adapter.failManifestUploads = true;

    const response = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "UPLOAD_FAILED",
      detail: "provider rejected the manifest upload",
    });
  });

  it("rolls back by republishing the latest successful manifest bytes verbatim", async () => {
    const harness = await createApp();
    const published = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });
    const expectedBytes = harness.adapter.bytes("stories.json");
    if (expectedBytes === undefined)
      throw new Error("expected published manifest");
    harness.adapter.replace("stories.json", new TextEncoder().encode("stale"));

    const response = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/rollback`,
      headers: HOST_HEADERS,
    });

    expect(published.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "published",
      manifestUrl: `${PUBLIC_BASE_URL}/stories.json`,
    });
    expect(harness.adapter.bytes("stories.json")).toEqual(expectedBytes);
  });

  it("returns a stable conflict when no successful publication exists to roll back", async () => {
    const harness = await createApp();

    const response = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/rollback`,
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "NO_SUCCESSFUL_PUBLICATION",
      detail: `project ${harness.projectId} has no successful publication to roll back to`,
    });
  });

  it("records a failed publish in history without changing a prior manifest", async () => {
    const harness = await createApp();
    const initialPublish = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });
    const priorBytes = harness.adapter.bytes("stories.json");
    if (priorBytes === undefined)
      throw new Error("expected published manifest");
    harness.adapter.failManifestUploads = true;

    const failedPublish = await harness.app.inject({
      method: "POST",
      url: `/api/projects/${harness.projectId}/publish`,
      headers: HOST_HEADERS,
    });
    const history = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${harness.projectId}/publish-history`,
      headers: HOST_HEADERS,
    });

    expect(initialPublish.statusCode).toBe(200);
    expect(failedPublish.statusCode).toBe(502);
    expect(harness.adapter.bytes("stories.json")).toEqual(priorBytes);
    expect(history.json()).toMatchObject([
      {
        result: "failed",
        errorDetail: "UPLOAD_FAILED: provider rejected the manifest upload",
      },
      { result: "success", errorDetail: null },
    ]);
  });

  it("lists the newest 50 result records without stored manifest bytes", async () => {
    const harness = await createApp();
    const records = Array.from({ length: 55 }, (_, index) => ({
      id: `history-${index}`,
      projectId: harness.projectId,
      manifestVersion: 1,
      contentJson: `stored-manifest-${index}`,
      storyIdsJson: `["story-${index}"]`,
      result: index % 2 === 0 ? "success" : "failed",
      errorDetail: index % 2 === 0 ? null : `UPLOAD_FAILED: failure-${index}`,
      publishedAt: new Date(1_800_000_000_000 + index),
    }));
    await harness.db.insert(publishHistory).values(records);

    const response = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${harness.projectId}/publish-history`,
      headers: HOST_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    const history = response.json<
      Array<{
        readonly errorDetail: string | null;
        readonly id: string;
        readonly publishedAt: string;
        readonly result: string;
      }>
    >();
    expect(history).toHaveLength(50);
    expect(history[0]).toMatchObject({
      id: "history-54",
      result: "success",
      publishedAt: new Date(1_800_000_000_054).toISOString(),
    });
    expect(history[49]).toMatchObject({
      id: "history-5",
      result: "failed",
      errorDetail: "UPLOAD_FAILED: failure-5",
    });
    expect(JSON.stringify(history)).not.toContain("stored-manifest-");
    expect(history[0]).not.toHaveProperty("contentJson");
    expect(history[0]).not.toHaveProperty("storyIdsJson");
  });

  it("maps an unknown project to 404 for every publication endpoint", async () => {
    const harness = await createApp();
    const responses = await Promise.all([
      harness.app.inject({
        method: "POST",
        url: `/api/projects/${PROJECT_ID_MISSING}/publish`,
        headers: HOST_HEADERS,
      }),
      harness.app.inject({
        method: "POST",
        url: `/api/projects/${PROJECT_ID_MISSING}/rollback`,
        headers: HOST_HEADERS,
      }),
      harness.app.inject({
        method: "GET",
        url: `/api/projects/${PROJECT_ID_MISSING}/publish-history`,
        headers: HOST_HEADERS,
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "PROJECT_NOT_FOUND",
        message: "Project not found.",
      });
    }
  });
});
