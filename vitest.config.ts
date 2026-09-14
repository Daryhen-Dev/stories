import { defineConfig } from "vitest/config";

// Single runner process for the whole workspace (design B3). Product packages
// may add per-package configs later without changing this root file.
export default defineConfig({
  test: {
    include: [
      "packages/**/tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
      "apps/**/*.test.ts",
      "e2e/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
  },
});
