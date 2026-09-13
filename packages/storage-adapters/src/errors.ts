import type { ProviderId } from "./types.js";

/** Fixed taxonomy every adapter failure normalizes to (MSA R2). */
export type AdapterErrorCode =
  | "AUTH_FAILED"
  | "BUCKET_NOT_FOUND"
  | "BUCKET_NOT_PUBLIC"
  | "UPLOAD_FAILED"
  | "OBJECT_NOT_FOUND"
  | "VERIFY_MISMATCH"
  | "DELETE_FAILED"
  | "NETWORK_ERROR"
  | "CORS_BLOCKED"
  | "UNKNOWN";

/**
 * Typed adapter failure. Adapters MUST NEVER throw raw provider errors across
 * the contract boundary; every failure is normalized to this class, keeping the
 * raw error as `cause` (MSA R2).
 */
export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    readonly provider: ProviderId,
    message: string,
    readonly remediation?: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
