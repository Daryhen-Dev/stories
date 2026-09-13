import type { FastifyInstance, FastifyReply, RawServerDefault } from "fastify";

import type { DrizzleDb } from "../../../core/src/db/client.js";
import {
  createProjectService,
  parseCreateProjectRequest,
  parseProjectIdParams,
  parseUpdateProjectRequest,
  ProjectServiceNotFoundError,
  projectValidationIssues,
} from "../../../core/src/domain/project-service.js";

const API_ERROR = {
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  INTERNAL: "INTERNAL_ERROR",
} as const;

export interface ProjectRouteDependencies {
  readonly db: DrizzleDb;
}

/** Shared typed error shape for every PR 9 project-management endpoint. */
export function sendProjectRouteError(
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  const issues = projectValidationIssues(error);
  if (issues !== undefined) {
    return reply.code(400).send({
      error: API_ERROR.INVALID_PAYLOAD,
      message: "Request payload is invalid.",
      issues,
    });
  }
  if (error instanceof ProjectServiceNotFoundError) {
    return reply.code(404).send({
      error: API_ERROR.PROJECT_NOT_FOUND,
      message: "Project not found.",
    });
  }
  return reply.code(500).send({
    error: API_ERROR.INTERNAL,
    message: "The local API could not complete the request.",
  });
}

/** PM R1 CRUD endpoints. The service returns D8-safe DTOs, never credential rows. */
export function registerProjectRoutes(
  server: FastifyInstance<RawServerDefault>,
  dependencies: ProjectRouteDependencies,
): void {
  const projects = createProjectService(dependencies.db);

  server.post("/api/projects", async (request, reply) => {
    try {
      return reply
        .code(201)
        .send(
          await projects.createProject(parseCreateProjectRequest(request.body)),
        );
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });

  server.get("/api/projects", async (_request, reply) => {
    try {
      return reply.send(await projects.listProjects());
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });

  server.get("/api/projects/:id", async (request, reply) => {
    try {
      return reply.send(
        await projects.getProject(parseProjectIdParams(request.params)),
      );
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });

  server.patch("/api/projects/:id", async (request, reply) => {
    try {
      return reply.send(
        await projects.updateProject(
          parseProjectIdParams(request.params),
          parseUpdateProjectRequest(request.body),
        ),
      );
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });

  server.delete("/api/projects/:id", async (request, reply) => {
    try {
      await projects.deleteProject(parseProjectIdParams(request.params));
      return reply.code(204).send();
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });
}
