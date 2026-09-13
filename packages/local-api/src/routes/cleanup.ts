import type { FastifyInstance, FastifyReply, RawServerDefault } from "fastify";

import { parseProjectIdParams } from "../../../core/src/domain/project-service.js";
import { ProjectNotFoundError } from "../../../core/src/publication/publication-service.js";
import type { CleanupScheduler } from "../scheduler.js";

function isValidationError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray(value.issues)
  );
}

function sendCleanupError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ProjectNotFoundError) {
    return reply.code(404).send({
      error: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  }
  if (isValidationError(error)) {
    return reply.code(400).send({
      error: "INVALID_PROJECT_ID",
      message: "Project id is invalid.",
    });
  }
  return reply.code(500).send({
    error: "INTERNAL_ERROR",
    message: "The local API could not complete the cleanup request.",
  });
}

/** EMC R1/R3 HTTP facade; scheduler owns shared trigger/report state. */
export function registerCleanupRoutes(
  server: FastifyInstance<RawServerDefault>,
  scheduler: CleanupScheduler,
): void {
  server.post("/api/projects/:id/cleanup", async (request, reply) => {
    try {
      return reply.send(
        await scheduler.cleanupProject(parseProjectIdParams(request.params)),
      );
    } catch (error) {
      return sendCleanupError(reply, error);
    }
  });

  server.get("/api/cleanup/status", (_request, reply) =>
    reply.send(scheduler.latestReport()),
  );
}
