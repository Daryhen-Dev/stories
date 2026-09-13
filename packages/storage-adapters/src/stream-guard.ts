import { AdapterError } from "./errors.js";
import type { ProviderId, UploadInput } from "./types.js";

/** D9 default: 200 MB per media or poster part. */
export const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export type StreamLengthFailureReason =
  | "ACTUAL_SIZE_EXCEEDS_LIMIT"
  | "DECLARED_SIZE_EXCEEDS_LIMIT"
  | "INVALID_CONFIGURATION"
  | "INVALID_DECLARED_SIZE"
  | "OVERFLOW"
  | "SOURCE_FAILURE"
  | "UNDERFLOW";

export interface GuardUploadBodyOptions {
  /** Required adapter contract value, declared before the multipart file part. */
  readonly contentLength: number;
  /** Per-part ceiling; callers resolve configuration such as STORIES_MAX_UPLOAD_MB. */
  readonly maxBytes?: number;
  readonly provider: ProviderId;
}

/**
 * Typed streaming-length failure. It remains an AdapterError so callers never
 * need a second provider-error boundary, while `reason` lets the route map a
 * declared or actual size violation to its typed HTTP response.
 */
export class StreamLengthError extends AdapterError {
  constructor(
    provider: ProviderId,
    readonly reason: StreamLengthFailureReason,
    message: string,
  ) {
    super("UPLOAD_FAILED", provider, message);
    this.name = "StreamLengthError";
  }
}

const streamFor = (body: UploadInput["body"]): ReadableStream<Uint8Array> => {
  if (!(body instanceof Uint8Array)) return body;

  let emitted = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted) {
        controller.close();
        return;
      }
      emitted = true;
      controller.enqueue(body);
    },
  });
};

const invalidOption = (
  provider: ProviderId,
  reason: StreamLengthFailureReason,
  message: string,
): never => {
  throw new StreamLengthError(provider, reason, message);
};

/**
 * Wraps an upload body in a byte-counting stream without collecting it. The
 * source is not read or locked until the returned stream is consumed, allowing
 * callers to validate multipart metadata before any file byte is touched.
 */
export const guardUploadBody = (
  body: UploadInput["body"],
  options: GuardUploadBodyOptions,
): ReadableStream<Uint8Array> => {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (
    !Number.isSafeInteger(options.contentLength) ||
    options.contentLength < 0
  ) {
    return invalidOption(
      options.provider,
      "INVALID_DECLARED_SIZE",
      "Upload contentLength must be a non-negative safe integer.",
    );
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    return invalidOption(
      options.provider,
      "INVALID_CONFIGURATION",
      "Upload maximum size must be a non-negative safe integer.",
    );
  }
  if (options.contentLength > maxBytes) {
    return invalidOption(
      options.provider,
      "DECLARED_SIZE_EXCEEDS_LIMIT",
      `Upload declares ${options.contentLength} bytes, exceeding the ${maxBytes}-byte limit.`,
    );
  }

  const source = streamFor(body);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let received = 0;

  const cancelSource = async (reason?: Error): Promise<void> => {
    try {
      if (reader) await reader.cancel(reason);
      else await source.cancel(reason);
    } catch {
      // The length error remains authoritative when a source refuses cancellation.
    }
  };

  const fail = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: StreamLengthError,
  ): Promise<void> => {
    await cancelSource(error);
    controller.error(error);
  };

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          reader ??= source.getReader();
          const next = await reader.read();
          if (next.done) {
            if (received !== options.contentLength) {
              await fail(
                controller,
                new StreamLengthError(
                  options.provider,
                  "UNDERFLOW",
                  `Upload ended at ${received} bytes; expected ${options.contentLength}.`,
                ),
              );
              return;
            }
            controller.close();
            return;
          }

          const nextLength = received + next.value.byteLength;
          if (nextLength > maxBytes) {
            await fail(
              controller,
              new StreamLengthError(
                options.provider,
                "ACTUAL_SIZE_EXCEEDS_LIMIT",
                `Upload exceeded the ${maxBytes}-byte limit while streaming.`,
              ),
            );
            return;
          }
          if (nextLength > options.contentLength) {
            await fail(
              controller,
              new StreamLengthError(
                options.provider,
                "OVERFLOW",
                `Upload exceeded its declared ${options.contentLength}-byte length.`,
              ),
            );
            return;
          }

          received = nextLength;
          controller.enqueue(next.value);
        } catch (caught) {
          const error =
            caught instanceof StreamLengthError
              ? caught
              : new StreamLengthError(
                  options.provider,
                  "SOURCE_FAILURE",
                  "Upload stream failed before its declared length could be verified.",
                );
          await fail(controller, error);
        }
      },
      cancel(reason) {
        return cancelSource(reason instanceof Error ? reason : undefined);
      },
    },
    { highWaterMark: 0 },
  );
};
