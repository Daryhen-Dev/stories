import type { FastifyInstance, RawServerDefault } from "fastify";

import type { DrizzleDb } from "../../../core/src/db/client.js";
import {
  createStoryService,
  StoryNotFoundError,
  type StoryRow,
} from "../../../core/src/domain/story-service.js";

const STORY_EDIT_ERROR = {
  INVALID_STORY_UPDATE: "INVALID_STORY_UPDATE",
  STORY_NOT_FOUND: "STORY_NOT_FOUND",
} as const;

interface StoryEditRouteDependencies {
  readonly db: DrizzleDb;
}

function storyIdFrom(params: unknown): string {
  if (
    typeof params !== "object" ||
    params === null ||
    !("id" in params) ||
    typeof params.id !== "string" ||
    params.id.trim().length === 0
  ) {
    throw new StoryEditValidationError("Story id is required.");
  }
  return params.id;
}

function storyPatchFrom(payload: unknown): {
  readonly expiresAt?: string;
  readonly position?: number;
} {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new StoryEditValidationError("Story update payload is invalid.");
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "expiresAt" && key !== "position") ||
    (record.expiresAt !== undefined && typeof record.expiresAt !== "string") ||
    (record.position !== undefined &&
      (typeof record.position !== "number" ||
        !Number.isSafeInteger(record.position) ||
        record.position < 0))
  ) {
    throw new StoryEditValidationError("Story update payload is invalid.");
  }
  return {
    ...(typeof record.expiresAt === "string"
      ? { expiresAt: record.expiresAt }
      : {}),
    ...(typeof record.position === "number"
      ? { position: record.position }
      : {}),
  };
}

class StoryEditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryEditValidationError";
  }
}

function isValidationError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray(value.issues)
  );
}

function storyDto(story: StoryRow) {
  return {
    ...story,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    ...(story.cleanedAt === null
      ? {}
      : { cleanedAt: story.cleanedAt.toISOString() }),
  };
}

function sendEditError(
  reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof StoryNotFoundError) {
    return reply.code(404).send({
      error: STORY_EDIT_ERROR.STORY_NOT_FOUND,
      message: "Story not found.",
    });
  }
  if (error instanceof StoryEditValidationError || isValidationError(error)) {
    return reply.code(400).send({
      error: STORY_EDIT_ERROR.INVALID_STORY_UPDATE,
      message: "Story update payload is invalid.",
    });
  }
  return reply.code(500).send({
    error: "INTERNAL_ERROR",
    message: "The local API could not complete the story request.",
  });
}

/** SL R3/R7 HTTP façade: core remains the owner of validation and pending deletion. */
export function registerStoryEditRoutes(
  server: FastifyInstance<RawServerDefault>,
  dependencies: StoryEditRouteDependencies,
): void {
  const stories = createStoryService(dependencies.db);

  server.patch("/api/stories/:id", async (request, reply) => {
    try {
      const story = await stories.updateStory(
        storyIdFrom(request.params),
        storyPatchFrom(request.body),
      );
      return reply.send(storyDto(story));
    } catch (error) {
      return sendEditError(reply, error);
    }
  });

  server.delete("/api/stories/:id", async (request, reply) => {
    try {
      await stories.removeStory(storyIdFrom(request.params));
      return reply.code(204).send();
    } catch (error) {
      return sendEditError(reply, error);
    }
  });
}
