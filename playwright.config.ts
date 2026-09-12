import { defineConfig } from "@playwright/test";

// Placeholder config (design B5): the stories change owns e2e specs, browser
// installation, and any webServer wiring. This file only proves the config
// parses; browsers are intentionally NOT downloaded here.
export default defineConfig({
  testDir: "./tests/e2e",
});
