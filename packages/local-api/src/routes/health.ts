import type { FastifyInstance, RawServerDefault } from "fastify";

const HEALTH_STATUS = {
  OK: "ok",
} as const;

/** Liveness endpoint for the panel and process orchestration. */
export function registerHealthRoute(
  server: FastifyInstance<RawServerDefault>,
): void {
  server.get("/api/health", () => ({ status: HEALTH_STATUS.OK }));
}
