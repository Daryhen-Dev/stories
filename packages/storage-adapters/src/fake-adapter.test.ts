import { describe, expect, it } from "vitest";

import {
  createFakeStorageAdapter,
  type FakeStorageAdapter,
} from "./fake-adapter.js";
import { textBytes } from "./testing.js";

const adapter = (): FakeStorageAdapter =>
  createFakeStorageAdapter({
    bucket: "stories-bucket",
    publicBaseUrl:
      "https://cdn.example.com/storage/v1/object/public/stories-bucket",
  });

/** Minimal single-chunk stream so the fake proves it consumes stream bodies. */
const streamOf = (chunk: Uint8Array): ReadableStream<Uint8Array> => {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) controller.close();
      else {
        controller.enqueue(chunk);
        sent = true;
      }
    },
  });
};

describe("fakeStorageAdapter (MSA R1/R3 — round-trip, verify, delete)", () => {
  it("upload → verify round-trip preserves size and content type (Uint8Array and stream bodies)", async () => {
    const a = adapter();
    const media = textBytes("story media bytes");
    await a.upload({
      key: "stories/s1/media.mp4",
      body: media,
      contentType: "video/mp4",
      contentLength: media.byteLength,
      cacheControlSeconds: 31536000,
    });
    expect(
      await a.verify("stories/s1/media.mp4", {
        size: media.byteLength,
        contentType: "video/mp4",
      }),
    ).toEqual({ ok: true, size: media.byteLength, contentType: "video/mp4" });

    const manifest = textBytes("streamed manifest bytes");
    await a.upload({
      key: "stories.json",
      body: streamOf(manifest),
      contentType: "application/json",
      contentLength: manifest.byteLength,
      cacheControlSeconds: 60,
    });
    expect(
      await a.verify("stories.json", {
        size: manifest.byteLength,
        contentType: "application/json",
      }),
    ).toEqual({
      ok: true,
      size: manifest.byteLength,
      contentType: "application/json",
    });
  });

  it("verify mismatch fails with VERIFY_MISMATCH naming the mismatched property", async () => {
    const a = adapter();
    const body = textBytes("0123456789");
    await a.upload({
      key: "k",
      body,
      contentType: "text/plain",
      contentLength: 10,
      cacheControlSeconds: 60,
    });
    const sizeMismatch = await a.verify("k", { size: 11 });
    expect(sizeMismatch).toEqual({
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: expect.stringMatching(/\bsize\b/),
    });
    const typeMismatch = await a.verify("k", { contentType: "video/mp4" });
    expect(typeMismatch).toEqual({
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: expect.stringMatching(/\bcontent.?type\b/i),
    });
  });

  it("verify of an unknown key reports OBJECT_NOT_FOUND", async () => {
    expect(await adapter().verify("missing.bin")).toEqual({
      ok: false,
      code: "OBJECT_NOT_FOUND",
      detail: expect.any(String),
    });
  });

  it("delete removes the object; deleting a missing key reports OBJECT_NOT_FOUND", async () => {
    const a = adapter();
    const body = textBytes("to delete");
    await a.upload({
      key: "k",
      body,
      contentType: "text/plain",
      contentLength: 9,
      cacheControlSeconds: 60,
    });
    await a.delete("k");
    expect(await a.verify("k")).toEqual({
      ok: false,
      code: "OBJECT_NOT_FOUND",
      detail: expect.any(String),
    });
    await expect(a.delete("k")).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    });
  });
});

describe("fakeStorageAdapter (MSA R2/R5/R7 — probe, auth, cache-control)", () => {
  it("checkPublicRead distinguishes public and non-public buckets", async () => {
    expect(await adapter().checkPublicRead()).toEqual({
      ok: true,
      httpStatus: 200,
    });

    const nonPublic = createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com",
      publicBucket: false,
    });
    const failed = await nonPublic.checkPublicRead();
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.code).toBe("BUCKET_NOT_PUBLIC");
      expect(failed.remediation).toBeTruthy();
    }
  });

  it("bad-credential simulation surfaces AUTH_FAILED with remediation for auth-requiring operations", async () => {
    const a = createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com",
      authFailure: true,
    });
    const raised = await a
      .upload({
        key: "k",
        body: textBytes("x"),
        contentType: "text/plain",
        contentLength: 1,
        cacheControlSeconds: 60,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(raised).toMatchObject({
      code: "AUTH_FAILED",
      remediation: expect.any(String),
    });
    await expect(a.verify("k")).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await expect(a.delete("k")).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });

  it("records cacheControlSeconds per upload as object metadata", async () => {
    const a = adapter();
    const body = textBytes("m");
    await a.upload({
      key: "stories.json",
      body,
      contentType: "application/json",
      contentLength: 1,
      cacheControlSeconds: 60,
    });
    expect(a.stored.get("stories.json")?.cacheControlSeconds).toBe(60);
    await a.upload({
      key: "media.bin",
      body,
      contentType: "video/mp4",
      contentLength: 1,
      cacheControlSeconds: 31536000,
    });
    expect(a.stored.get("media.bin")?.cacheControlSeconds).toBe(31536000);
  });

  it("publicUrl builds a deterministic URL from publicBaseUrl without network access", () => {
    const a = adapter();
    expect(a.publicUrl("stories/s1/media.mp4")).toBe(
      "https://cdn.example.com/storage/v1/object/public/stories-bucket/stories/s1/media.mp4",
    );
    expect(a.publicUrl("stories/s1/media.mp4")).toBe(
      a.publicUrl("stories/s1/media.mp4"),
    );
  });
});
