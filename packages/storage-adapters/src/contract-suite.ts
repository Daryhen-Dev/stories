import { AdapterError } from "./errors.js";
import { textBytes, uploadInput } from "./testing.js";
import type { PublicReadCheck, StorageAdapter } from "./types.js";

/** Optional per-provider fixtures for cases needing specific bucket or credential states. */
export interface ContractSuiteVariants {
  /** Adapter against a non-public bucket; exercises BUCKET_NOT_PUBLIC. */
  readonly makeNonPublicAdapter?: () =>
    Promise<StorageAdapter> | StorageAdapter;
  /** Adapter constructed with invalid credentials; exercises AUTH_FAILED. */
  readonly makeBadCredentialsAdapter?: () =>
    Promise<StorageAdapter> | StorageAdapter;
}

export interface ContractSuiteCase {
  readonly name: string;
  readonly status: "passed" | "skipped";
}

export interface ContractSuiteReport {
  readonly cases: readonly ContractSuiteCase[];
  readonly passed: number;
  readonly skipped: number;
}

/**
 * Adapters may expose stored-object metadata (the in-memory fake does) so the
 * suite can assert cache-control propagation without network access (MSA R7).
 */
interface CacheControlObservable {
  readonly stored?: ReadonlyMap<
    string,
    { readonly cacheControlSeconds: number }
  >;
}

/**
 * Provider-agnostic contract suite (MSA R4): upload→verify round-trip (match +
 * mismatch), publicUrl shape, delete → OBJECT_NOT_FOUND, checkPublicRead on
 * public and non-public buckets, bad-credential mapping, and cache-control
 * propagation — without naming or knowing the provider. The primary fixture
 * must be an adapter against a PUBLIC bucket. Variant cases run only when the
 * matching fixture is provided and are reported as skipped otherwise. A failing
 * case throws an Error naming the case.
 */
export const runStorageAdapterContractSuite = async (
  makeAdapter: () => Promise<StorageAdapter> | StorageAdapter,
  variants: ContractSuiteVariants = {},
): Promise<ContractSuiteReport> => {
  const cases: ContractSuiteCase[] = [];
  const run = async (
    name: string,
    execute: (fail: (reason: string) => never) => void | Promise<void>,
  ): Promise<void> => {
    await execute((reason) => {
      throw new Error(`contract suite case "${name}" failed: ${reason}`);
    });
    cases.push({ name, status: "passed" });
  };
  const skip = (name: string): void => {
    cases.push({ name, status: "skipped" });
  };

  const adapter = await makeAdapter();
  const stored = (adapter as StorageAdapter & CacheControlObservable).stored;

  await run(
    "upload → verify round-trip preserves size and content type",
    async (fail) => {
      const key = "contract-suite/round-trip.bin";
      const body = textBytes("contract suite round trip");
      await adapter.upload(uploadInput(key, body, "text/plain", 60));
      const result = await adapter.verify(key, {
        size: body.byteLength,
        contentType: "text/plain",
      });
      if (!result.ok)
        return fail(`verify failed with ${result.code}: ${result.detail}`);
      if (
        result.size !== body.byteLength ||
        result.contentType !== "text/plain"
      ) {
        return fail(
          `observed size/contentType ${result.size}/${result.contentType} drifts from the upload`,
        );
      }
    },
  );

  await run(
    "verify mismatch reports VERIFY_MISMATCH for size and contentType",
    async (fail) => {
      const key = "contract-suite/mismatch.bin";
      const body = textBytes("mismatch probe");
      await adapter.upload(uploadInput(key, body, "text/plain", 60));
      const sizeResult = await adapter.verify(key, {
        size: body.byteLength + 1,
      });
      if (sizeResult.ok || sizeResult.code !== "VERIFY_MISMATCH") {
        return fail(
          `expected VERIFY_MISMATCH for a wrong size, found ${JSON.stringify(sizeResult)}`,
        );
      }
      if (!/\bsize\b/.test(sizeResult.detail)) {
        return fail(
          `size-mismatch detail does not name the mismatched property: ${sizeResult.detail}`,
        );
      }
      const typeResult = await adapter.verify(key, {
        contentType: "video/mp4",
      });
      if (typeResult.ok || typeResult.code !== "VERIFY_MISMATCH") {
        return fail(
          `expected VERIFY_MISMATCH for a wrong contentType, found ${JSON.stringify(typeResult)}`,
        );
      }
      if (!/\bcontent.?type\b/i.test(typeResult.detail)) {
        return fail(
          `contentType-mismatch detail does not name the property: ${typeResult.detail}`,
        );
      }
    },
  );

  await run(
    "publicUrl returns an absolute URL containing the key, without network access",
    (fail) => {
      const key = "contract-suite/public-url.bin";
      const url = adapter.publicUrl(key);
      if (typeof url !== "string" || url.length === 0) {
        return fail(`publicUrl is not a non-empty string: ${String(url)}`);
      }
      try {
        new URL(url);
      } catch {
        return fail(`publicUrl is not an absolute URL: ${url}`);
      }
      if (!url.includes(key))
        return fail(`publicUrl does not contain the key: ${url}`);
      if (adapter.publicUrl(key) !== url)
        return fail("publicUrl is not deterministic across calls");
    },
  );

  await run(
    "delete removes the object and verify then reports OBJECT_NOT_FOUND",
    async (fail) => {
      const key = "contract-suite/deleted.bin";
      const body = textBytes("delete probe");
      await adapter.upload(uploadInput(key, body, "text/plain", 60));
      await adapter.delete(key);
      const result = await adapter.verify(key);
      if (result.ok || result.code !== "OBJECT_NOT_FOUND") {
        return fail(
          `expected OBJECT_NOT_FOUND after delete, found ${JSON.stringify(result)}`,
        );
      }
    },
  );

  await run(
    "checkPublicRead succeeds on the public bucket fixture",
    async (fail) => {
      const check: PublicReadCheck = await adapter.checkPublicRead();
      if (!check.ok) {
        return fail(
          `expected a successful public read, found ${check.code}: ${check.remediation}`,
        );
      }
      if (check.httpStatus !== 200) {
        return fail(
          `expected HTTP 200 on the public read probe, found ${String(check.httpStatus)}`,
        );
      }
    },
  );

  const propagationCase =
    "upload propagates cacheControlSeconds: manifest TTL 60 and media TTL 31536000 asserted separately";
  if (stored) {
    await run(propagationCase, async (fail) => {
      const manifestKey = "contract-suite/cache-control-manifest.bin";
      const body = textBytes("cache-control probe");
      await adapter.upload(uploadInput(manifestKey, body, "text/plain", 60));
      const manifestTtl = stored.get(manifestKey)?.cacheControlSeconds;
      if (manifestTtl !== 60) {
        return fail(
          `expected persisted cacheControlSeconds 60 for the manifest, found ${String(manifestTtl)}`,
        );
      }
      const mediaKey = "contract-suite/cache-control-media.bin";
      await adapter.upload(uploadInput(mediaKey, body, "video/mp4", 31536000));
      const mediaTtl = stored.get(mediaKey)?.cacheControlSeconds;
      if (mediaTtl !== 31536000) {
        return fail(
          `expected persisted cacheControlSeconds 31536000 for media, found ${String(mediaTtl)}`,
        );
      }
    });
  } else {
    skip(propagationCase);
  }

  const nonPublicCase =
    "checkPublicRead reports BUCKET_NOT_PUBLIC with remediation on a non-public bucket";
  if (variants.makeNonPublicAdapter) {
    const nonPublic = await variants.makeNonPublicAdapter();
    await run(nonPublicCase, async (fail) => {
      const check: PublicReadCheck = await nonPublic.checkPublicRead();
      if (check.ok)
        return fail("expected a failed check on a non-public bucket");
      if (check.code !== "BUCKET_NOT_PUBLIC") {
        return fail(`expected BUCKET_NOT_PUBLIC, found ${check.code}`);
      }
      if (!check.remediation) return fail("missing operator remediation");
    });
  } else {
    skip(nonPublicCase);
  }

  const badCredentialsCase =
    "bad credentials surface AUTH_FAILED with remediation, never the raw provider error";
  if (variants.makeBadCredentialsAdapter) {
    const badCredentials = await variants.makeBadCredentialsAdapter();
    await run(badCredentialsCase, async (fail) => {
      let raised: unknown;
      try {
        await badCredentials.upload(
          uploadInput(
            "contract-suite/auth.bin",
            textBytes("auth probe"),
            "text/plain",
            60,
          ),
        );
      } catch (error) {
        raised = error;
      }
      if (!(raised instanceof AdapterError)) {
        return fail(
          "raw provider error crossed the boundary: AUTH_FAILED must surface as AdapterError",
        );
      }
      if (raised.code !== "AUTH_FAILED")
        return fail(`expected AUTH_FAILED, found ${raised.code}`);
      if (!raised.remediation) return fail("missing operator remediation");
    });
  } else {
    skip(badCredentialsCase);
  }

  return {
    cases,
    passed: cases.filter((entry) => entry.status === "passed").length,
    skipped: cases.filter((entry) => entry.status === "skipped").length,
  };
};
