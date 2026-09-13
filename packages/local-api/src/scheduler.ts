import {
  createCleanupService,
  type CleanupReport,
} from "../../core/src/cleanup/cleanup-service.js";
import type { DrizzleDb } from "../../core/src/db/client.js";
import {
  createProjectService,
  type ProjectRow,
} from "../../core/src/domain/project-service.js";
import type { StorageAdapter } from "@stories/storage-adapters";

export const DEFAULT_CLEANUP_INTERVAL_MINUTES = 60;

export interface CleanupSchedulerDependencies {
  readonly db: DrizzleDb;
  readonly makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter;
}

export interface CleanupScheduler {
  cleanupProject(projectId: string): Promise<CleanupReport>;
  latestReport(): CleanupReport | null;
  start(): Promise<void>;
  stop(): void;
}

export function resolveCleanupIntervalMinutes(
  configured = process.env.STORIES_CLEANUP_INTERVAL_MINUTES,
): number {
  if (configured === undefined) return DEFAULT_CLEANUP_INTERVAL_MINUTES;
  if (!/^[1-9]\d*$/.test(configured)) {
    throw new Error(
      "STORIES_CLEANUP_INTERVAL_MINUTES must be a positive integer.",
    );
  }
  const minutes = Number(configured);
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(
      "STORIES_CLEANUP_INTERVAL_MINUTES must be a positive integer.",
    );
  }
  return minutes;
}

/**
 * Coordinates the three EMC R1 triggers around one project-scoped core cleanup
 * service and owns the in-memory latest report exposed by the API.
 */
export function createCleanupScheduler(
  dependencies: CleanupSchedulerDependencies,
): CleanupScheduler {
  const cleanup = createCleanupService(
    dependencies.db,
    dependencies.makeAdapter,
  );
  let latest: CleanupReport | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;

  async function cleanupProject(projectId: string): Promise<CleanupReport> {
    const report = await cleanup.cleanup(projectId);
    latest = report;
    return report;
  }

  async function cleanupAllProjects(): Promise<void> {
    try {
      const projects = await createProjectService(
        dependencies.db,
      ).listProjects();
      const reports: CleanupReport[] = [];
      for (const project of projects) {
        try {
          reports.push(await cleanup.cleanup(project.id));
        } catch {
          // Automatic cleanup is provider hygiene, never an availability gate.
        }
      }
      if (projects.length === 0 || reports.length > 0) {
        latest = aggregateCleanupReports(reports);
      }
    } catch {
      // List/setup failures have no valid per-story CleanupReport shape to expose.
    }
  }

  async function start(): Promise<void> {
    try {
      const intervalMs = resolveCleanupIntervalMinutes() * 60 * 1_000;
      await cleanupAllProjects();
      interval = setInterval(() => {
        void cleanupAllProjects();
      }, intervalMs);
    } catch {
      // Invalid configuration must not prevent Fastify readiness or listening.
    }
  }

  function stop(): void {
    if (interval !== undefined) clearInterval(interval);
    interval = undefined;
  }

  return {
    cleanupProject,
    latestReport: () => latest,
    start,
    stop,
  };
}

export function aggregateCleanupReports(
  reports: readonly CleanupReport[],
): CleanupReport {
  return reports.reduce<CleanupReport>(
    (aggregate, report) => ({
      attempted: aggregate.attempted + report.attempted,
      deleted: aggregate.deleted + report.deleted,
      failed: aggregate.failed + report.failed,
      errors: [...aggregate.errors, ...report.errors],
    }),
    { attempted: 0, deleted: 0, failed: 0, errors: [] },
  );
}
