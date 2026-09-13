import { eq } from "drizzle-orm";
import type { PublicReadCheck } from "@stories/storage-adapters";
import { z } from "zod";

import type { DrizzleDb } from "../db/client.js";
import { projects } from "../db/schema.js";
import { toIsoUtcZ } from "../timestamps.js";

export const PROJECT_PROVIDER = {
  SUPABASE: "supabase",
  INSFORGE: "insforge",
} as const;

export type ProjectProvider =
  (typeof PROJECT_PROVIDER)[keyof typeof PROJECT_PROVIDER];
export type ProjectRow = typeof projects.$inferSelect;

export type JsonValue =
  | boolean
  | JsonValue[]
  | { readonly [key: string]: JsonValue }
  | null
  | number
  | string;

export interface ProjectDto {
  readonly id: string;
  readonly name: string;
  readonly provider: ProjectProvider;
  readonly bucket: string;
  readonly manifestKey: string;
  readonly publicBaseUrl: string;
  readonly lastConnectionCheck: JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectServiceClock {
  /** Reference instant for creation/update timestamps; tests pin it. */
  readonly now?: Date;
}

export interface BrowserProbeInput {
  readonly ok: boolean;
  readonly error?: string;
  readonly httpStatus?: number;
}

export interface CorsCheckInput {
  readonly browserGet: BrowserProbeInput;
  readonly browserRange: BrowserProbeInput;
}

export interface ProjectValidationIssue {
  readonly message: string;
  readonly path: readonly (number | string)[];
}

const projectProviderSchema = z.enum([
  PROJECT_PROVIDER.SUPABASE,
  PROJECT_PROVIDER.INSFORGE,
]);
const adapterErrorCodeSchema = z.enum([
  "AUTH_FAILED",
  "BUCKET_NOT_FOUND",
  "BUCKET_NOT_PUBLIC",
  "UPLOAD_FAILED",
  "OBJECT_NOT_FOUND",
  "VERIFY_MISMATCH",
  "DELETE_FAILED",
  "NETWORK_ERROR",
  "CORS_BLOCKED",
  "UNKNOWN",
]);
const credentialsSchema = z
  .record(z.string(), z.unknown())
  .refine((credentials) => Object.keys(credentials).length > 0, {
    message: "credentials must contain at least one value",
  });
const projectIdParamsSchema = z
  .object({ id: z.string().trim().min(1) })
  .strict();
const browserProbeSchema = z
  .object({
    ok: z.boolean(),
    error: z.string().min(1).optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
  })
  .strict();
const corsCheckRequestSchema = z
  .object({ browserGet: browserProbeSchema, browserRange: browserProbeSchema })
  .strict();
const storedNodeCheckSchema = z.object({
  nodeGet: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), httpStatus: z.number().int() }).strict(),
    z
      .object({
        ok: z.literal(false),
        code: adapterErrorCodeSchema,
        httpStatus: z.number().int().optional(),
        remediation: z.string().min(1),
      })
      .strict(),
  ]),
});

const createProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    provider: projectProviderSchema,
    bucket: z.string().trim().min(1).max(255),
    manifestKey: z.string().trim().min(1).max(1_024).default("stories.json"),
    publicBaseUrl: z.url(),
    credentialsJson: z.string().min(2),
  })
  .strict();

const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    provider: projectProviderSchema.optional(),
    bucket: z.string().trim().min(1).max(255).optional(),
    manifestKey: z.string().trim().min(1).max(1_024).optional(),
    publicBaseUrl: z.url().optional(),
    credentialsJson: z.string().min(2).optional(),
  })
  .strict()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    { message: "update requires at least one project field" },
  );

const createProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    provider: projectProviderSchema,
    bucket: z.string().trim().min(1).max(255),
    manifestKey: z.string().trim().min(1).max(1_024).optional(),
    publicBaseUrl: z.url(),
    credentials: credentialsSchema,
  })
  .strict();
const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    provider: projectProviderSchema.optional(),
    bucket: z.string().trim().min(1).max(255).optional(),
    manifestKey: z.string().trim().min(1).max(1_024).optional(),
    publicBaseUrl: z.url().optional(),
    credentials: credentialsSchema.optional(),
  })
  .strict()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    { message: "update requires at least one project field" },
  );

export type CreateProjectInput = z.input<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectInputSchema>;

/** Thrown when a project id does not identify a persisted local project. */
export class ProjectServiceNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`project ${projectId} not found`);
    this.name = "ProjectServiceNotFoundError";
  }
}

function parseJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const parsed: JsonValue[] = [];
    for (const entry of value) {
      const nested = parseJsonValue(entry);
      if (nested === undefined) return undefined;
      parsed.push(nested);
    }
    return parsed;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, nestedValue]) => [key, parseJsonValue(nestedValue)] as const,
    );
    if (entries.some(([, nestedValue]) => nestedValue === undefined)) {
      return undefined;
    }
    return Object.fromEntries(entries) as { readonly [key: string]: JsonValue };
  }
  return undefined;
}

function toCredentialsJson(credentials: Record<string, unknown>): string {
  const serialized = JSON.stringify(credentials);
  if (serialized === undefined) {
    throw new Error("Credentials must be JSON-serializable.");
  }
  return serialized;
}

/**
 * Shared Zod request parsers keep route payload validation consistent while the
 * core package remains the single Zod-owning domain boundary for project data.
 */
export function parseProjectIdParams(input: unknown): string {
  return projectIdParamsSchema.parse(input).id;
}

export function parseCreateProjectRequest(input: unknown): CreateProjectInput {
  const parsed = createProjectRequestSchema.parse(input);
  return {
    name: parsed.name,
    provider: parsed.provider,
    bucket: parsed.bucket,
    manifestKey: parsed.manifestKey,
    publicBaseUrl: parsed.publicBaseUrl,
    credentialsJson: toCredentialsJson(parsed.credentials),
  };
}

export function parseUpdateProjectRequest(input: unknown): UpdateProjectInput {
  const parsed = updateProjectRequestSchema.parse(input);
  const patch: UpdateProjectInput = {};
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.provider !== undefined) patch.provider = parsed.provider;
  if (parsed.bucket !== undefined) patch.bucket = parsed.bucket;
  if (parsed.manifestKey !== undefined) patch.manifestKey = parsed.manifestKey;
  if (parsed.publicBaseUrl !== undefined)
    patch.publicBaseUrl = parsed.publicBaseUrl;
  if (parsed.credentials !== undefined) {
    patch.credentialsJson = toCredentialsJson(parsed.credentials);
  }
  return patch;
}

function toBrowserProbeInput(value: {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly httpStatus?: number | undefined;
}): BrowserProbeInput {
  const probe: { ok: boolean; error?: string; httpStatus?: number } = {
    ok: value.ok,
  };
  if (value.error !== undefined) probe.error = value.error;
  if (value.httpStatus !== undefined) probe.httpStatus = value.httpStatus;
  return probe;
}

export function parseCorsCheckRequest(input: unknown): CorsCheckInput {
  const parsed = corsCheckRequestSchema.parse(input);
  return {
    browserGet: toBrowserProbeInput(parsed.browserGet),
    browserRange: toBrowserProbeInput(parsed.browserRange),
  };
}

export function parseStoredNodeProbe(
  value: string | null,
): PublicReadCheck | undefined {
  if (value === null) return undefined;
  try {
    const parsed = storedNodeCheckSchema.safeParse(
      JSON.parse(value) as unknown,
    );
    return parsed.success
      ? (parsed.data.nodeGet as PublicReadCheck)
      : undefined;
  } catch {
    return undefined;
  }
}

export function projectValidationIssues(
  error: unknown,
): readonly ProjectValidationIssue[] | undefined {
  if (!(error instanceof z.ZodError)) return undefined;
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment),
    ),
    message: issue.message,
  }));
}

/** D8 boundary mapper: credentialsJson is intentionally absent from every DTO. */
export function toProjectDto(project: ProjectRow): ProjectDto {
  let lastConnectionCheck: JsonValue = null;
  if (project.lastConnectionCheck !== null) {
    try {
      lastConnectionCheck =
        parseJsonValue(JSON.parse(project.lastConnectionCheck)) ?? null;
    } catch {
      // A malformed local value must never leak arbitrary text through a response.
    }
  }
  return {
    id: project.id,
    name: project.name,
    provider: project.provider as ProjectProvider,
    bucket: project.bucket,
    manifestKey: project.manifestKey,
    publicBaseUrl: project.publicBaseUrl,
    lastConnectionCheck,
    createdAt: toIsoUtcZ(project.createdAt),
    updatedAt: toIsoUtcZ(project.updatedAt),
  };
}

/**
 * Local SQLite project CRUD. Credentials remain available only to trusted local
 * services via `loadProject`; every operator-facing method returns a redacted DTO.
 */
export function createProjectService(db: DrizzleDb) {
  async function createProject(
    input: CreateProjectInput,
    clock: ProjectServiceClock = {},
  ): Promise<ProjectDto> {
    const parsed = createProjectInputSchema.parse(input);
    const now = clock.now ?? new Date();
    const rows = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        name: parsed.name,
        provider: parsed.provider,
        bucket: parsed.bucket,
        manifestKey: parsed.manifestKey,
        publicBaseUrl: parsed.publicBaseUrl,
        credentialsJson: parsed.credentialsJson,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    // SAFETY: a successful INSERT without a WHERE clause returns the inserted row.
    return toProjectDto(rows[0] as ProjectRow);
  }

  async function listProjects(): Promise<ProjectDto[]> {
    const rows = await db.select().from(projects).orderBy(projects.name);
    return rows.map(toProjectDto);
  }

  async function loadProject(projectId: string): Promise<ProjectRow> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new ProjectServiceNotFoundError(projectId);
    return project;
  }

  async function getProject(projectId: string): Promise<ProjectDto> {
    return toProjectDto(await loadProject(projectId));
  }

  async function updateProject(
    projectId: string,
    patch: UpdateProjectInput,
    clock: ProjectServiceClock = {},
  ): Promise<ProjectDto> {
    const parsed = updateProjectInputSchema.parse(patch);
    const set: {
      name?: string;
      provider?: ProjectProvider;
      bucket?: string;
      manifestKey?: string;
      publicBaseUrl?: string;
      credentialsJson?: string;
      updatedAt: Date;
    } = { updatedAt: clock.now ?? new Date() };
    if (parsed.name !== undefined) set.name = parsed.name;
    if (parsed.provider !== undefined) set.provider = parsed.provider;
    if (parsed.bucket !== undefined) set.bucket = parsed.bucket;
    if (parsed.manifestKey !== undefined) set.manifestKey = parsed.manifestKey;
    if (parsed.publicBaseUrl !== undefined)
      set.publicBaseUrl = parsed.publicBaseUrl;
    if (parsed.credentialsJson !== undefined) {
      set.credentialsJson = parsed.credentialsJson;
    }

    const [project] = await db
      .update(projects)
      .set(set)
      .where(eq(projects.id, projectId))
      .returning();
    if (!project) throw new ProjectServiceNotFoundError(projectId);
    return toProjectDto(project);
  }

  async function deleteProject(projectId: string): Promise<void> {
    const rows = await db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    if (!rows[0]) throw new ProjectServiceNotFoundError(projectId);
  }

  async function setLastConnectionCheck(
    projectId: string,
    result: unknown,
    clock: ProjectServiceClock = {},
  ): Promise<ProjectDto> {
    const serialized = JSON.stringify(result);
    if (serialized === undefined) {
      throw new Error("Connection check result must be JSON-serializable.");
    }
    const [project] = await db
      .update(projects)
      .set({
        lastConnectionCheck: serialized,
        updatedAt: clock.now ?? new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    if (!project) throw new ProjectServiceNotFoundError(projectId);
    return toProjectDto(project);
  }

  return {
    createProject,
    listProjects,
    loadProject,
    getProject,
    updateProject,
    deleteProject,
    setLastConnectionCheck,
  } as const;
}

export type ProjectService = ReturnType<typeof createProjectService>;
