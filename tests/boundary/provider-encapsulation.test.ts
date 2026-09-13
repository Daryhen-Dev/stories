import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ALLOWED_PREFIX = "packages/storage-adapters/";
// Import-like occurrences only: static/side-effect/type imports, dynamic
// import(), require(), and re-exports — not prose or rule definitions that
// merely mention the package (e.g. the ESLint restriction itself).
const PROVIDER_IMPORT =
  /(?:\bfrom\s*["']|\bimport\s*\(?\s*["']|\brequire\s*\(\s*["'])@supabase\//;
const SKIP_DIRS = new Set([
  ".atl",
  ".git",
  ".pi",
  ".vitest",
  "coverage",
  "dist",
  "node_modules",
  "openspec",
  "playwright-report",
  "test-results",
]);
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

interface ScannedFile {
  readonly path: string;
  readonly contents: string;
}

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly sourceLine: string;
}

/**
 * Pure scanner (MSA R5): provider SDK imports outside the adapter package are
 * violations. Unit-fed with synthetic files, then run over the real tree.
 */
export const scanProviderImports = (
  files: readonly ScannedFile[],
): Violation[] => {
  const violations: Violation[] = [];
  for (const file of files) {
    if (file.path.startsWith(ALLOWED_PREFIX)) continue;
    file.contents.split("\n").forEach((line, index) => {
      if (PROVIDER_IMPORT.test(line)) {
        violations.push({
          path: file.path,
          line: index + 1,
          sourceLine: line.trim(),
        });
      }
    });
  }
  return violations;
};

const collectFiles = (dir: string): ScannedFile[] => {
  const files: ScannedFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name))
        files.push(...collectFiles(join(dir, entry.name)));
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
      continue;
    const absolute = join(dir, entry.name);
    files.push({
      path: relative(repoRoot, absolute).split(sep).join("/"),
      contents: readFileSync(absolute, "utf8"),
    });
  }
  return files;
};

describe("provider encapsulation boundary (MSA R5)", () => {
  // Assembled so this file's own source never contains a literal provider
  // import — the real-tree scan below must stay clean without exclusions.
  const PROVIDER_PACKAGE = "@supabase";
  const leaking = `import { createClient } from "${PROVIDER_PACKAGE}/supabase-js";`;

  it("fails when a package outside packages/storage-adapters imports the provider SDK", () => {
    const violations = scanProviderImports([
      { path: "packages/core/src/leak.ts", contents: leaking },
      {
        path: "packages/storage-adapters/src/reference-adapter.ts",
        contents: leaking,
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("packages/core/src/leak.ts");
  });

  it("scanning the real tree yields zero provider-SDK imports outside the adapter package", () => {
    const violations = scanProviderImports(collectFiles(repoRoot));
    expect(violations).toEqual([]);
  });

  it("the ESLint no-restricted-imports rule mechanically blocks @supabase/* outside the package", () => {
    const config = readFileSync(join(repoRoot, "eslint.config.js"), "utf8");
    expect(config).toMatch(/no-restricted-imports/);
    expect(config).toMatch(/@supabase\/\*/);
    expect(config).toMatch(/packages\/storage-adapters/);
  });
});
