import { describe, expect, it } from "vitest";

import { filterActiveStories } from "./manifest-model.js";

const PROJECT_ID = "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c";
const NOW = new Date("2026-09-13T12:00:00Z");

const story = (
  id: string,
  overrides: {
    readonly expiresAt: string;
    readonly position: number;
    readonly posterUrl?: string;
  },
) => ({
  id,
  type: "video" as const,
  mediaUrl: `https://cdn.example.com/stories/${id}/media.mp4`,
  createdAt: "2026-09-13T10:00:00Z",
  ...overrides,
});

const manifest = (stories: ReturnType<typeof story>[]) => ({
  version: 1 as const,
  projectId: PROJECT_ID,
  generatedAt: "2026-09-13T12:00:00Z",
  stories,
});

describe("filterActiveStories (SEV R2 / R3)", () => {
  it("filters stories expired at the clock boundary and preserves manifest order with poster distinction", () => {
    const first = story("3f2504e0-4f89-11d3-9a0c-0305e82c3301", {
      expiresAt: "2026-09-13T13:00:00Z",
      position: 99,
      posterUrl:
        "https://cdn.example.com/stories/3f2504e0-4f89-11d3-9a0c-0305e82c3301/poster.jpg",
    });
    const second = story("4f2504e0-4f89-11d3-9a0c-0305e82c3302", {
      expiresAt: "2026-09-14T12:00:00Z",
      position: 0,
    });
    const expiredAtNow = story("5f2504e0-4f89-11d3-9a0c-0305e82c3303", {
      expiresAt: "2026-09-13T12:00:00Z",
      position: 1,
    });

    const result = filterActiveStories(
      manifest([first, second, expiredAtNow]),
      NOW,
    );

    expect(result.stories.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(result.stories[0]?.posterUrl).toBe(first.posterUrl);
    expect(Object.hasOwn(result.stories[1] ?? {}, "posterUrl")).toBe(false);
  });

  it("uses each supplied clock strictly rather than retaining a near-boundary story", () => {
    const expiringStory = story("6f2504e0-4f89-11d3-9a0c-0305e82c3304", {
      expiresAt: "2026-09-13T12:00:01Z",
      position: 7,
    });
    const validStory = story("7f2504e0-4f89-11d3-9a0c-0305e82c3305", {
      expiresAt: "2026-09-13T12:01:00Z",
      position: 2,
    });
    const input = manifest([expiringStory, validStory]);

    const justBeforeExpiry = filterActiveStories(input, NOW);
    const atExpiry = filterActiveStories(
      input,
      new Date("2026-09-13T12:00:01Z"),
    );

    expect(
      justBeforeExpiry.stories.map((item: { readonly id: string }) => item.id),
    ).toEqual([expiringStory.id, validStory.id]);
    expect(
      atExpiry.stories.map((item: { readonly id: string }) => item.id),
    ).toEqual([validStory.id]);
  });
});
