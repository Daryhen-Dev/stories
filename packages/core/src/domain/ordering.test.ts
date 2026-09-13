import { describe, expect, it } from "vitest";

import { compareStories, type OrderedStory } from "./ordering.js";

const T0 = 1_800_000_000_000;

function story(position: number, createdAtMs: number): OrderedStory {
  return { position, createdAt: new Date(createdAtMs) };
}

describe("compareStories (SL R5)", () => {
  it("breaks position ties newest-first (createdAt desc)", () => {
    const older = story(0, T0);
    const newer = story(0, T0 + 5_000);
    expect(compareStories(newer, older)).toBeLessThan(0);
    expect(compareStories(older, newer)).toBeGreaterThan(0);
  });

  it("orders lower positions first regardless of creation order", () => {
    const first = story(0, T0 + 9_000); // created last, position 0
    const second = story(1, T0); // created first, position 1
    expect(compareStories(first, second)).toBeLessThan(0);
  });

  it("sorts a mixed list by position asc with the newest-first tiebreak", () => {
    const rows = [
      story(2, T0),
      story(0, T0 + 5_000),
      story(1, T0),
      story(0, T0),
    ];
    const sorted = [...rows].sort(compareStories);
    expect(sorted).toEqual([
      story(0, T0 + 5_000),
      story(0, T0),
      story(1, T0),
      story(2, T0),
    ]);
  });

  it("returns 0 for identical position and createdAt", () => {
    expect(compareStories(story(3, T0), story(3, T0))).toBe(0);
  });
});
