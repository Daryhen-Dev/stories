import type { AdapterErrorCode } from "./errors.js";

/**
 * Storage adapter contract (MSA R1–R3, R6, R7) — the only surface through which
 * any package touches object storage. Exactly five operations plus one probe;
 * provider SDK types are wrapped at this boundary and never leak (MSA R5).
 */

export type ProviderId = "supabase" | "insforge";

export interface AdapterConfig {
  readonly bucket: string;
  /** e.g. https://<ref>.supabase.co/storage/v1/object/public/<bucket> */
  readonly publicBaseUrl: string;
}

export interface UploadInput {
  /** Object key, e.g. `stories/<storyId>/media.mp4` or `stories.json`. */
  readonly key: string;
  readonly body: ReadableStream<Uint8Array> | Uint8Array;
  readonly contentType: string;
  /** Mandatory: enables verify and the streaming size guard. */
  readonly contentLength: number;
  /** 60 for the manifest, 31_536_000 for media (D9). */
  readonly cacheControlSeconds: number;
}

export interface ObjectExpectation {
  readonly contentType?: string;
  readonly size?: number;
}

export type VerifyResult =
  | {
      readonly ok: true;
      readonly size: number;
      readonly contentType: string | null;
    }
  | {
      readonly ok: false;
      readonly code: AdapterErrorCode;
      readonly detail: string;
    };

export type PublicReadCheck =
  | { readonly ok: true; readonly httpStatus: number }
  | {
      readonly ok: false;
      readonly code: AdapterErrorCode;
      readonly httpStatus?: number;
      readonly remediation: string;
    };

/**
 * Node-side probe of reachability and public read — no CORS semantics (D2:
 * browser-context CORS checks live in the panel, not here).
 */
export interface StorageAdapter {
  readonly provider: ProviderId;
  upload(input: UploadInput): Promise<{ readonly etag?: string }>;
  verify(key: string, expected?: ObjectExpectation): Promise<VerifyResult>;
  /** Deterministic public URL for a key; no network access. */
  publicUrl(key: string): string;
  delete(key: string): Promise<void>;
  checkPublicRead(): Promise<PublicReadCheck>;
}
