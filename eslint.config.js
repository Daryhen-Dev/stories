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
  // MSA R5: provider SDK imports are confined to the adapter package; enforced
  // mechanically alongside tests/boundary/provider-encapsulation.test.ts.
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    ignores: ["packages/storage-adapters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*", "@supabase/*/**"],
              message:
                "Provider SDK clients/types may only be imported inside packages/storage-adapters (MSA R5).",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
