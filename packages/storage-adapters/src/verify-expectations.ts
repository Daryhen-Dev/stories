import type { ObjectExpectation, VerifyResult } from "./types.js";

/**
 * Shared verification plumbing (MSA R3): compares observed object metadata
 * against optional expectations, reporting success or a VERIFY_MISMATCH
 * failure whose detail names the mismatched property. Provider-agnostic so
 * every adapter reports mismatches identically (the Supabase adapter and the
 * in-memory fake both report through this helper).
 */
export const compareExpectations = (
  key: string,
  observed: { readonly size: number; readonly contentType: string | null },
  expected?: ObjectExpectation,
): VerifyResult => {
  if (expected?.size !== undefined && expected.size !== observed.size) {
    return {
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: `size mismatch for "${key}": expected ${expected.size}, found ${observed.size}`,
    };
  }
  if (
    expected?.contentType !== undefined &&
    expected.contentType !== observed.contentType
  ) {
    return {
      ok: false,
      code: "VERIFY_MISMATCH",
      detail: `contentType mismatch for "${key}": expected "${expected.contentType}", found "${observed.contentType ?? ""}"`,
    };
  }
  return { ok: true, size: observed.size, contentType: observed.contentType };
};
