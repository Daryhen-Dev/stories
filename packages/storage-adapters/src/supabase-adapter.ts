/**
 * Supabase reference adapter (MSA R5, D3). This is the ONLY file in the
 * repository allowed to import `@supabase/*`: the slice of the SDK bucket
 * client the adapter uses is described by local structural interfaces, so
 * tests stub the client in-memory without importing the SDK. The real SDK
 * client is narrowed with one documented cast in the default constructor.
 */
import { createClient } from "@supabase/supabase-js";

import { AdapterError, type AdapterErrorCode } from "./errors.js";
import type {
  AdapterConfig,
  ObjectExpectation,
  ProviderId,
  PublicReadCheck,
  StorageAdapter,
  UploadInput,
  VerifyResult,
} from "./types.js";
import { compareExpectations } from "./verify-expectations.js";

/** Shape of provider errors the SDK surfaces (message + optional HTTP status). */
export interface SupabaseStorageErrorLike {
  readonly message: string;
  readonly statusCode?: string | number | undefined;
}

/** File-listing entry: folders carry `id: null`, objects a non-null id. */
export interface SupabaseStorageFileObjectLike {
  readonly name: string;
  readonly id: string | null;
}

/**
 * The slice of `client.storage.from(bucket)` the adapter depends on,
 * structural (no SDK types) so unit tests can stub it. The Node runtime SDK
 * satisfies it: `download` resolves to a Blob there, and Blob carries
 * `size`/`type` as declared below.
 */
export interface SupabaseStorageBucketClient {
  upload(
    path: string,
    body: UploadInput["body"],
    options: {
      readonly contentType: string;
      readonly cacheControl: string;
      readonly upsert: boolean;
    },
  ): Promise<{
    readonly data: { readonly path: string } | null;
    readonly error: SupabaseStorageErrorLike | null;
  }>;
  download(path: string): Promise<{
    readonly data: { readonly size: number; readonly type: string } | null;
    readonly error: SupabaseStorageErrorLike | null;
  }>;
  remove(paths: readonly string[]): Promise<{
    readonly data: readonly { readonly name: string }[] | null;
    readonly error: SupabaseStorageErrorLike | null;
  }>;
  list(prefix: string): Promise<{
    readonly data: readonly SupabaseStorageFileObjectLike[] | null;
    readonly error: SupabaseStorageErrorLike | null;
  }>;
}

export interface SupabaseAdapterOptions extends AdapterConfig {
  /** Project URL, e.g. https://<ref>.supabase.co */
  readonly supabaseUrl: string;
  /** Service-role key; held only in local configuration, never shipped to sites. */
  readonly serviceKey: string;
}

const REMEDIATION = {
  auth: "Check the provider access keys stored for this project and re-run the connection test.",
  bucket:
    "Create the bucket (or fix the bucket name in the project settings) and re-run the connection test.",
  notPublic:
    "Make the bucket public (or serve objects anonymously) and re-run the connection test.",
  network:
    "Verify network reachability and the provider URL, then re-run the connection test.",
  upload:
    "Re-run the publish attempt; if it persists, check the bucket policies and the object size limit.",
  delete:
    "Check the bucket policies and object existence, then retry the delete.",
  notFound:
    "Check the object key and the bucket policies, then re-run the connection test.",
  unknown:
    "Inspect the provider error recorded as the cause, then re-run the connection test.",
} as const;

/** D9 cache policy: one year and up is served immutable. */
const d9CacheControl = (seconds: number): string =>
  seconds >= 31_536_000
    ? `public, max-age=${seconds}, immutable`
    : `public, max-age=${seconds}`;

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message.toLowerCase();
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message.toLowerCase() : String(error);
};

const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError ||
  /fetch failed|network|enotfound|econnrefused|eai_again/.test(
    messageOf(error),
  );

/**
 * Classifies one SDK-shaped error into the fixed taxonomy (MSA R2). Network
 * faults always win so a rejected fetch never masquerades as a provider code;
 * unmapped errors surface as UNKNOWN with the raw error preserved as cause —
 * the raw SDK error itself never crosses the contract boundary.
 */
const classifySdkError = (
  provider: ProviderId,
  operation: string,
  fallback: AdapterErrorCode,
  error: SupabaseStorageErrorLike,
): AdapterError => {
  if (isNetworkError(error)) {
    return new AdapterError(
      "NETWORK_ERROR",
      provider,
      `${operation} failed: the provider could not be reached (${error.message})`,
      REMEDIATION.network,
      error,
    );
  }
  const status = error.statusCode === undefined ? "" : String(error.statusCode);
  const message = error.message.toLowerCase();
  if (status === "401" || status === "403") {
    return new AdapterError(
      "AUTH_FAILED",
      provider,
      `${operation} rejected: credentials are invalid or lack storage policies (${error.message})`,
      REMEDIATION.auth,
      error,
    );
  }
  if (
    message.includes("bucket not found") ||
    (status === "404" && message.includes("bucket"))
  ) {
    return new AdapterError(
      "BUCKET_NOT_FOUND",
      provider,
      `${operation} failed: bucket does not exist (${error.message})`,
      REMEDIATION.bucket,
      error,
    );
  }
  if (message.includes("object not found")) {
    return new AdapterError(
      "OBJECT_NOT_FOUND",
      provider,
      `${operation} failed: object does not exist (${error.message})`,
      REMEDIATION.notFound,
      error,
    );
  }
  if (fallback !== "UNKNOWN") {
    return new AdapterError(
      fallback,
      provider,
      `${operation} failed (${error.message})`,
      fallback === "UPLOAD_FAILED"
        ? REMEDIATION.upload
        : fallback === "DELETE_FAILED"
          ? REMEDIATION.delete
          : REMEDIATION.unknown,
      error,
    );
  }
  return new AdapterError(
    "UNKNOWN",
    provider,
    `${operation} failed with an unmapped provider error (${error.message})`,
    REMEDIATION.unknown,
    error,
  );
};

const nestedAdapterError = (
  error: SupabaseStorageErrorLike,
): AdapterError | undefined => {
  const originalError = (error as { readonly originalError?: unknown })
    .originalError;
  return originalError instanceof AdapterError ? originalError : undefined;
};

/** Normalizes anything thrown during an operation into the taxonomy (MSA R2). */
const thrownToAdapterError = (
  provider: ProviderId,
  operation: string,
  fallback: AdapterErrorCode,
  caught: unknown,
): AdapterError => {
  if (caught instanceof AdapterError) return caught;
  if (isNetworkError(caught)) {
    return new AdapterError(
      "NETWORK_ERROR",
      provider,
      `${operation} failed: the provider could not be reached`,
      REMEDIATION.network,
      caught,
    );
  }
  const description = caught instanceof Error ? caught.message : String(caught);
  return new AdapterError(
    fallback,
    provider,
    `${operation} failed unexpectedly (${description})`,
    fallback === "UNKNOWN" ? REMEDIATION.unknown : undefined,
    caught,
  );
};

const defaultBucketClient = (
  options: SupabaseAdapterOptions,
): SupabaseStorageBucketClient => {
  const client = createClient(options.supabaseUrl, options.serviceKey, {
    auth: { persistSession: false },
  });
  // SAFETY: In the Node runtime the SDK's download() resolves to a Blob, and
  // Blob structurally satisfies { size; type }; the union's Response branch is
  // browser-only and unreachable here. TypeScript cannot narrow the SDK's
  // environment-dependent union, so this cast pins the Node invariant. It is
  // the single SDK type boundary of this adapter.
  return client.storage.from(
    options.bucket,
  ) as unknown as SupabaseStorageBucketClient;
};

export const createSupabaseStorageAdapter = (
  options: SupabaseAdapterOptions,
  bucketClient?: SupabaseStorageBucketClient,
): StorageAdapter => {
  const provider: ProviderId = "supabase";
  const client = bucketClient ?? defaultBucketClient(options);
  const publicBase = options.publicBaseUrl.replace(/\/+$/, "");

  const upload = async (
    input: UploadInput,
  ): Promise<{ readonly etag?: string }> => {
    const operation = `upload of "${input.key}"`;
    try {
      // The Supabase SDK accepts Uint8Array and ReadableStream bodies. Preserve
      // the exact contract body so production uploads remain streaming; the later
      // multipart route wraps file streams with guardUploadBody before this call.
      // upsert: republication overwrites the manifest/media keys; without it
      // the SDK rejects a repeated upload of an existing key.
      const { error } = await client.upload(input.key, input.body, {
        contentType: input.contentType,
        cacheControl: d9CacheControl(input.cacheControlSeconds),
        upsert: true,
      });
      if (error)
        throw (
          nestedAdapterError(error) ??
          classifySdkError(provider, operation, "UPLOAD_FAILED", error)
        );
      return {};
    } catch (caught) {
      throw thrownToAdapterError(provider, operation, "UPLOAD_FAILED", caught);
    }
  };

  const notFound = (key: string): VerifyResult => ({
    ok: false,
    code: "OBJECT_NOT_FOUND",
    detail: `object "${key}" does not exist in bucket "${options.bucket}"`,
  });

  const verify = async (
    key: string,
    expected?: ObjectExpectation,
  ): Promise<VerifyResult> => {
    const operation = `verify of "${key}"`;
    try {
      const { data, error } = await client.download(key);
      if (error) {
        const classified = classifySdkError(
          provider,
          operation,
          "UNKNOWN",
          error,
        );
        if (classified.code === "OBJECT_NOT_FOUND") return notFound(key);
        throw classified;
      }
      if (!data) return notFound(key);
      return compareExpectations(
        key,
        { size: data.size, contentType: data.type === "" ? null : data.type },
        expected,
      );
    } catch (caught) {
      throw thrownToAdapterError(provider, operation, "UNKNOWN", caught);
    }
  };

  const publicUrl = (key: string): string => `${publicBase}/${key}`;

  const remove = async (key: string): Promise<void> => {
    const operation = `delete of "${key}"`;
    try {
      const { error } = await client.remove([key]);
      if (error)
        throw classifySdkError(provider, operation, "DELETE_FAILED", error);
    } catch (caught) {
      throw thrownToAdapterError(provider, operation, "DELETE_FAILED", caught);
    }
  };

  /** Breadth-first search for an existing object key; "" when none exists. */
  const firstExistingObjectKey = async (): Promise<string> => {
    const queue: string[] = [""];
    for (let depth = 0; queue.length > 0 && depth < 8; depth += 1) {
      const prefix = queue.shift() ?? "";
      const { data, error } = await client.list(prefix);
      if (error) {
        throw classifySdkError(
          provider,
          `bucket listing under "${prefix}"`,
          "UNKNOWN",
          error,
        );
      }
      for (const entry of data ?? []) {
        if (entry.id === null) queue.push(`${prefix}${entry.name}/`);
        else return `${prefix}${entry.name}`;
      }
    }
    return "";
  };

  const checkPublicRead = async (): Promise<PublicReadCheck> => {
    try {
      const probeKey = await firstExistingObjectKey();
      if (probeKey === "") {
        return {
          ok: false,
          code: "UNKNOWN",
          remediation: `Bucket "${options.bucket}" is reachable but holds no objects to probe; publish once (or upload any object), then re-run the connection test.`,
        };
      }
      // Spike-informed probe (spike-findings A/B): poll an EXISTING object, so
      // a 404/403 on a known-present key proves the bucket is not publicly
      // readable and 200 proves public read (the contract suite requires
      // httpStatus 200 on the public fixture).
      let response: Response;
      try {
        response = await fetch(publicUrl(probeKey), { redirect: "manual" });
      } catch (cause) {
        throw new AdapterError(
          "NETWORK_ERROR",
          provider,
          `public read probe of "${probeKey}" could not reach the provider`,
          REMEDIATION.network,
          cause,
        );
      }
      if (response.status === 200) return { ok: true, httpStatus: 200 };
      if (response.status === 403 || response.status === 404) {
        return {
          ok: false,
          code: "BUCKET_NOT_PUBLIC",
          httpStatus: response.status,
          remediation: `Bucket "${options.bucket}" does not serve existing objects publicly (HTTP ${response.status}). ${REMEDIATION.notPublic}`,
        };
      }
      return {
        ok: false,
        code: "UNKNOWN",
        httpStatus: response.status,
        remediation: `Unexpected HTTP ${response.status} probing an existing object. ${REMEDIATION.unknown}`,
      };
    } catch (caught) {
      if (caught instanceof AdapterError) throw caught;
      throw new AdapterError(
        "UNKNOWN",
        provider,
        "public-read check failed unexpectedly",
        REMEDIATION.unknown,
        caught,
      );
    }
  };

  return {
    provider,
    upload,
    verify,
    publicUrl,
    delete: remove,
    checkPublicRead,
  };
};
