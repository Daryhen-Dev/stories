import type { FastifyInstance, FastifyReply, RawServerDefault } from "fastify";

import type { DrizzleDb } from "../../../core/src/db/client.js";
import type { ProjectRow } from "../../../core/src/domain/project-service.js";
import {
  createProjectService,
  ProjectServiceNotFoundError,
} from "../../../core/src/domain/project-service.js";
import {
  createStoryService,
  type StoryRow,
} from "../../../core/src/domain/story-service.js";
import { createPublicationService } from "../../../core/src/publication/publication-service.js";
import { MEDIA_CACHE_CONTROL_SECONDS } from "../../../core/src/publication/policy.js";
import {
  AdapterError,
  DEFAULT_MAX_UPLOAD_BYTES,
  StreamLengthError,
  type StorageAdapter,
} from "@stories/storage-adapters";

import {
  readStoryMultipart,
  StoryMultipartValidationError,
  type MultipartStoryFile,
  type StoryMultipartMetadata,
} from "./story-multipart.js";

const STORY_API_ERROR = {
  ADAPTER_FAILURE: "ADAPTER_FAILURE",
  INVALID_CONFIGURATION: "INVALID_CONFIGURATION",
  INVALID_STORY_METADATA: "INVALID_STORY_METADATA",
  SIZE_MISMATCH: "SIZE_MISMATCH",
  STORY_NOT_FOUND: "STORY_NOT_FOUND",
  UPLOAD_LIMIT_EXCEEDED: "UPLOAD_LIMIT_EXCEEDED",
} as const;

type StoryApiError = (typeof STORY_API_ERROR)[keyof typeof STORY_API_ERROR];

export interface StoryRouteDependencies {
  readonly db: DrizzleDb;
  readonly makeAdapter: (
    project: ProjectRow,
  ) => Promise<StorageAdapter> | StorageAdapter;
  readonly publicationFetcher?: typeof fetch;
}

interface UploadedStoryFiles {
  readonly mediaKey: string;
  readonly posterKey?: string;
}

interface MutableUploadedStoryFiles {
  mediaKey?: string;
  posterKey?: string;
}

interface PublicationStatus {
  readonly manifestUrl?: string;
  readonly status: "failed" | "published";
  readonly error?: { readonly code: string; readonly detail: string };
}

function storyKeys(id: string, file: MultipartStoryFile): string {
  const extension =
    file.kind === "poster" ? "jpg" : extensionFor(file.contentType);
  return `stories/${id}/${file.kind}.${extension}`;
}

function extensionFor(contentType: string): string {
  const subtype = contentType.split("/")[1]?.toLowerCase();
  if (subtype === undefined || !/^[a-z0-9]+$/.test(subtype)) return "bin";
  return subtype === "jpeg" ? "jpg" : subtype;
}

function resolveMaxUploadBytes(
  value = process.env.STORIES_MAX_UPLOAD_MB,
): number {
  if (value === undefined) return DEFAULT_MAX_UPLOAD_BYTES;
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new StoryConfigurationError(
      "STORIES_MAX_UPLOAD_MB must be a positive number of MiB.",
    );
  }
  const mib = Number(value);
  const bytes = mib * 1024 * 1024;
  if (!Number.isFinite(bytes) || !Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new StoryConfigurationError(
      "STORIES_MAX_UPLOAD_MB must resolve to a positive safe integer byte limit.",
    );
  }
  return bytes;
}

class StoryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryConfigurationError";
  }
}

function adapterPayload(error: AdapterError): {
  readonly error: string;
  readonly detail: string;
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

function streamErrorReply(
  reply: FastifyReply,
  error: StreamLengthError,
): FastifyReply {
  const configuredLimit =
    error.reason === "ACTUAL_SIZE_EXCEEDS_LIMIT" ||
    error.reason === "DECLARED_SIZE_EXCEEDS_LIMIT";
  return reply.code(configuredLimit ? 413 : 400).send({
    error: configuredLimit ? error.reason : error.reason,
    detail: error.message,
  });
}

export function sendStoryRouteError(
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof StoryMultipartValidationError) {
    return reply.code(400).send({
      error: STORY_API_ERROR.INVALID_STORY_METADATA,
      message: error.message,
      ...(error.issues.length === 0 ? {} : { issues: error.issues }),
    });
  }
  if (error instanceof StoryConfigurationError) {
    return reply.code(500).send({
      error: STORY_API_ERROR.INVALID_CONFIGURATION,
      message: error.message,
    });
  }
  if (error instanceof StreamLengthError) return streamErrorReply(reply, error);
  if (error instanceof AdapterError) {
    return reply.code(502).send(adapterPayload(error));
  }
  if (error instanceof ProjectServiceNotFoundError) {
    return reply.code(404).send({
      error: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  }
  return reply.code(500).send({
    error: "INTERNAL_ERROR",
    message: "The local API could not complete the story request.",
  });
}

function fileInput(
  file: MultipartStoryFile,
  key: string,
): {
  readonly body: ReadableStream<Uint8Array>;
  readonly cacheControlSeconds: number;
  readonly contentLength: number;
  readonly contentType: string;
  readonly key: string;
} {
  return {
    body: file.body,
    cacheControlSeconds: MEDIA_CACHE_CONTROL_SECONDS,
    contentLength: file.contentLength,
    contentType: file.contentType,
    key,
  };
}

async function uploadAndVerify(
  adapter: StorageAdapter,
  key: string,
  file: MultipartStoryFile,
): Promise<void> {
  await adapter.upload(fileInput(file, key));
  const verified = await adapter.verify(key, {
    contentType: file.contentType,
    size: file.contentLength,
  });
  if (!verified.ok) {
    throw new AdapterError(verified.code, adapter.provider, verified.detail);
  }
}

function createStoryInput(
  id: string,
  metadata: StoryMultipartMetadata,
  files: UploadedStoryFiles,
  mediaType: string,
) {
  return {
    id,
    type: metadata.type,
    mediaKey: files.mediaKey,
    ...(files.posterKey === undefined ? {} : { posterKey: files.posterKey }),
    mimeType: mediaType,
    sizeBytes: metadata.mediaSize,
    ...(metadata.durationSeconds === undefined
      ? {}
      : { durationSeconds: metadata.durationSeconds }),
    position: metadata.position,
    expiresAt: metadata.expiresAt,
  };
}

async function publishCreatedStory(
  dependencies: StoryRouteDependencies,
  projectId: string,
): Promise<PublicationStatus> {
  const publication = createPublicationService({
    db: dependencies.db,
    makeAdapter: dependencies.makeAdapter,
    ...(dependencies.publicationFetcher === undefined
      ? {}
      : { fetcher: dependencies.publicationFetcher }),
  });
  try {
    const result = await publication.publish(projectId);
    return { status: "published", manifestUrl: result.manifestUrl };
  } catch (error) {
    if (error instanceof AdapterError) {
      return {
        status: "failed",
        error: { code: error.code, detail: error.message },
      };
    }
    return {
      status: "failed",
      error: {
        code: "PUBLICATION_FAILED",
        detail: error instanceof Error ? error.message : "Publication failed.",
      },
    };
  }
}

/** SL R1/R2 creation endpoint: field-first stream → adapter → verify → local truth → publish. */
export function registerStoryRoutes(
  server: FastifyInstance<RawServerDefault>,
  dependencies: StoryRouteDependencies,
): void {
  const projects = createProjectService(dependencies.db);
  const stories = createStoryService(dependencies.db);

  server.post("/api/projects/:id/stories", async (request, reply) => {
    try {
      const now = new Date();
      const projectId = String(
        (request.params as { readonly id?: unknown }).id ?? "",
      );
      const project = await projects.loadProject(projectId);
      const adapter = await dependencies.makeAdapter(project);
      const id = crypto.randomUUID();
      const files: MutableUploadedStoryFiles = {};
      let mediaType: string | undefined;
      const metadata = await readStoryMultipart(request, {
        maxBytes: resolveMaxUploadBytes(),
        now,
        provider: adapter.provider,
        upload: async (file) => {
          const key = storyKeys(id, file);
          await uploadAndVerify(adapter, key, file);
          if (file.kind === "media") {
            files.mediaKey = key;
            mediaType = file.contentType;
          } else files.posterKey = key;
        },
      });
      if (files.mediaKey === undefined || mediaType === undefined) {
        throw new StoryMultipartValidationError(
          "A story request requires one media file.",
        );
      }
      const story = await stories.createStory(
        projectId,
        createStoryInput(id, metadata, files as UploadedStoryFiles, mediaType),
        { now },
      );
      const publication = await publishCreatedStory(dependencies, projectId);
      return reply.code(201).send({ story, publication });
    } catch (error) {
      return sendStoryRouteError(reply, error);
    }
  });
}

export type { StoryApiError, StoryRow };
