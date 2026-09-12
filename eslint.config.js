import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// Minimal flat config (design B4): typescript-eslint recommended for
// correctness, Prettier owns all formatting (eslint-config-prettier disables
// any overlapping stylistic rules).
export default tseslint.config(
  {
    ignores: [
      "dist/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "openspec/",
      ".atl/",
      ".pi/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
);
