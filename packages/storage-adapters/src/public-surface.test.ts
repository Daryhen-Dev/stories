import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import * as storageAdapters from "./index.js";
import type {
  ObjectExpectation,
  StorageAdapter,
  UploadInput,
} from "./types.js";

/**
 * Compile-time surface pins (MSA R1/R6). Vitest does not typecheck, so these
 * assertions bite under the repo gate `pnpm typecheck`.
 */
type AdapterKeys = keyof StorageAdapter;
type AdapterSurfaceExact =
  Exclude<
    AdapterKeys,
    | "provider"
    | "upload"
    | "verify"
    | "publicUrl"
    | "delete"
    | "checkPublicRead"
  > extends never
    ? true
    : never;
const _adapterSurfaceExact: AdapterSurfaceExact = true;

type UploadInputExact =
  Exclude<
    keyof UploadInput,
    "key" | "body" | "contentType" | "contentLength" | "cacheControlSeconds"
  > extends never
    ? true
    : never;
const _uploadInputExact: UploadInputExact = true;

type ExpectationExact =
  Exclude<keyof ObjectExpectation, "contentType" | "size"> extends never
    ? true
    : never;
const _expectationExact: ExpectationExact = true;

/** MSA R6: nothing on the contract may express "delete at timestamp". */
type NoLifecycleMembers =
  Extract<
    AdapterKeys,
    "deleteAt" | "deleteBefore" | "expireAt" | "setTimeToLive"
  > extends never
    ? true
    : never;
const _noLifecycleMembers: NoLifecycleMembers = true;

describe("public surface (MSA R1/R5/R6)", () => {
  it("exports exactly the contract surface: AdapterError, the fake, and the contract suite", () => {
    expect(Object.keys(storageAdapters).sort()).toEqual([
      "AdapterError",
      "createFakeStorageAdapter",
      "runStorageAdapterContractSuite",
    ]);
  });

  it("exposes no lifecycle, TTL, or scheduled-expiration member (MSA R6)", () => {
    expect(Object.keys(storageAdapters).join("|")).not.toMatch(
      /ttl|lifecycle|expir|schedul|cron|purge/i,
    );
    const sampleInput: UploadInput = {
      key: "k",
      body: new Uint8Array(0),
      contentType: "text/plain",
      contentLength: 0,
      cacheControlSeconds: 60,
    };
    expect(Object.keys(sampleInput).sort()).toEqual([
      "body",
      "cacheControlSeconds",
      "contentLength",
      "contentType",
      "key",
    ]);
  });

  it("pins the contract shape at compile time (enforced by pnpm typecheck)", () => {
    void [
      _adapterSurfaceExact,
      _uploadInputExact,
      _expectationExact,
      _noLifecycleMembers,
    ];
    expect(storageAdapters.AdapterError).toBeDefined();
  });

  it("carries zero runtime dependencies (types + fake only)", () => {
    const dependencies = (
      packageJson as { readonly dependencies?: Record<string, string> }
    ).dependencies;
    expect(Object.keys(dependencies ?? {})).toEqual([]);
  });
});
