import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_SECRET = ["synthetic", "-", "leak", "-", "only"].join("");
const CREDENTIAL_FILE =
  /(?:^|\/)(?:\.env(?:\.[^/]+)?|credentials?\.(?:json|ya?ml|toml)|secrets?\.(?:json|ya?ml|toml)|[^/]+\.(?:pem|key|p12))$/i;
const PRIVATE_KEY = /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/;

interface ScannedFile {
  readonly path: string;
  readonly contents: string;
}

interface SecretFinding {
  readonly path: string;
  readonly reason: "credential-file" | "fixture-secret" | "private-key";
}

/**
 * PM R2 repository safeguard: only Git-tracked files are candidates, so ignored
 * local `.env*` files remain private to an operator and never affect the suite.
 */
export function scanForSecrets(
  files: readonly ScannedFile[],
  fixtureSecret: string,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (CREDENTIAL_FILE.test(file.path)) {
      findings.push({ path: file.path, reason: "credential-file" });
    }
    if (file.contents.includes(fixtureSecret)) {
      findings.push({ path: file.path, reason: "fixture-secret" });
    }
    if (PRIVATE_KEY.test(file.contents)) {
      findings.push({ path: file.path, reason: "private-key" });
    }
  }
  return findings;
}

function trackedFiles(): ScannedFile[] {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return tracked
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => ({
      path,
      contents: readFileSync(join(repoRoot, path), "utf8"),
    }));
}

describe("repository secret scan (PM R2)", () => {
  it("finds synthetic leaked content and credential-bearing file names", () => {
    const findings = scanForSecrets(
      [
        { path: "src/clean.ts", contents: "export const safe = true;" },
        { path: "docs/leak.txt", contents: `value=${FIXTURE_SECRET}` },
        { path: ".env.production", contents: "SAFE=false" },
        {
          path: "keys/operator.pem",
          contents: ["-----BEGIN", " PRIVATE KEY-----\\nmaterial"].join(""),
        },
      ],
      FIXTURE_SECRET,
    );

    expect(findings).toEqual([
      { path: "docs/leak.txt", reason: "fixture-secret" },
      { path: ".env.production", reason: "credential-file" },
      { path: "keys/operator.pem", reason: "credential-file" },
      { path: "keys/operator.pem", reason: "private-key" },
    ]);
  });

  it("finds no fixture secret or credential-bearing file in the tracked tree", () => {
    expect(scanForSecrets(trackedFiles(), FIXTURE_SECRET)).toEqual([]);
  });
});
