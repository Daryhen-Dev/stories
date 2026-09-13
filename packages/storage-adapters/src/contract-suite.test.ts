import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runStorageAdapterContractSuite } from "./contract-suite.js";
import { createFakeStorageAdapter } from "./fake-adapter.js";

/** Bucket factory: fresh in-memory fakes per call, one per required state. */
const fixtures = () => ({
  makeAdapter: async () =>
    createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com/stories",
    }),
  makeNonPublicAdapter: async () =>
    createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com/stories",
      publicBucket: false,
    }),
  makeBadCredentialsAdapter: async () =>
    createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com/stories",
      authFailure: true,
    }),
});

describe("runStorageAdapterContractSuite (MSA R4)", () => {
  it("passes every contract case against the in-memory fake with nothing skipped", async () => {
    const f = fixtures();
    const report = await runStorageAdapterContractSuite(f.makeAdapter, {
      makeNonPublicAdapter: f.makeNonPublicAdapter,
      makeBadCredentialsAdapter: f.makeBadCredentialsAdapter,
    });
    expect(report.cases.length).toBeGreaterThanOrEqual(8);
    expect(report.skipped).toBe(0);
    expect(report.cases.filter((entry) => entry.status !== "passed")).toEqual(
      [],
    );
  });

  it("fails, naming the case, when an adapter breaks the contract (not vacuous)", async () => {
    const f = fixtures();
    const broken = async () => {
      const fake = await f.makeAdapter();
      return {
        ...fake,
        checkPublicRead: async () => ({
          ok: false as const,
          code: "NETWORK_ERROR" as const,
          remediation: "simulated outage",
        }),
      };
    };
    await expect(
      runStorageAdapterContractSuite(broken, {
        makeNonPublicAdapter: f.makeNonPublicAdapter,
        makeBadCredentialsAdapter: f.makeBadCredentialsAdapter,
      }),
    ).rejects.toThrow(/checkPublicRead/);
  });

  it("skips variant-only cases when the variants are not provided", async () => {
    const f = fixtures();
    const report = await runStorageAdapterContractSuite(f.makeAdapter);
    expect(report.skipped).toBe(2);
    const skippedNames = report.cases
      .filter((entry) => entry.status === "skipped")
      .map((entry) => entry.name)
      .join(" ");
    expect(skippedNames).toMatch(/non-public/i);
    expect(skippedNames).toMatch(/credentials/i);
  });

  it("assertions hold across differently configured fake instances (triangulation)", async () => {
    const report = await runStorageAdapterContractSuite(async () =>
      createFakeStorageAdapter({
        bucket: "other-bucket",
        publicBaseUrl: "https://other-host.example.com/base",
      }),
    );
    expect(report.skipped).toBe(2);
    expect(report.passed).toBe(report.cases.length - report.skipped);
  });

  it("the suite stays provider-agnostic: its source never names a provider", () => {
    const source = readFileSync(
      new URL("./contract-suite.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/supabase|insforge/i);
  });
});
