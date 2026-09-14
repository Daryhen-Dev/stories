import { AdapterError } from "../../packages/storage-adapters/src/errors.js";
import { asBytes } from "../../packages/storage-adapters/src/body-bytes.js";
import { compareExpectations } from "../../packages/storage-adapters/src/verify-expectations.js";
import type {
  ObjectExpectation,
  PublicReadCheck,
  StorageAdapter,
  UploadInput,
  VerifyResult,
} from "../../packages/storage-adapters/src/types.js";
import type { ProviderSimulator } from "../../tools/provider-simulator/index.js";

export interface SimulatorStorageAdapterOptions {
  readonly simulator: ProviderSimulator;
  readonly bucket: string;
  /** Existing public object used by the contract's reachability probe. */
  readonly publicReadKey: string;
}

function createSimulatorObjectUrl(simulatorUrl: string, key: string): URL {
  let base: URL;
  try {
    base = new URL(simulatorUrl);
  } catch (error) {
    throw new AdapterError(
      "NETWORK_ERROR",
      "supabase",
      "simulator adapter requires a valid provider URL",
      undefined,
      error,
    );
  }
  if (
    base.protocol !== "http:" ||
    base.hostname !== "127.0.0.1" ||
    base.port === ""
  ) {
    throw new AdapterError(
      "NETWORK_ERROR",
      "supabase",
      "simulator adapter requires an explicit 127.0.0.1 HTTP provider URL",
    );
  }
  if (
    key === "" ||
    key.startsWith("/") ||
    key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new AdapterError(
      "UNKNOWN",
      "supabase",
      `simulator object key is not a normalized relative path: "${key}"`,
    );
  }
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(encodedKey, `${base.href.replace(/\/+$/, "")}/`);
  if (url.origin !== base.origin) {
    throw new AdapterError(
      "NETWORK_ERROR",
      "supabase",
      "simulator object URL escaped the configured provider origin",
    );
  }
  return url;
}

/** Test-only StorageAdapter backed by the in-process public provider simulator. */
export function createSimulatorStorageAdapter(
  options: SimulatorStorageAdapterOptions,
): StorageAdapter {
  const publicUrl = (key: string): string =>
    createSimulatorObjectUrl(options.simulator.url, key).href;

  const upload = async (
    input: UploadInput,
  ): Promise<{ readonly etag?: string }> => {
    const body = await asBytes(input.body);
    if (body.byteLength !== input.contentLength) {
      throw new AdapterError(
        "UPLOAD_FAILED",
        "supabase",
        `upload rejected for "${input.key}": declared contentLength ${input.contentLength} does not match the body size ${body.byteLength}`,
      );
    }
    options.simulator.put(input.key, {
      body,
      contentType: input.contentType,
      cacheControlSeconds: input.cacheControlSeconds,
    });
    return { etag: `"${input.key}:${body.byteLength}"` };
  };

  const verify = async (
    key: string,
    expected?: ObjectExpectation,
  ): Promise<VerifyResult> => {
    let response: Response;
    try {
      response = await fetch(publicUrl(key), { method: "HEAD" });
    } catch (error) {
      throw new AdapterError(
        "NETWORK_ERROR",
        "supabase",
        `verify failed for "${key}": provider simulator is unavailable`,
        undefined,
        error,
      );
    }
    if (response.status === 404) {
      return {
        ok: false,
        code: "OBJECT_NOT_FOUND",
        detail: `object "${key}" does not exist in bucket "${options.bucket}"`,
      };
    }
    if (!response.ok) {
      throw new AdapterError(
        "NETWORK_ERROR",
        "supabase",
        `verify failed for "${key}": simulator returned HTTP ${response.status}`,
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    return compareExpectations(
      key,
      {
        size: Number.isFinite(contentLength) ? contentLength : 0,
        contentType: response.headers.get("content-type"),
      },
      expected,
    );
  };

  const remove = async (key: string): Promise<void> => {
    if (!options.simulator.delete(key)) {
      throw new AdapterError(
        "OBJECT_NOT_FOUND",
        "supabase",
        `delete failed: object "${key}" does not exist in bucket "${options.bucket}"`,
      );
    }
  };

  const checkPublicRead = async (): Promise<PublicReadCheck> => {
    let response: Response;
    try {
      response = await fetch(
        createSimulatorObjectUrl(options.simulator.url, options.publicReadKey),
      );
    } catch (error) {
      return {
        ok: false,
        code: "NETWORK_ERROR",
        remediation: `Provider simulator could not read "${options.publicReadKey}" from bucket "${options.bucket}". (${String(error)})`,
      };
    }
    if (response.ok) return { ok: true, httpStatus: response.status };
    return {
      ok: false,
      code: response.status === 403 ? "BUCKET_NOT_PUBLIC" : "OBJECT_NOT_FOUND",
      httpStatus: response.status,
      remediation: `Public read of "${options.publicReadKey}" in bucket "${options.bucket}" returned HTTP ${response.status}.`,
    };
  };

  return {
    provider: "supabase",
    upload,
    verify,
    publicUrl,
    delete: remove,
    checkPublicRead,
  };
}
