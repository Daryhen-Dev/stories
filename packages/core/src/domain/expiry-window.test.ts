import { describe, expect, it } from "vitest";

import { NOW_MS } from "../db/testing.js";
import {
  MAX_EXPIRY_WINDOW_MS,
  MIN_EXPIRY_WINDOW_MS,
  expiryWindowSchema,
  isWithinExpiryWindow,
} from "./expiry-window.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** ISO-8601 Z form for an instant `offsetMs` relative to the fixture "now". */
function iso(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

describe("expiryWindowSchema (SL R3, D9)", () => {
  it("accepts an expiry exactly 24 hours in the future (inclusive boundary)", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(
      iso(24 * HOUR_MS),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts an expiry exactly 30 days in the future (inclusive boundary)", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(
      iso(30 * DAY_MS),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts an expiry between the bounds", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(
      iso(7 * DAY_MS),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts instants one millisecond inside both bounds", () => {
    const schema = expiryWindowSchema(new Date(NOW_MS));
    expect(schema.safeParse(iso(24 * HOUR_MS + 1)).success).toBe(true);
    expect(schema.safeParse(iso(30 * DAY_MS - 1)).success).toBe(true);
  });

  it("rejects a 12-hour expiry as too short", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(
      iso(12 * HOUR_MS),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("24 hours");
    }
  });

  it("rejects a 45-day expiry as too long", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(
      iso(45 * DAY_MS),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("30 days");
    }
  });

  it("rejects instants one millisecond outside both bounds", () => {
    const schema = expiryWindowSchema(new Date(NOW_MS));
    expect(schema.safeParse(iso(24 * HOUR_MS - 1)).success).toBe(false);
    expect(schema.safeParse(iso(30 * DAY_MS + 1)).success).toBe(false);
  });

  it("rejects a past instant", () => {
    const schema = expiryWindowSchema(new Date(NOW_MS));
    expect(schema.safeParse(iso(-1 * DAY_MS)).success).toBe(false);
  });

  it("rejects a non-UTC offset form (+02:00)", () => {
    const offsetForm = iso(7 * DAY_MS).replace("Z", "+02:00");
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(offsetForm);
    expect(parsed.success).toBe(false);
  });

  it("rejects a naive timestamp without the Z suffix", () => {
    const naive = iso(7 * DAY_MS).replace("Z", "");
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse(naive);
    expect(parsed.success).toBe(false);
  });

  it("rejects a value that is not a date at all", () => {
    const parsed = expiryWindowSchema(new Date(NOW_MS)).safeParse("not-a-date");
    expect(parsed.success).toBe(false);
  });

  it("defaults the reference clock to the current instant", () => {
    const schema = expiryWindowSchema();
    expect(
      schema.safeParse(new Date(Date.now() + 25 * HOUR_MS).toISOString())
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(new Date(Date.now() + 2 * HOUR_MS).toISOString())
        .success,
    ).toBe(false);
  });
});

describe("isWithinExpiryWindow (pure helper)", () => {
  it("is inclusive at both bounds and exclusive outside them", () => {
    expect(isWithinExpiryWindow(NOW_MS + MIN_EXPIRY_WINDOW_MS, NOW_MS)).toBe(
      true,
    );
    expect(isWithinExpiryWindow(NOW_MS + MAX_EXPIRY_WINDOW_MS, NOW_MS)).toBe(
      true,
    );
    expect(
      isWithinExpiryWindow(NOW_MS + MIN_EXPIRY_WINDOW_MS - 1, NOW_MS),
    ).toBe(false);
    expect(
      isWithinExpiryWindow(NOW_MS + MAX_EXPIRY_WINDOW_MS + 1, NOW_MS),
    ).toBe(false);
  });

  it("rejects past instants", () => {
    expect(isWithinExpiryWindow(NOW_MS - 1, NOW_MS)).toBe(false);
  });
});
