import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestDb } from "../../core/src/db/testing.js";
import type { ProjectRow } from "../../core/src/domain/project-service.js";
import { createFakeStorageAdapter } from "../../storage-adapters/src/fake-adapter.js";
import type { StorageAdapter } from "../../storage-adapters/src/types.js";
import { buildServer } from "../src/server.js";

const FIXTURE_SECRET = "fixture-project-credential-never-returned";

interface ProjectPayload {
  readonly name: string;
  readonly provider: "supabase" | "insforge";
  readonly bucket: string;
  readonly publicBaseUrl: string;
  readonly manifestKey?: string;
  readonly credentials: Record<string, string>;
}

function projectPayload(
  overrides: Partial<ProjectPayload> = {},
): ProjectPayload {
  return {
    name: "Marketing site",
    provider: "supabase",
    bucket: "marketing-stories",
    publicBaseUrl:
      "https://ref.supabase.co/storage/v1/object/public/marketing-stories",
    credentials: { serviceRoleKey: FIXTURE_SECRET },
    ...overrides,
  };
}

function requestHeaders(): Record<string, string> {
  return { host: "127.0.0.1:3789" };
}

function adapterWithCheck(
  checkPublicRead: StorageAdapter["checkPublicRead"],
): StorageAdapter {
  return {
    ...createFakeStorageAdapter({
      bucket: "marketing-stories",
      publicBaseUrl:
        "https://ref.supabase.co/storage/v1/object/public/marketing-stories",
    }),
    checkPublicRead,
  };
}

let app: FastifyInstance | undefined;

function createApp(
  makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter,
): FastifyInstance {
  app = buildServer({ db: createTestDb(), makeAdapter });
  return app;
}

async function createProject(
  app: FastifyInstance,
): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: requestHeaders(),
    payload: projectPayload(),
  });
  expect(response.statusCode).toBe(201);
  return response.json<Record<string, unknown>>();
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("project routes (PM R1 / R2)", () => {
  it("creates, lists, updates, and deletes redacted projects over HTTP", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );
    const created = await createProject(app);
    const id = created.id as string;

    expect(created).toMatchObject({
      id: expect.any(String),
      name: "Marketing site",
      provider: "supabase",
      bucket: "marketing-stories",
      manifestKey: "stories.json",
    });
    expect(JSON.stringify(created)).not.toContain(FIXTURE_SECRET);
    expect(created).not.toHaveProperty("credentialsJson");
    expect(created).not.toHaveProperty("credentials");

    const listed = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: requestHeaders(),
    });
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}`,
      headers: requestHeaders(),
      payload: {
        bucket: "updated-bucket",
        credentials: { apiKey: "new-secret" },
      },
    });
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/projects/${id}`,
      headers: requestHeaders(),
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([created]);
    expect(JSON.stringify(listed.json())).not.toContain(FIXTURE_SECRET);
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id, bucket: "updated-bucket" });
    expect(JSON.stringify(updated.json())).not.toContain("new-secret");
    expect(removed.statusCode).toBe(204);

    const missing = await app.inject({
      method: "GET",
      url: `/api/projects/${id}`,
      headers: requestHeaders(),
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  });

  it("never leaks a fixture credential through any GET response, including a mis-mapped DTO", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );
    app.get("/api/mis-mapped-project", () => ({
      visible: "safe",
      credentialsJson: FIXTURE_SECRET,
    }));
    const created = await createProject(app);

    const responses = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/health",
        headers: requestHeaders(),
      }),
      app.inject({
        method: "GET",
        url: "/api/projects",
        headers: requestHeaders(),
      }),
      app.inject({
        method: "GET",
        url: `/api/projects/${created.id as string}`,
        headers: requestHeaders(),
      }),
      app.inject({
        method: "GET",
        url: "/api/mis-mapped-project",
        headers: requestHeaders(),
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200,
    ]);
    for (const response of responses) {
      expect(response.body).not.toContain(FIXTURE_SECRET);
    }
    expect(responses[3]?.json()).toEqual({
      visible: "safe",
      credentialsJson: "[REDACTED]",
    });
  });

  it("returns a typed 400 for invalid payloads and 404 for an unknown project id", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );

    const invalid = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: requestHeaders(),
      payload: { name: "missing required project fields" },
    });
    const missing = await app.inject({
      method: "PATCH",
      url: "/api/projects/missing-project",
      headers: requestHeaders(),
      payload: { bucket: "unused" },
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: "INVALID_PAYLOAD" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  });
});

describe("two-context connection checks (PM R3 / R4)", () => {
  it("constructs a project-aware adapter, persists a passing Node probe, and marks browser probes pending", async () => {
    const makeAdapter = vi.fn(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );
    const app = createApp(makeAdapter);
    const project = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });
    const loaded = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id as string}`,
      headers: requestHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      nodeGet: { ok: true, httpStatus: 200 },
      browserPending: true,
      diagnosis: { code: "connected" },
    });
    expect(makeAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id, bucket: "marketing-stories" }),
    );
    expect(loaded.json()).toMatchObject({
      id: project.id,
      lastConnectionCheck: response.json(),
    });
  });

  it("diagnoses bad credentials as auth and never cors", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({
        ok: false,
        code: "AUTH_FAILED",
        remediation: "replace the key",
      })),
    );
    const project = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      nodeGet: { ok: false, code: "AUTH_FAILED" },
      browserPending: true,
      diagnosis: { code: "auth" },
    });
    expect(JSON.stringify(response.json())).not.toContain("cors");
  });

  it("overwrites a prior Node result when a later connection check runs", async () => {
    const probe = vi
      .fn<StorageAdapter["checkPublicRead"]>()
      .mockResolvedValueOnce({
        ok: false,
        code: "NETWORK_ERROR",
        remediation: "check DNS",
      })
      .mockResolvedValueOnce({ ok: true, httpStatus: 200 });
    const app = createApp(() => adapterWithCheck(probe));
    const project = await createProject(app);

    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });
    const loaded = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id as string}`,
      headers: requestHeaders(),
    });

    expect(first.json()).toMatchObject({ diagnosis: { code: "network" } });
    expect(second.json()).toMatchObject({ diagnosis: { code: "connected" } });
    expect(loaded.json()).toMatchObject({ lastConnectionCheck: second.json() });
  });

  it("stores a cors diagnosis for a rejected browser GET after a successful Node probe", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );
    const project = await createProject(app);
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/cors-check`,
      headers: requestHeaders(),
      payload: {
        browserGet: { ok: false, error: "TypeError: Failed to fetch" },
        browserRange: { ok: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      browserPending: false,
      diagnosis: {
        code: "cors",
        remediation: expect.stringContaining("Supabase"),
      },
    });

    const loaded = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id as string}`,
      headers: requestHeaders(),
    });
    expect(loaded.json()).toMatchObject({
      lastConnectionCheck: response.json(),
    });
  });

  it("reports a video-seeking diagnosis for a failed range probe and preserves Node failures before cors", async () => {
    const app = createApp(() =>
      adapterWithCheck(async () => ({
        ok: false,
        code: "BUCKET_NOT_PUBLIC",
        remediation: "make the bucket public",
      })),
    );
    const project = await createProject(app);
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/connection-test`,
      headers: requestHeaders(),
    });

    const precedence = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id as string}/cors-check`,
      headers: requestHeaders(),
      payload: {
        browserGet: { ok: false },
        browserRange: { ok: false },
      },
    });

    expect(precedence.json()).toMatchObject({
      diagnosis: { code: "public-read" },
    });
    await app.close();

    const passingApp = createApp(() =>
      adapterWithCheck(async () => ({ ok: true, httpStatus: 200 })),
    );
    const passingProject = await createProject(passingApp);
    await passingApp.inject({
      method: "POST",
      url: `/api/projects/${passingProject.id as string}/connection-test`,
      headers: requestHeaders(),
    });
    const rangeFailure = await passingApp.inject({
      method: "POST",
      url: `/api/projects/${passingProject.id as string}/cors-check`,
      headers: requestHeaders(),
      payload: {
        browserGet: { ok: true },
        browserRange: { ok: false, error: "range blocked" },
      },
    });

    expect(rangeFailure.statusCode).toBe(200);
    expect(rangeFailure.json()).toMatchObject({
      diagnosis: { code: "video-seeking" },
    });
  });
});
