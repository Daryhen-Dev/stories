import type { MultipartFile } from "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import { Readable } from "node:stream";

import { parseStoryUploadMetadata } from "../../../core/src/domain/story-service.js";
import { guardUploadBody, type ProviderId } from "@stories/storage-adapters";

const STORY_PART = {
  MEDIA: "media",
  POSTER: "poster",
} as const;

type StoryPart = (typeof STORY_PART)[keyof typeof STORY_PART];

const METADATA_FIELD = {
  DURATION_SECONDS: "durationSeconds",
  EXPIRES_AT: "expiresAt",
  MEDIA_SIZE: "mediaSize",
  POSITION: "position",
  POSTER_SIZE: "posterSize",
  TYPE: "type",
} as const;

const metadataFieldNames = new Set<string>(Object.values(METADATA_FIELD));

interface StoryMultipartMetadata {
  readonly type: "photo" | "video";
  readonly expiresAt: string;
  readonly position: number;
  readonly mediaSize: number;
  readonly durationSeconds?: number;
  readonly posterSize?: number;
}

export type { StoryMultipartMetadata };

export interface MultipartStoryFile {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentLength: number;
  readonly contentType: string;
  readonly kind: StoryPart;
}

export interface ReadStoryMultipartOptions {
  /** One request-scoped instant shared with final domain insertion. */
  readonly now: Date;
  readonly maxBytes: number;
  readonly provider: ProviderId;
  readonly upload: (file: MultipartStoryFile) => Promise<void>;
}

/** Typed 400 protocol error raised before a rejected file stream is bridged. */
export class StoryMultipartValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly {
      readonly message: string;
      readonly path: readonly string[];
    }[] = [],
  ) {
    super(message);
    this.name = "StoryMultipartValidationError";
  }
}

interface ValidationIssueLike {
  readonly message: string;
  readonly path: readonly (number | string)[];
}

function isValidationError(value: unknown): value is {
  readonly issues: readonly ValidationIssueLike[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray(value.issues)
  );
}

function scalarIssue(
  path: string,
  message: string,
): StoryMultipartValidationError {
  return new StoryMultipartValidationError("Story metadata is invalid.", [
    { path: [path], message },
  ]);
}

function parsePositiveInteger(
  field: string,
  value: string | undefined,
  required: boolean,
): number | undefined {
  if (value === undefined) {
    if (required) throw scalarIssue(field, "is required");
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw scalarIssue(field, "must be a positive integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw scalarIssue(field, "must be a positive integer");
  }
  return parsed;
}

function parsePosition(value: string | undefined): number {
  if (value === undefined)
    throw scalarIssue(METADATA_FIELD.POSITION, "is required");
  if (!/^\d+$/.test(value)) {
    throw scalarIssue(
      METADATA_FIELD.POSITION,
      "must be a non-negative integer",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw scalarIssue(
      METADATA_FIELD.POSITION,
      "must be a non-negative integer",
    );
  }
  return parsed;
}

function parseMetadata(
  fields: ReadonlyMap<string, string>,
  now: Date,
): StoryMultipartMetadata {
  const type = fields.get(METADATA_FIELD.TYPE);
  if (type !== "photo" && type !== "video") {
    throw scalarIssue(METADATA_FIELD.TYPE, "must be photo or video");
  }
  const expiresAt = fields.get(METADATA_FIELD.EXPIRES_AT);
  if (expiresAt === undefined) {
    throw scalarIssue(METADATA_FIELD.EXPIRES_AT, "is required");
  }
  const durationSeconds = parsePositiveInteger(
    METADATA_FIELD.DURATION_SECONDS,
    fields.get(METADATA_FIELD.DURATION_SECONDS),
    false,
  );
  const posterSize = parsePositiveInteger(
    METADATA_FIELD.POSTER_SIZE,
    fields.get(METADATA_FIELD.POSTER_SIZE),
    false,
  );
  let parsed: StoryMultipartMetadata;
  try {
    const validated = parseStoryUploadMetadata(
      {
        type,
        expiresAt,
        position: parsePosition(fields.get(METADATA_FIELD.POSITION)),
        mediaSize: parsePositiveInteger(
          METADATA_FIELD.MEDIA_SIZE,
          fields.get(METADATA_FIELD.MEDIA_SIZE),
          true,
        ) as number,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(posterSize === undefined ? {} : { posterSize }),
      },
      { now },
    );
    parsed = {
      type: validated.type,
      expiresAt: validated.expiresAt,
      position: validated.position,
      mediaSize: validated.mediaSize,
      ...(validated.durationSeconds === undefined
        ? {}
        : { durationSeconds: validated.durationSeconds }),
      ...(validated.posterSize === undefined
        ? {}
        : { posterSize: validated.posterSize }),
    };
  } catch (error) {
    if (isValidationError(error)) {
      throw new StoryMultipartValidationError(
        "Story metadata is invalid.",
        error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      );
    }
    throw error;
  }
  return {
    type: parsed.type,
    expiresAt: parsed.expiresAt,
    position: parsed.position,
    mediaSize: parsed.mediaSize,
    ...(parsed.durationSeconds === undefined
      ? {}
      : { durationSeconds: parsed.durationSeconds }),
    ...(parsed.posterSize === undefined
      ? {}
      : { posterSize: parsed.posterSize }),
  };
}

function discard(part: MultipartFile): void {
  // Do not resume/drain a rejected part: metadata failures must not consume bytes.
  part.file.destroy();
}

function rejectFile(part: MultipartFile, message: string): never {
  discard(part);
  throw new StoryMultipartValidationError(message);
}

function isMediaMime(
  type: StoryMultipartMetadata["type"],
  mime: string,
): boolean {
  return type === "photo"
    ? mime.startsWith("image/")
    : mime.startsWith("video/");
}

function fileKind(part: MultipartFile): StoryPart | undefined {
  if (part.fieldname === STORY_PART.MEDIA) return STORY_PART.MEDIA;
  if (part.fieldname === STORY_PART.POSTER) return STORY_PART.POSTER;
  return undefined;
}

/**
 * Enforces the field-first multipart protocol without materializing a file. A file
 * is converted to a Web stream only after all required scalar metadata parses.
 */
export async function readStoryMultipart(
  request: FastifyRequest,
  options: ReadStoryMultipartOptions,
): Promise<StoryMultipartMetadata> {
  const fields = new Map<string, string>();
  let metadata: StoryMultipartMetadata | undefined;
  let sawFile = false;
  let sawMedia = false;
  let sawPoster = false;

  for await (const part of request.parts({
    limits: {
      fields: metadataFieldNames.size,
      files: 2,
      parts: metadataFieldNames.size + 2,
      // The reusable PR 10A guard, not Busboy truncation, owns per-part limits.
      fileSize: Number.MAX_SAFE_INTEGER,
    },
  })) {
    if (part.type === "field") {
      if (sawFile) {
        throw new StoryMultipartValidationError(
          "All scalar story metadata must precede file parts.",
        );
      }
      if (!metadataFieldNames.has(part.fieldname)) {
        throw new StoryMultipartValidationError(
          `Unsupported story metadata field "${part.fieldname}".`,
        );
      }
      if (fields.has(part.fieldname)) {
        throw new StoryMultipartValidationError(
          `Story metadata field "${part.fieldname}" must appear once.`,
        );
      }
      fields.set(part.fieldname, String(part.value));
      continue;
    }

    if (metadata === undefined) {
      try {
        metadata = parseMetadata(fields, options.now);
      } catch (error) {
        discard(part);
        throw error;
      }
    }
    sawFile = true;

    const kind = fileKind(part);
    if (kind === undefined) {
      rejectFile(part, `Unsupported story file field "${part.fieldname}".`);
    }
    if (kind === STORY_PART.MEDIA && sawMedia) {
      rejectFile(part, "A story request can contain only one media file.");
    }
    if (kind === STORY_PART.POSTER && (sawPoster || !sawMedia)) {
      rejectFile(part, "A poster must follow exactly one media file.");
    }
    if (kind === STORY_PART.POSTER && metadata.posterSize === undefined) {
      rejectFile(part, "posterSize is required before a poster file.");
    }
    if (
      kind === STORY_PART.MEDIA &&
      !isMediaMime(metadata.type, part.mimetype)
    ) {
      rejectFile(
        part,
        "The media file content type does not match the story type.",
      );
    }
    if (kind === STORY_PART.POSTER && part.mimetype !== "image/jpeg") {
      rejectFile(part, "Poster files must use image/jpeg content type.");
    }

    const contentLength =
      kind === STORY_PART.MEDIA ? metadata.mediaSize : metadata.posterSize;
    if (contentLength === undefined) {
      rejectFile(part, "A declared size is required before the file part.");
    }

    if (kind === STORY_PART.MEDIA) sawMedia = true;
    else sawPoster = true;
    // `Readable.toWeb` adapts the Node source; the guard remains unread until the
    // adapter starts pulling it. Neither this route nor the adapter buffers bytes.
    try {
      await options.upload({
        body: guardUploadBody(Readable.toWeb(part.file), {
          contentLength,
          maxBytes: options.maxBytes,
          provider: options.provider,
        }),
        contentLength,
        contentType: part.mimetype,
        kind,
      });
    } catch (error) {
      discard(part);
      throw error;
    }
  }

  metadata ??= parseMetadata(fields, options.now);
  if (!sawMedia) {
    throw new StoryMultipartValidationError(
      "A story request requires one media file.",
    );
  }
  if (metadata.posterSize !== undefined && !sawPoster) {
    throw new StoryMultipartValidationError(
      "posterSize was supplied without a poster file.",
    );
  }
  return metadata;
}
