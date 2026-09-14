// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const dist = resolve(import.meta.dirname, "../dist");
const runAfterBuild =
  globalThis.process?.env.STORIES_EMBED_VERIFY_BUNDLE === "1";
const describeBundle = runAfterBuild ? describe : describe.skip;

const builtJavaScriptFiles = () =>
  readdirSync(dist, { recursive: true }).filter((file) => file.endsWith(".js"));

describeBundle("stories embed distribution", () => {
  it("emits ESM entries, declarations, and a self-contained IIFE within the gzip budget", () => {
    const expectedFiles = [
      "index.js",
      "index.d.ts",
      "register.js",
      "register.d.ts",
      "stories-viewer.iife.js",
    ];
    const files = readdirSync(dist);
    expect(files).toEqual(expect.arrayContaining(expectedFiles));
    expect(
      files.some((file) => /\.(css|gif|jpe?g|png|svg|woff2?)$/u.test(file)),
    ).toBe(false);

    const iife = readFileSync(resolve(dist, "stories-viewer.iife.js"));
    expect(existsSync(resolve(dist, "stories-viewer.iife.js"))).toBe(true);
    expect(gzipSync(iife).byteLength).toBeLessThanOrEqual(50_000);
    expect(iife.toString("utf8")).not.toMatch(/(?:^|[;\n])\s*import\s/mu);
  });

  it("keeps SSR helpers out of every emitted JavaScript artifact", () => {
    for (const file of builtJavaScriptFiles()) {
      const source = readFileSync(resolve(dist, file), "utf8");
      expect(source).not.toContain("@lit-labs/ssr");
      expect(source).not.toContain("renderToString");
    }
  });

  it("keeps both ESM entries safe to import without browser globals", async () => {
    await expect(
      import(`${pathToFileURL(resolve(dist, "index.js")).href}?main`),
    ).resolves.toMatchObject({ defineStoriesViewer: expect.any(Function) });
    await expect(
      import(`${pathToFileURL(resolve(dist, "register.js")).href}?register`),
    ).resolves.toBeDefined();
  });
});
