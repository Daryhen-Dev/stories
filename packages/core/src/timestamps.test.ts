import { describe, expect, it } from "vitest";

import { toIsoUtcZ } from "./timestamps.js";

describe("toIsoUtcZ", () => {
  it("serializes an instant as ISO-8601 UTC with the Z suffix", () => {
    expect(toIsoUtcZ(new Date(1_799_971_200_000))).toBe(
      "2027-01-15T00:00:00.000Z",
    );
  });

  it("normalizes non-UTC offsets into UTC Z form", () => {
    expect(toIsoUtcZ(new Date("2027-01-15T01:30:00+02:00"))).toBe(
      "2027-01-14T23:30:00.000Z",
    );
  });
});
