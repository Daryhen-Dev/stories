import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer, listenServer, loggerSerializers } from "./server.js";

const makeAdapter = async () => {
  throw new Error("adapter is not used by the security backbone");
};

let server: FastifyInstance | undefined;

function createServer(port?: number): FastifyInstance {
  server =
    port === undefined
      ? buildServer({ db: {}, makeAdapter })
      : buildServer({ db: {}, makeAdapter, port });
  return server;
}

afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.unstubAllEnvs();
});

describe("local API security backbone (PM R5, D6/D8/D9)", () => {
  it("binds only to 127.0.0.1:3789 by default", async () => {
    const app = createServer();
    const listen = vi.spyOn(app, "listen").mockResolvedValue();

    await listenServer(app);

    expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 3789 });
  });

  it("honors STORIES_API_PORT for binding and the Host allowlist", async () => {
    vi.stubEnv("STORIES_API_PORT", "4567");
    const app = createServer();
    const listen = vi.spyOn(app, "listen").mockResolvedValue();

    await listenServer(app);
    const accepted = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "localhost:4567" },
    });
    const rejected = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "localhost:3789" },
    });

    expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 4567 });
    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(403);
  });

  it("rejects a foreign Host before the route handler runs", async () => {
    const app = createServer();
    const handler = vi.fn(() => ({ reached: true }));
    app.get("/must-not-run", handler);

    const response = await app.inject({
      method: "GET",
      url: "/must-not-run",
      headers: { host: "attacker.example:3789" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "FORBIDDEN_ORIGIN",
      message: "Host is not allowed for this local API.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin before handlers without adding CORS response headers", async () => {
    const app = createServer();
    const handler = vi.fn(() => ({ reached: true }));
    app.get("/origin-must-not-run", handler);

    const response = await app.inject({
      method: "GET",
      url: "/origin-must-not-run",
      headers: {
        host: "127.0.0.1:3789",
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "FORBIDDEN_ORIGIN",
      message: "Origin is not allowed for this local API.",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(
      Object.keys(response.headers).filter((header) =>
        header.startsWith("access-control-"),
      ),
    ).toEqual([]);
  });

  it("accepts same-origin localhost traffic on the listening port", async () => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "localhost:3789",
        origin: "http://localhost:3789",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("accepts the IPv6 loopback Host and rejects IPv6-mapped forms", async () => {
    const app = createServer();

    const accepted = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "[::1]:3789" },
    });
    const rejected = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "[::ffff:127.0.0.1]:3789" },
    });

    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(403);
  });

  it("redacts credential-like keys recursively in serialized objects and arrays", async () => {
    const app = createServer();
    app.get("/redaction", () => ({
      visible: "safe",
      credential: "database-secret",
      nested: {
        apiKey: "provider-key",
        values: [{ token: "session-token" }, "safe-array-value"],
      },
      service_role: "service-role-key",
    }));

    const response = await app.inject({
      method: "GET",
      url: "/redaction",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      visible: "safe",
      credential: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        values: [{ token: "[REDACTED]" }, "safe-array-value"],
      },
      service_role: "[REDACTED]",
    });
  });

  it("redacts credential-like keys inside a top-level array", async () => {
    const app = createServer();
    app.get("/redaction-array", () => [
      { clientSecret: "nested-secret", visible: "first" },
      { api_key: "api-secret", visible: "second" },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/redaction-array",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { clientSecret: "[REDACTED]", visible: "first" },
      { api_key: "[REDACTED]", visible: "second" },
    ]);
  });

  it("redacts authorization, cookie, and credential-like logger fields", () => {
    expect(
      loggerSerializers.req({
        method: "GET",
        url: "/api/health",
        headers: {
          authorization: "Bearer access-token",
          cookie: "session=private",
          "x-api-key": "provider-key",
          accept: "application/json",
        },
      }),
    ).toEqual({
      method: "GET",
      url: "/api/health",
      headers: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        accept: "application/json",
      },
    });
  });

  it("serves the loopback health route without CORS headers", async () => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:3789" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(
      Object.keys(response.headers).filter((header) =>
        header.startsWith("access-control-"),
      ),
    ).toEqual([]);
  });
});
