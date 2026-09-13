import type { FastifyInstance, FastifyReply, RawServerDefault } from "fastify";

import {
  parseProjectIdParams,
  type ProjectRow,
} from "../../../core/src/domain/project-service.js";
import type { PublishHistoryRow } from "../../../core/src/publication/history.js";
import {
  createPublicationService,
  ProjectNotFoundError,
} from "../../../core/src/publication/publication-service.js";
import { NoSuccessfulPublicationError } from "../../../core/src/publication/rollback.js";
import type { DrizzleDb } from "../../../core/src/db/client.js";
import { AdapterError, type StorageAdapter } from "@stories/storage-adapters";

const PUBLICATION_API_ERROR = {
  NO_SUCCESSFUL_PUBLICATION: "NO_SUCCESSFUL_PUBLICATION",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
} as const;

export interface PublicationRouteDependencies {
  readonly db: DrizzleDb;
  readonly makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter;
  readonly publicationFetcher?: typeof fetch;
}

function adapterPayload(error: AdapterError): {
  readonly detail: string;
  readonly error: string;
  readonly remediation?: string;
} {
  return {
    error: error.code,
    detail: error.message,
    ...(error.remediation === undefined
      ? {}
      : { remediation: error.remediation }),
  };
}

function isValidationError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray(value.issues)
  );
}

function sendPublicationError(
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof AdapterError) {
    return reply.code(502).send(adapterPayload(error));
  }
  if (error instanceof ProjectNotFoundError) {
    return reply.code(404).send({
      error: PUBLICATION_API_ERROR.PROJECT_NOT_FOUND,
      message: "Project not found.",
    });
  }
  if (error instanceof NoSuccessfulPublicationError) {
    return reply.code(409).send({
      error: PUBLICATION_API_ERROR.NO_SUCCESSFUL_PUBLICATION,
      detail: error.message,
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
    message: "The local API could not complete the publication request.",
  });
}

function historyDto(row: PublishHistoryRow) {
  return {
    id: row.id,
    manifestVersion: row.manifestVersion,
    result: row.result,
    errorDetail: row.errorDetail,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** MP R4/R5 HTTP façade: core owns publication, rollback, and history storage. */
export function registerPublicationRoutes(
  server: FastifyInstance<RawServerDefault>,
  dependencies: PublicationRouteDependencies,
): void {
  const publication = createPublicationService({
    db: dependencies.db,
    makeAdapter: dependencies.makeAdapter,
    ...(dependencies.publicationFetcher === undefined
      ? {}
      : { fetcher: dependencies.publicationFetcher }),
  });

  server.post("/api/projects/:id/publish", async (request, reply) => {
    try {
      const result = await publication.publish(
        parseProjectIdParams(request.params),
      );
      return reply.send({
        status: "published",
        manifestUrl: result.manifestUrl,
      });
    } catch (error) {
      return sendPublicationError(reply, error);
    }
  });

  server.post("/api/projects/:id/rollback", async (request, reply) => {
    try {
      const result = await publication.rollback(
        parseProjectIdParams(request.params),
      );
      return reply.send({
        status: "published",
        manifestUrl: result.manifestUrl,
      });
    } catch (error) {
      return sendPublicationError(reply, error);
    }
  });

  server.get("/api/projects/:id/publish-history", async (request, reply) => {
    try {
      const history = await publication.listHistory(
        parseProjectIdParams(request.params),
      );
      return reply.send(history.map(historyDto));
    } catch (error) {
      return sendPublicationError(reply, error);
    }
  });
}
