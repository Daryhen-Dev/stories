import type { FastifyInstance, RawServerDefault } from "fastify";

import type { DrizzleDb } from "../../../core/src/db/client.js";
import {
  createProjectService,
  parseProjectIdParams,
  type ProjectRow,
} from "../../../core/src/domain/project-service.js";
import type {
  PublicReadCheck,
  StorageAdapter,
} from "@stories/storage-adapters";
import { diagnoseConnection } from "../domain/cors-diagnosis.js";
import { sendProjectRouteError } from "./projects.js";

export interface ConnectionTestRouteDependencies {
  readonly db: DrizzleDb;
  /** Project-aware factory: only this trusted server receives local credentials. */
  readonly makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter;
}

function networkFailure(error: unknown): PublicReadCheck {
  const detail =
    error instanceof Error ? error.message : "unknown connection error";
  return {
    ok: false,
    code: "NETWORK_ERROR",
    remediation: `Check DNS, TLS, and network access to the provider, then re-run the connection test. (${detail})`,
  };
}

/** PM R3 Node-side half of D2's two-context connection check. */
export function registerConnectionTestRoute(
  server: FastifyInstance<RawServerDefault>,
  dependencies: ConnectionTestRouteDependencies,
): void {
  const projects = createProjectService(dependencies.db);

  server.post("/api/projects/:id/connection-test", async (request, reply) => {
    try {
      const id = parseProjectIdParams(request.params);
      const project = await projects.loadProject(id);
      let nodeGet: PublicReadCheck;
      try {
        const adapter = await dependencies.makeAdapter(project);
        nodeGet = await adapter.checkPublicRead();
      } catch (error) {
        nodeGet = networkFailure(error);
      }
      const result = {
        nodeGet,
        browserPending: true,
        diagnosis: diagnoseConnection({
          provider: project.provider as "supabase" | "insforge",
          nodeGet,
        }),
      } as const;
      await projects.setLastConnectionCheck(id, result);
      return reply.send(result);
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });
}
