import { AdapterError } from "./errors.js";
import type {
  ObjectExpectation,
  ProviderId,
  PublicReadCheck,
  StorageAdapter,
  UploadInput,
  VerifyResult,
} from "./types.js";

export interface FakeStorageAdapterOptions {
  readonly bucket: string;
  readonly publicBaseUrl: string;
  /** Declared provider this double stands in for (informational only). @default "supabase" */
  readonly provider?: ProviderId;
  /** Whether the simulated bucket is publicly readable. @default true */
  readonly publicBucket?: boolean;
  /** Simulate invalid credentials: keyed operations fail with AUTH_FAILED. @default false */
  readonly authFailure?: boolean;
}

export interface StoredObjectMetadata {
  readonly size: number;
  readonly contentType: string;
  readonly cacheControlSeconds: number;
}

/**
 * In-memory StorageAdapter double (Tier 1, MSA R4/R7): records uploaded objects
 * and their cache-control metadata, simulates public/non-public buckets and bad
 * credentials, and never touches a network. `stored` is test introspection —
 * not part of the adapter contract.
 */
export interface FakeStorageAdapter extends StorageAdapter {
  readonly stored: ReadonlyMap<string, StoredObjectMetadata>;
}

const asBytes = async (body: UploadInput["body"]): Promise<Uint8Array> => {
  if (body instanceof Uint8Array) return body;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export const createFakeStorageAdapter = (
  options: FakeStorageAdapterOptions,
): FakeStorageAdapter => {
  const provider: ProviderId = options.provider ?? "supabase";
  const publicBucket = options.publicBucket ?? true;
  const authFailure = options.authFailure ?? false;
  const objects = new Map<string, Uint8Array>();
  const metadata = new Map<string, StoredObjectMetadata>();

  const assertAuth = (operation: string): void => {
    if (!authFailure) return;
    throw new AdapterError(
      "AUTH_FAILED",
      provider,
      `${operation} rejected: credentials for bucket "${options.bucket}" are invalid`,
      "Check the provider access keys stored for this project and re-run the connection test.",
      new Error("simulated invalid credentials"),
    );
  };

  const upload = async (
    input: UploadInput,
  ): Promise<{ readonly etag?: string }> => {
    assertAuth("upload");
    const bytes = await asBytes(input.body);
    if (bytes.byteLength !== input.contentLength) {
      throw new AdapterError(
        "UPLOAD_FAILED",
        provider,
        `upload rejected for "${input.key}": declared contentLength ${input.contentLength} does not match the body size ${bytes.byteLength}`,
      );
    }
    objects.set(input.key, bytes);
    metadata.set(input.key, {
      size: bytes.byteLength,
      contentType: input.contentType,
      cacheControlSeconds: input.cacheControlSeconds,
    });
    return { etag: `"${input.key}:${bytes.byteLength}"` };
  };

  const verify = async (
    key: string,
    expected?: ObjectExpectation,
  ): Promise<VerifyResult> => {
    assertAuth("verify");
    const bytes = objects.get(key);
    const stored = metadata.get(key);
    if (bytes === undefined || stored === undefined) {
      return {
        ok: false,
        code: "OBJECT_NOT_FOUND",
        detail: `object "${key}" does not exist in bucket "${options.bucket}"`,
      };
    }
    if (expected?.size !== undefined && expected.size !== stored.size) {
      return {
        ok: false,
        code: "VERIFY_MISMATCH",
        detail: `size mismatch for "${key}": expected ${expected.size}, found ${stored.size}`,
      };
    }
    if (
      expected?.contentType !== undefined &&
      expected.contentType !== stored.contentType
    ) {
      return {
        ok: false,
        code: "VERIFY_MISMATCH",
        detail: `contentType mismatch for "${key}": expected "${expected.contentType}", found "${stored.contentType}"`,
      };
    }
    return { ok: true, size: stored.size, contentType: stored.contentType };
  };

  const publicUrl = (key: string): string =>
    `${options.publicBaseUrl.replace(/\/+$/, "")}/${key}`;

  const remove = async (key: string): Promise<void> => {
    assertAuth("delete");
    const existed = metadata.delete(key);
    objects.delete(key);
    if (!existed) {
      throw new AdapterError(
        "OBJECT_NOT_FOUND",
        provider,
        `delete failed: object "${key}" does not exist in bucket "${options.bucket}"`,
      );
    }
  };

  const checkPublicRead = async (): Promise<PublicReadCheck> => {
    if (publicBucket) return { ok: true, httpStatus: 200 };
    return {
      ok: false,
      code: "BUCKET_NOT_PUBLIC",
      httpStatus: 403,
      remediation: `Bucket "${options.bucket}" is not publicly readable. Make the bucket public (or serve objects anonymously) and re-run the connection test.`,
    };
  };

  return {
    provider,
    upload,
    verify,
    publicUrl,
    delete: remove,
    checkPublicRead,
    stored: metadata,
  };
};
