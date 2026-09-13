import { isoUtc } from "@stories/manifest-schema";

/**
 * Expiry window (SL R3, D9): a story's `expiresAt` must be a UTC instant
 * between 24 hours and 30 days in the future at creation and edit time. Both
 * bounds are inclusive — exactly 24 h and exactly 30 d are accepted.
 */
export const MIN_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_EXPIRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const WINDOW_MESSAGE =
  "expiresAt must be a UTC instant between 24 hours and 30 days in the future";

/** Pure boundary predicate: inclusive at 24 h and at 30 d, exclusive outside. */
export function isWithinExpiryWindow(
  expiresAtMs: number,
  nowMs: number,
): boolean {
  return (
    expiresAtMs >= nowMs + MIN_EXPIRY_WINDOW_MS &&
    expiresAtMs <= nowMs + MAX_EXPIRY_WINDOW_MS
  );
}

/**
 * Single definition of the window rule (design D9: "Zod refinement in core").
 * Both the create and the edit paths in `story-service.ts` compose this
 * factory; `now` is injectable so callers and tests stay deterministic. The
 * UTC `Z`-only shape reuses `isoUtc` from the manifest-schema contract (D3).
 */
export function expiryWindowSchema(now: Date = new Date()) {
  return isoUtc.refine(
    (value) => isWithinExpiryWindow(Date.parse(value), now.getTime()),
    { message: WINDOW_MESSAGE },
  );
}
