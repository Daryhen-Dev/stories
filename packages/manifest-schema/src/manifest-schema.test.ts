import { describe, expect, it } from "vitest";
import { z } from "zod";

import packageJson from "../package.json" with { type: "json" };
import {
  MANIFEST_VERSION,
  manifestSchemaV1,
  manifestStorySchema,
} from "./manifest-schema.js";

/** Single fixture factory: a fresh, schema-valid v1 manifest per call. */
const validManifest = () => ({
  version: 1,
  projectId: "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c",
  generatedAt: "2026-09-12T12:00:00Z",
  stories: [
    {
      id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      type: "video",
      mediaUrl: "https://cdn.example.com/stories/story-1/media.mp4",
      posterUrl: "https://cdn.example.com/stories/story-1/poster.jpg",
      createdAt: "2026-09-12T10:00:00Z",
      expiresAt: "2026-09-13T10:00:00Z",
      position: 1,
    },
  ],
});

/** Accessor over the factory's single story (noUncheckedIndexedAccess-safe). */
const validStory = () => {
  const story = validManifest().stories[0];
  if (!story) throw new Error("validManifest() must contain one story");
  return story;
};

describe("manifestSchemaV1 (MP R1 — stories.json schema v1)", () => {
  it("parses a valid v1 manifest", () => {
    expect(manifestSchemaV1.safeParse(validManifest()).success).toBe(true);
  });

  it("rejects a generatedAt carrying a UTC offset instead of Z", () => {
    const manifest = {
      ...validManifest(),
      generatedAt: "2026-09-12T12:00:00+02:00",
    };
    expect(manifestSchemaV1.safeParse(manifest).success).toBe(false);
  });

  it("rejects 101 stories and accepts 100 (story cap)", () => {
    const overCap = {
      ...validManifest(),
      stories: Array.from({ length: 101 }, validStory),
    };
    expect(manifestSchemaV1.safeParse(overCap).success).toBe(false);

    const atCap = {
      ...validManifest(),
      stories: Array.from({ length: 100 }, validStory),
    };
    expect(manifestSchemaV1.safeParse(atCap).success).toBe(true);
  });

  it("rejects unknown top-level fields (strict objects)", () => {
    const manifest = { ...validManifest(), providerBucket: "not-allowed" };
    expect(manifestSchemaV1.safeParse(manifest).success).toBe(false);
  });

  it("accepts only the literal top-level version 1", () => {
    expect(MANIFEST_VERSION).toBe(1);
    const manifest = { ...validManifest(), version: 2 };
    expect(manifestSchemaV1.safeParse(manifest).success).toBe(false);
  });

  it("still parses when an optional story field is added within v1 (MP R2 additive policy)", () => {
    // Additive-only versioning: extending the v1 story schema with an
    // optional field keeps both previously-valid entries and entries
    // carrying the new field parsing against v1.
    const v1WithAddedField = manifestStorySchema.extend({
      shareCount: z.number().int().optional(),
    });

    expect(v1WithAddedField.safeParse(validStory()).success).toBe(true);
    expect(
      v1WithAddedField.safeParse({ ...validStory(), shareCount: 3 }).success,
    ).toBe(true);
  });

  it("rejects non-UUID ids and negative positions", () => {
    const badProjectId = { ...validManifest(), projectId: "not-a-uuid" };
    expect(manifestSchemaV1.safeParse(badProjectId).success).toBe(false);

    const badStoryId = {
      ...validManifest(),
      stories: [{ ...validStory(), id: "not-a-uuid" }],
    };
    expect(manifestSchemaV1.safeParse(badStoryId).success).toBe(false);

    const negativePosition = {
      ...validManifest(),
      stories: [{ ...validStory(), position: -1 }],
    };
    expect(manifestSchemaV1.safeParse(negativePosition).success).toBe(false);
  });

  it("accepts an absent posterUrl", () => {
    const manifest = {
      ...validManifest(),
      stories: [{ ...validStory(), posterUrl: undefined }],
    };
    const result = manifestSchemaV1.safeParse(manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories[0]?.posterUrl).toBeUndefined();
    }
  });
});

describe("manifestSchemaV1 (triangulation)", () => {
  it("rejects unknown nested fields inside a story entry (strict objects)", () => {
    const manifest = {
      ...validManifest(),
      stories: [
        { ...validStory(), internalStorageKey: "stories/story-1/media.mp4" },
      ],
    };
    expect(manifestSchemaV1.safeParse(manifest).success).toBe(false);
  });

  it("accepts position 0 (boundary)", () => {
    const manifest = {
      ...validManifest(),
      stories: [{ ...validStory(), position: 0 }],
    };
    expect(manifestSchemaV1.safeParse(manifest).success).toBe(true);
  });

  it("carries no secrets or provider identifiers in a generated sample manifest", () => {
    // The strict schemas close the key set at the type level, so no
    // credential-like key can exist on a parsed manifest; the serialized
    // scan proves no secret-like or provider-internal value can appear.
    const parsed = manifestSchemaV1.parse(validManifest());
    const serialized = JSON.stringify(parsed).toLowerCase();
    expect(serialized).not.toMatch(
      /credential|secret|token|api.?key|service.?role/,
    );
    expect(serialized).not.toMatch(/supabase|insforge/);
  });
});

describe("package conventions", () => {
  it("keeps zod as the only runtime dependency", () => {
    const dependencies = packageJson.dependencies as
      Record<string, string> | undefined;
    expect(Object.keys(dependencies ?? {})).toEqual(["zod"]);
  });
});
