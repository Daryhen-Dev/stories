import fastify, { type FastifyInstance, type RawServerDefault } from "fastify";

import type { StorageAdapter } from "@stories/storage-adapters";

import { registerLoopbackGuard } from "./plugins/loopback-guard.js";
import { redactDeep, REDACTION } from "./plugins/redact.js";
import { registerHealthRoute } from "./routes/health.js";

const SERVER_DEFAULTS = {
  host: "127.0.0.1",
  port: 3789,
} as const;

interface LogRequest {
  readonly headers: Record<string, unknown>;
  readonly method: string;
  readonly url: string;
}

export interface ServerDependencies {
  /** Reserved for the core-backed routes that land after the security backbone. */
  readonly db: unknown;
  /** Reserved for routes that construct storage adapters from local project data. */
  readonly makeAdapter: () => Promise<StorageAdapter>;
  /** Explicit test/process override; otherwise STORIES_API_PORT then the D9 default. */
  readonly port?: number;
}

function asLogRequest(value: unknown): LogRequest {
  if (typeof value !== "object" || value === null) {
    return { headers: {}, method: "", url: "" };
  }
  const record = value as Record<string, unknown>;
  return {
    headers:
      typeof record.headers === "object" && record.headers !== null
        ? (record.headers as Record<string, unknown>)
        : {},
    method: typeof record.method === "string" ? record.method : "",
    url: typeof record.url === "string" ? record.url : "",
  };
}

function redactHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      REDACTION.credentialKey.test(key) ||
      key.toLowerCase() === "authorization" ||
      key.toLowerCase() === "cookie"
        ? REDACTION.value
        : value,
    ]),
  );
}

/** Fastify/Pino request serializer that never emits local credentials or cookies. */
export const loggerSerializers = {
  req(request: unknown) {
    const parsed = asLogRequest(request);
    return {
      method: parsed.method,
      url: parsed.url,
      headers: redactHeaders(parsed.headers),
    };
  },
} as const;

function parsePort(value: string, source: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${source} must be an integer between 1 and 65535.`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${source} must be an integer between 1 and 65535.`);
  }
  return port;
}

export function resolveApiPort(override?: number): number {
  if (override !== undefined) {
    return parsePort(String(override), "port override");
  }
  const configuredPort = process.env.STORIES_API_PORT;
  return configuredPort === undefined
    ? SERVER_DEFAULTS.port
    : parsePort(configuredPort, "STORIES_API_PORT");
}

/**
 * PR 8 security-only server factory. Future route slices consume the decorated
 * dependencies without widening this hardened process boundary.
 */
export function buildServer(
  dependencies: ServerDependencies,
): FastifyInstance<RawServerDefault> {
  const port = resolveApiPort(dependencies.port);
  const server = fastify<RawServerDefault>({
    logger: { level: "silent", serializers: loggerSerializers },
  });

  server.decorate("localApiDependencies", dependencies);
  registerLoopbackGuard(server, port);
  server.addHook("preSerialization", (_request, _reply, payload, done) => {
    done(null, redactDeep(payload));
  });
  registerHealthRoute(server);

  return server;
}

/** Starts the D9 loopback-only process binding; never listens on a public interface. */
export function listenServer(
  server: FastifyInstance<RawServerDefault>,
  port?: number,
): Promise<string> {
  return server.listen({
    host: SERVER_DEFAULTS.host,
    port: resolveApiPort(port),
  });
}
