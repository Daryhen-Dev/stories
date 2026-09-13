import { afterEach, describe, expect, it, vi } from "vitest";

import { runStorageAdapterContractSuite } from "./contract-suite.js";
import { AdapterError } from "./errors.js";
import {
  createSupabaseStorageAdapter,
  type SupabaseStorageBucketClient,
  type SupabaseStorageErrorLike,
} from "./supabase-adapter.js";
import { textBytes, uploadInput } from "./testing.js";

const CONFIG = {
  bucket: "stories-bucket",
  publicBaseUrl:
    "https://ref.supabase.co/storage/v1/object/public/stories-bucket",
  supabaseUrl: "https://ref.supabase.co",
  serviceKey: "service-role-key-test-only",
} as const;

interface StubObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly cacheControl: string;
}

const createStore = (): Map<string, StubObject> => new Map();

/**
 * Minimal in-memory emulation of the SDK bucket-client surface the adapter
 * uses (MSA R2 RED: provider failures are injected as SDK-shaped errors, the
 * adapter must normalize them; no @supabase import appears in this test).
 */
const createStubBucketClient = (
  store: Map<string, StubObject>,
  overrides: Partial<SupabaseStorageBucketClient> = {},
): SupabaseStorageBucketClient => {
  const base: SupabaseStorageBucketClient = {
    async upload(path, body, options) {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array();
      store.set(path, {
        bytes,
        contentType: options.contentType,
        cacheControl: options.cacheControl,
      });
      return { data: { path }, error: null };
    },
    async download(path) {
      const stored = store.get(path);
      if (!stored) {
        return {
          data: null,
          error: { message: "Object not found", statusCode: "404" },
        };
      }
      return {
        data: { size: stored.bytes.byteLength, type: stored.contentType },
        error: null,
      };
    },
    async remove(paths) {
      for (const path of paths) store.delete(path);
      return { data: paths.map((name) => ({ name })), error: null };
    },
    async list(prefix) {
      const folders = new Set<string>();
      const files: { name: string; id: string }[] = [];
      for (const key of store.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) files.push({ name: rest, id: `id-${rest}` });
        else folders.add(rest.slice(0, slash));
      }
      return {
        data: [
          ...[...folders].map((folder) => ({ name: folder, id: null })),
          ...files,
        ],
        error: null,
      };
    },
  };
  return { ...base, ...overrides };
};

/** Serves the stub store through the public URL space the adapter probes. */
const stubPublicFetch = (store: Map<string, StubObject>): void => {
  const basePath = new URL(CONFIG.publicBaseUrl).pathname;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const key = decodeURIComponent(url.pathname).slice(basePath.length + 1);
    const stored = store.get(key);
    if (!stored) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(stored.bytes), {
      status: 200,
      headers: { "content-type": stored.contentType },
    });
  });
};

const raisedFrom = async (
  operation: () => Promise<unknown>,
): Promise<AdapterError> => {
  let raised: unknown;
  try {
    await operation();
  } catch (error) {
    raised = error;
  }
  if (!(raised instanceof AdapterError)) {
    throw new Error(`expected AdapterError, found ${String(raised)}`);
  }
  return raised;
};

const manifestUpload = (): { key: string; body: Uint8Array } => ({
  key: "stories.json",
  body: textBytes('{"version":1}'),
});

describe("supabaseStorageAdapter failure mapping (MSA R2/R5 — stubbed SDK client)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a 401 upload rejection to AUTH_FAILED with remediation and the raw error as cause", async () => {
    const raw: SupabaseStorageErrorLike = {
      message: "Invalid API key",
      statusCode: "401",
    };
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        upload: async () => ({ data: null, error: raw }),
      }),
    );
    const upload = manifestUpload();
    const raised = await raisedFrom(() =>
      adapter.upload(
        uploadInput(upload.key, upload.body, "application/json", 60),
      ),
    );
    expect(raised.code).toBe("AUTH_FAILED");
    expect(raised.remediation).toBeTruthy();
    expect(raised.cause).toBe(raw);
  });

  it("maps a missing-bucket upload rejection to BUCKET_NOT_FOUND with remediation", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        upload: async () => ({
          data: null,
          error: { message: "Bucket not found", statusCode: "404" },
        }),
      }),
    );
    const upload = manifestUpload();
    const raised = await raisedFrom(() =>
      adapter.upload(
        uploadInput(upload.key, upload.body, "application/json", 60),
      ),
    );
    expect(raised.code).toBe("BUCKET_NOT_FOUND");
    expect(raised.remediation).toBeTruthy();
  });

  it("maps a private-bucket read to BUCKET_NOT_PUBLIC with remediation and HTTP status", async () => {
    const store = createStore();
    store.set("stories.json", {
      bytes: textBytes("{}"),
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
    vi.stubGlobal("fetch", async () => new Response(null, { status: 403 }));
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(store),
    );
    const check = await adapter.checkPublicRead();
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error("expected a failed public-read check");
    expect(check.code).toBe("BUCKET_NOT_PUBLIC");
    expect(check.httpStatus).toBe(403);
    expect(check.remediation).toBeTruthy();
  });

  it("maps a generic upload fault to UPLOAD_FAILED with remediation", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        upload: async () => ({
          data: null,
          error: { message: "Internal server error", statusCode: "500" },
        }),
      }),
    );
    const upload = manifestUpload();
    const raised = await raisedFrom(() =>
      adapter.upload(
        uploadInput(upload.key, upload.body, "application/json", 60),
      ),
    );
    expect(raised.code).toBe("UPLOAD_FAILED");
    expect(raised.remediation).toBeTruthy();
  });

  it("reports OBJECT_NOT_FOUND when verifying a missing object", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore()),
    );
    const result = await adapter.verify("stories/missing.mp4");
    expect(result).toEqual({
      ok: false,
      code: "OBJECT_NOT_FOUND",
      detail: expect.any(String),
    });
  });

  it("reports VERIFY_MISMATCH naming the mismatched property for size and content type", async () => {
    const store = createStore();
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(store),
    );
    const media = textBytes("0123456789");
    await adapter.upload(
      uploadInput("stories/s1/media.mp4", media, "video/mp4", 31536000),
    );
    const sizeResult = await adapter.verify("stories/s1/media.mp4", {
      size: media.byteLength + 1,
    });
    expect(sizeResult).toEqual({
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: expect.stringMatching(/\bsize\b/),
    });
    const typeResult = await adapter.verify("stories/s1/media.mp4", {
      contentType: "text/plain",
    });
    expect(typeResult).toEqual({
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: expect.stringMatching(/\bcontent.?type\b/i),
    });
  });

  it("maps a delete fault to DELETE_FAILED with remediation", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        remove: async () => ({
          data: null,
          error: { message: "Internal server error", statusCode: "500" },
        }),
      }),
    );
    const raised = await raisedFrom(() => adapter.delete("stories.json"));
    expect(raised.code).toBe("DELETE_FAILED");
    expect(raised.remediation).toBeTruthy();
  });

  it("maps a network fault to NETWORK_ERROR with remediation", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        upload: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    );
    const upload = manifestUpload();
    const raised = await raisedFrom(() =>
      adapter.upload(
        uploadInput(upload.key, upload.body, "application/json", 60),
      ),
    );
    expect(raised.code).toBe("NETWORK_ERROR");
    expect(raised.remediation).toBeTruthy();
  });
});

describe("supabaseStorageAdapter contract behaviors (stub-backed, unit-mapped)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the provider-agnostic contract suite against the in-memory-backed stub client (MSA R4)", async () => {
    const store = createStore();
    stubPublicFetch(store);
    const report = await runStorageAdapterContractSuite(() =>
      createSupabaseStorageAdapter(CONFIG, createStubBucketClient(store)),
    );
    expect(report.passed).toBe(5);
    expect(report.skipped).toBe(3);
    for (const entry of report.cases) {
      if (entry.status === "skipped") {
        expect(entry.name).toMatch(
          /cacheControlSeconds|non-public bucket|bad credentials/,
        );
      }
    }
  });

  it("persists cacheControlSeconds as SDK cacheControl metadata using the D9 header forms", async () => {
    const store = createStore();
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(store),
    );
    const upload = manifestUpload();
    await adapter.upload(
      uploadInput(upload.key, upload.body, "application/json", 60),
    );
    expect(store.get("stories.json")?.cacheControl).toBe("public, max-age=60");
    const media = textBytes("m");
    await adapter.upload(
      uploadInput("stories/s1/media.mp4", media, "video/mp4", 31536000),
    );
    expect(store.get("stories/s1/media.mp4")?.cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("publicUrl builds the deterministic provider public URL from publicBaseUrl", () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore()),
    );
    expect(adapter.publicUrl("stories/s1/media.mp4")).toBe(
      "https://ref.supabase.co/storage/v1/object/public/stories-bucket/stories/s1/media.mp4",
    );
    expect(adapter.publicUrl("stories/s1/media.mp4")).toBe(
      adapter.publicUrl("stories/s1/media.mp4"),
    );
  });
});

describe("supabaseStorageAdapter UNKNOWN fallback (triangulation, MSA R2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces UNKNOWN for an unmapped public-read HTTP status, with remediation", async () => {
    const store = createStore();
    store.set("stories.json", {
      bytes: textBytes("{}"),
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(store),
    );
    const check = await adapter.checkPublicRead();
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error("expected a failed public-read check");
    expect(check.code).toBe("UNKNOWN");
    expect(check.httpStatus).toBe(500);
    expect(check.remediation).toBeTruthy();
  });

  it("surfaces UNKNOWN (never the raw SDK error) for an unmapped bucket-listing error", async () => {
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(createStore(), {
        list: async () => ({
          data: null,
          error: { message: "Quantum flux", statusCode: "418" },
        }),
      }),
    );
    const raised = await raisedFrom(() => adapter.checkPublicRead());
    expect(raised.code).toBe("UNKNOWN");
    expect(raised.remediation).toBeTruthy();
    expect(raised.cause).toMatchObject({ message: "Quantum flux" });
  });

  it("treats a 404 on a known-existing object as BUCKET_NOT_PUBLIC (spike-informed probe)", async () => {
    const store = createStore();
    store.set("stories.json", {
      bytes: textBytes("{}"),
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const adapter = createSupabaseStorageAdapter(
      CONFIG,
      createStubBucketClient(store),
    );
    const check = await adapter.checkPublicRead();
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error("expected a failed public-read check");
    expect(check.code).toBe("BUCKET_NOT_PUBLIC");
    expect(check.remediation).toBeTruthy();
  });
});

const envValue = (name: string): string => {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value;
};

const liveConfigured = [
  process.env.STORIES_E2E_SUPABASE_URL,
  process.env.STORIES_E2E_SUPABASE_SERVICE_KEY,
  process.env.STORIES_E2E_SUPABASE_BUCKET,
  process.env.STORIES_E2E_SUPABASE_PUBLIC_BASE_URL,
].every((value) => typeof value === "string" && value.length > 0);

describe.skipIf(!liveConfigured)(
  "Supabase live contract profile (MSA R4 — env-gated STORIES_E2E_SUPABASE_*)",
  () => {
    it("passes the core contract cases against the live project, skipping only introspection/variant cases", async () => {
      const report = await runStorageAdapterContractSuite(() =>
        createSupabaseStorageAdapter({
          bucket: envValue("STORIES_E2E_SUPABASE_BUCKET"),
          publicBaseUrl: envValue("STORIES_E2E_SUPABASE_PUBLIC_BASE_URL"),
          supabaseUrl: envValue("STORIES_E2E_SUPABASE_URL"),
          serviceKey: envValue("STORIES_E2E_SUPABASE_SERVICE_KEY"),
        }),
      );
      expect(report.passed).toBeGreaterThanOrEqual(5);
      for (const entry of report.cases) {
        if (entry.status === "skipped") {
          expect(entry.name).toMatch(
            /cacheControlSeconds|non-public bucket|bad credentials/,
          );
        }
      }
    }, 120_000);
  },
);
