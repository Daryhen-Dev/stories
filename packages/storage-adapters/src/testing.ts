import type { UploadInput } from "./types.js";

/**
 * Shared contract-suite fixtures: deterministic bytes and UploadInput builders
 * ("bucket factory" and "expectation builders" per the PR 2 refactor task).
 * Internal test helpers — deliberately not exported from the package index.
 */
export const textBytes = (text: string): Uint8Array =>
  new TextEncoder().encode(text);

export const uploadInput = (
  key: string,
  body: Uint8Array,
  contentType: string,
  cacheControlSeconds: number,
): UploadInput => ({
  key,
  body,
  contentType,
  contentLength: body.byteLength,
  cacheControlSeconds,
});
