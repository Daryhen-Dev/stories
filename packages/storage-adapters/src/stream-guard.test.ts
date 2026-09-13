import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_UPLOAD_BYTES,
  StreamLengthError,
  guardUploadBody,
} from "./stream-guard.js";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

/** Test-only collector: production forwarding must remain stream-based. */
const collect = async (
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    length += next.value.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const chunks = (...values: readonly string[]): ReadableStream<Uint8Array> => {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const value = values[index];
      index += 1;
      if (value === undefined) controller.close();
      else controller.enqueue(bytes(value));
    },
  });
};

describe("guardUploadBody (PR 10A declared-length streaming contract)", () => {
  it("rejects a declared size above the limit before reading the source", () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(bytes("x"));
      },
    });

    expect(() =>
      guardUploadBody(source, {
        contentLength: 2,
        maxBytes: 1,
        provider: "supabase",
      }),
    ).toThrow(StreamLengthError);
    expect(pulls).toBe(0);
  });

  it("does not pull or lock the source before a consumer reads the guard", async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(bytes("story"));
          else if (pulls === 2) controller.enqueue(bytes(" media"));
          else controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    const guarded = guardUploadBody(source, {
      contentLength: 11,
      maxBytes: DEFAULT_MAX_UPLOAD_BYTES,
      provider: "supabase",
    });

    await Promise.resolve();

    expect(pulls).toBe(0);
    expect(source.locked).toBe(false);
    expect(await collect(guarded)).toEqual(bytes("story media"));
    expect(pulls).toBeGreaterThanOrEqual(3);
  });

  it("rejects a source that ends before its declared size", async () => {
    const guarded = guardUploadBody(chunks("short"), {
      contentLength: 6,
      maxBytes: DEFAULT_MAX_UPLOAD_BYTES,
      provider: "supabase",
    });

    await expect(collect(guarded)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      reason: "UNDERFLOW",
    });
  });

  it("rejects a chunk that exceeds its declared size", async () => {
    const guarded = guardUploadBody(chunks("too long"), {
      contentLength: 3,
      maxBytes: DEFAULT_MAX_UPLOAD_BYTES,
      provider: "supabase",
    });

    await expect(collect(guarded)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      reason: "OVERFLOW",
    });
  });

  it("rejects actual bytes that exceed the configured limit despite a valid declaration", async () => {
    const guarded = guardUploadBody(chunks("123", "456"), {
      contentLength: 5,
      maxBytes: 5,
      provider: "supabase",
    });

    await expect(collect(guarded)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      reason: "ACTUAL_SIZE_EXCEEDS_LIMIT",
    });
  });

  it("keeps Uint8Array uploads compatible while still checking their size", async () => {
    const guarded = guardUploadBody(bytes("manifest"), {
      contentLength: 8,
      maxBytes: DEFAULT_MAX_UPLOAD_BYTES,
      provider: "supabase",
    });

    expect(await collect(guarded)).toEqual(bytes("manifest"));
  });
});
