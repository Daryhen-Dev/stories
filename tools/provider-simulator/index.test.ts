import { afterEach, describe, expect, it } from "vitest";

import { createProviderSimulator, type ProviderSimulator } from "./index.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

let simulator: ProviderSimulator | undefined;

const start = async (): Promise<ProviderSimulator> => {
  simulator = await createProviderSimulator();
  return simulator;
};

afterEach(async () => {
  await simulator?.close();
  simulator = undefined;
});

describe("provider simulator (MSA R7 — static store with D9 cache metadata)", () => {
  it("GET serves stored bytes at nested keys", async () => {
    const sim = await start();
    sim.put("stories.json", {
      body: bytes('{"version":1}'),
      contentType: "application/json",
      cacheControlSeconds: 60,
    });
    const response = await fetch(`${sim.url}/stories.json`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"version":1}');
  });

  it("mirrors stored Cache-Control: manifest 60 and media 31536000 immutable (D9)", async () => {
    const sim = await start();
    sim.put("stories.json", {
      body: bytes("{}"),
      contentType: "application/json",
      cacheControlSeconds: 60,
    });
    sim.put("stories/s1/media.mp4", {
      body: bytes("m"),
      contentType: "video/mp4",
      cacheControlSeconds: 31536000,
    });
    expect(
      (await fetch(`${sim.url}/stories.json`)).headers.get("cache-control"),
    ).toBe("public, max-age=60");
    expect(
      (await fetch(`${sim.url}/stories/s1/media.mp4`)).headers.get(
        "cache-control",
      ),
    ).toBe("public, max-age=31536000, immutable");
  });

  it("serves ranged GETs as 206 partial content with Content-Range", async () => {
    const sim = await start();
    const media = bytes("abcdefghijklmnopqrstuvwxyz");
    sim.put("stories/s1/media.mp4", {
      body: media,
      contentType: "video/mp4",
      cacheControlSeconds: 31536000,
    });
    const ranged = await fetch(`${sim.url}/stories/s1/media.mp4`, {
      headers: { Range: "bytes=2-5" },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 2-5/26");
    expect(ranged.headers.get("content-length")).toBe("4");
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(
      media.slice(2, 6),
    );
  });

  it("returns 404 for unknown keys", async () => {
    const sim = await start();
    sim.put("stories.json", {
      body: bytes("{}"),
      contentType: "application/json",
      cacheControlSeconds: 60,
    });
    const response = await fetch(`${sim.url}/stories/missing.bin`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("passes stored content types through on public reads", async () => {
    const sim = await start();
    sim.put("stories/s1/poster.jpg", {
      body: bytes("jpeg-bytes"),
      contentType: "image/jpeg",
      cacheControlSeconds: 31536000,
    });
    const response = await fetch(`${sim.url}/stories/s1/poster.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("HEAD matches GET headers without a body (head-vs-get consistency)", async () => {
    const sim = await start();
    sim.put("stories.json", {
      body: bytes('{"version":1}'),
      contentType: "application/json",
      cacheControlSeconds: 60,
    });
    const get = await fetch(`${sim.url}/stories.json`);
    const head = await fetch(`${sim.url}/stories.json`, { method: "HEAD" });
    expect(head.status).toBe(get.status);
    expect(head.headers.get("cache-control")).toBe(
      get.headers.get("cache-control"),
    );
    expect(head.headers.get("content-type")).toBe(
      get.headers.get("content-type"),
    );
    expect(head.headers.get("content-length")).toBe(
      get.headers.get("content-length"),
    );
    expect(await head.text()).toBe("");
  });

  it("serves suffix ranges and rejects unsatisfiable ranges with 416", async () => {
    const sim = await start();
    const media = bytes("abcdefghijklmnopqrstuvwxyz");
    sim.put("stories/s1/media.mp4", {
      body: media,
      contentType: "video/mp4",
      cacheControlSeconds: 31536000,
    });
    const suffix = await fetch(`${sim.url}/stories/s1/media.mp4`, {
      headers: { Range: "bytes=-4" },
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 22-25/26");
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(
      media.slice(22, 26),
    );
    const unsatisfiable = await fetch(`${sim.url}/stories/s1/media.mp4`, {
      headers: { Range: "bytes=99-" },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe("bytes */26");
  });
});
