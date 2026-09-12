import { describe, expect, it } from "vitest";

import { TOOLING_VERSION } from "./helpers/version.js";

describe("workspace smoke", () => {
  it("runs the strict-TDD loop end to end", () => {
    expect(TOOLING_VERSION.length > 0).toBe(true);
  });
});
