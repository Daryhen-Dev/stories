import type { FastifyInstance, RawServerDefault } from "fastify";

import type { DrizzleDb } from "../../../core/src/db/client.js";
import {
  createProjectService,
  parseCorsCheckRequest,
  parseProjectIdParams,
  parseStoredNodeProbe,
} from "../../../core/src/domain/project-service.js";
import {
  diagnoseConnection,
  type BrowserProbeOutcome,
} from "../domain/cors-diagnosis.js";
import { sendProjectRouteError } from "./projects.js";

const NODE_PROBE_REQUIRED = {
  error: "NODE_PROBE_REQUIRED",
  message:
    "Run the Node connection test before submitting browser probe results.",
} as const;

export interface CorsCheckRouteDependencies {
  readonly db: DrizzleDb;
}

/** PM R4 browser-context half of D2; browsers submit their observed outcomes here. */
export function registerCorsCheckRoute(
  server: FastifyInstance<RawServerDefault>,
  dependencies: CorsCheckRouteDependencies,
): void {
  const projects = createProjectService(dependencies.db);

  server.post("/api/projects/:id/cors-check", async (request, reply) => {
    try {
      const id = parseProjectIdParams(request.params);
      const browser = parseCorsCheckRequest(request.body);
      const project = await projects.loadProject(id);
      const nodeGet = parseStoredNodeProbe(project.lastConnectionCheck);
      if (nodeGet === undefined)
        return reply.code(400).send(NODE_PROBE_REQUIRED);

      const result = {
        nodeGet,
        browserGet: browser.browserGet as BrowserProbeOutcome,
        browserRange: browser.browserRange as BrowserProbeOutcome,
        browserPending: false,
        diagnosis: diagnoseConnection({
          provider: project.provider as "supabase" | "insforge",
          nodeGet,
          browserGet: browser.browserGet,
          browserRange: browser.browserRange,
        }),
      } as const;
      await projects.setLastConnectionCheck(id, result);
      return reply.send(result);
    } catch (error) {
      return sendProjectRouteError(reply, error);
    }
  });
}
