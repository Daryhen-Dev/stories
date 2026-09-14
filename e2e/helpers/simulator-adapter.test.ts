import { afterEach, describe, expect, it } from "vitest";

import {
  createProviderSimulator,
  type ProviderSimulator,
} from "../../tools/provider-simulator/index.js";
import { createSimulatorStorageAdapter } from "./simulator-adapter.js";

const textBytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

const stream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

describe("simulator storage adapter", () => {
  let simulator: ProviderSimulator | undefined;

  afterEach(async () => {
    await simulator?.close();
    simulator = undefined;
  });

  it("uploads streams, verifies through HEAD, and exposes a deterministic public URL", async () => {
    simulator = await createProviderSimulator();
    const adapter = createSimulatorStorageAdapter({
      simulator,
      bucket: "stories-bucket",
      publicReadKey: "stories/photo-1/media.jpg",
    });
    const body = textBytes("photo bytes");

    await adapter.upload({
      key: "stories/photo-1/media.jpg",
      body: stream(body),
      contentType: "image/jpeg",
      contentLength: body.byteLength,
      cacheControlSeconds: 31_536_000,
    });

    expect(adapter.publicUrl("stories/photo-1/media.jpg")).toBe(
      `${simulator.url}/stories/photo-1/media.jpg`,
    );
    await expect(
      adapter.verify("stories/photo-1/media.jpg", {
        size: body.byteLength,
        contentType: "image/jpeg",
      }),
    ).resolves.toEqual({
      ok: true,
      size: body.byteLength,
      contentType: "image/jpeg",
    });
  });

  it("normalizes missing objects and upload length mismatches as AdapterError", async () => {
    simulator = await createProviderSimulator();
    const adapter = createSimulatorStorageAdapter({
      simulator,
      bucket: "stories-bucket",
      publicReadKey: "stories/photo-1/media.jpg",
    });

    await expect(adapter.delete("stories/missing.jpg")).rejects.toMatchObject({
      name: "AdapterError",
      code: "OBJECT_NOT_FOUND",
      provider: "supabase",
    });
    await expect(
      adapter.upload({
        key: "stories/photo-1/media.jpg",
        body: textBytes("one"),
        contentType: "image/jpeg",
        contentLength: 4,
        cacheControlSeconds: 31_536_000,
      }),
    ).rejects.toMatchObject({
      name: "AdapterError",
      code: "UPLOAD_FAILED",
    });
  });

  it("checks the uploaded object through public GET", async () => {
    simulator = await createProviderSimulator();
    const adapter = createSimulatorStorageAdapter({
      simulator,
      bucket: "stories-bucket",
      publicReadKey: "stories/photo-1/media.jpg",
    });
    await adapter.upload({
      key: "stories/photo-1/media.jpg",
      body: textBytes("photo bytes"),
      contentType: "image/jpeg",
      contentLength: 11,
      cacheControlSeconds: 31_536_000,
    });

    await expect(adapter.checkPublicRead()).resolves.toEqual({
      ok: true,
      httpStatus: 200,
    });
  });
});
