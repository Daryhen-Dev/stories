import type { FastifyInstance, RawServerDefault } from "fastify";

const FORBIDDEN_ORIGIN = {
  CODE: "FORBIDDEN_ORIGIN",
} as const;

type ForbiddenOriginCode =
  (typeof FORBIDDEN_ORIGIN)[keyof typeof FORBIDDEN_ORIGIN];

interface ForbiddenOriginPayload {
  readonly error: ForbiddenOriginCode;
  readonly message: string;
}

const hostForms = (port: number): readonly string[] => [
  `127.0.0.1:${port}`,
  `localhost:${port}`,
  `[::1]:${port}`,
];

interface LoopbackAuthority {
  readonly hosts: ReadonlySet<string>;
  readonly origins: ReadonlySet<string>;
}

function createLoopbackAuthority(port: number): LoopbackAuthority {
  const hosts = new Set(hostForms(port));
  return {
    hosts,
    origins: new Set([...hosts].map((host) => `http://${host}`)),
  };
}

function forbidden(message: string): ForbiddenOriginPayload {
  return { error: FORBIDDEN_ORIGIN.CODE, message };
}

/**
 * PM R5 DNS-rebinding and cross-origin defense. One typed `onRequest` hook
 * rejects Host before handlers, then validates an optional browser Origin.
 */
export function registerLoopbackGuard(
  server: FastifyInstance<RawServerDefault>,
  port: number,
): void {
  const allowed = createLoopbackAuthority(port);

  server.addHook("onRequest", (request, reply, done) => {
    const host = request.headers.host;
    if (host === undefined || !allowed.hosts.has(host)) {
      reply
        .code(403)
        .send(forbidden("Host is not allowed for this local API."));
      done();
      return;
    }

    const origin = request.headers.origin;
    if (origin !== undefined && !allowed.origins.has(origin)) {
      reply
        .code(403)
        .send(forbidden("Origin is not allowed for this local API."));
      done();
      return;
    }

    done();
  });
}
