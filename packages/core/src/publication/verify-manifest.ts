import { manifestSchemaV1 } from "@stories/manifest-schema";
import { AdapterError } from "@stories/storage-adapters";
import type { StorageAdapter } from "@stories/storage-adapters";

import { MANIFEST_CONTENT_TYPE } from "./policy.js";

export interface VerifyManifestInput {
  readonly adapter: StorageAdapter;
  readonly manifestKey: string;
  readonly expectedSize: number;
  readonly expectedStoryIds: readonly string[];
  readonly fetcher: typeof fetch;
}

/** Deterministic ascending order for story-id set comparison. */
function ascending(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortIds(ids: readonly string[]): string[] {
  return [...ids].sort(ascending);
}

/**
 * Shared verify + read-back round (design step 5, MP R4) used by both publish
 * and rollback: check the stored object's size and content type, read back the
 * public URL, parse it with the shared v1 schema, and require story-id set
 * equality with the expected ids. Any mismatch is an unverified failure
 * surfaced as a typed AdapterError.
 */
export async function verifyPublishedManifest(
  input: VerifyManifestInput,
): Promise<void> {
  const { adapter, manifestKey, expectedSize, expectedStoryIds, fetcher } =
    input;
  const verified = await adapter.verify(manifestKey, {
    size: expectedSize,
    contentType: MANIFEST_CONTENT_TYPE,
  });
  if (!verified.ok) {
    throw new AdapterError(
      verified.code,
      adapter.provider,
      `manifest verification failed: ${verified.detail}`,
    );
  }
  const manifestUrl = adapter.publicUrl(manifestKey);
  let response: Response;
  try {
    response = await fetcher(manifestUrl);
  } catch (cause) {
    throw new AdapterError(
      "NETWORK_ERROR",
      adapter.provider,
      `manifest read-back failed for ${manifestUrl}`,
      undefined,
      cause,
    );
  }
  if (!response.ok) {
    throw new AdapterError(
      "NETWORK_ERROR",
      adapter.provider,
      `manifest read-back failed for ${manifestUrl}: HTTP ${response.status}`,
    );
  }
  let servedIds: string[];
  try {
    const parsed = manifestSchemaV1.parse(JSON.parse(await response.text()));
    servedIds = parsed.stories.map((story) => story.id);
  } catch (cause) {
    throw new AdapterError(
      "VERIFY_MISMATCH",
      adapter.provider,
      "manifest read-back did not return schema-valid v1 bytes",
      undefined,
      cause,
    );
  }
  const expected = sortIds(expectedStoryIds);
  const served = sortIds(servedIds);
  if (
    expected.length !== served.length ||
    expected.some((id, index) => id !== served[index])
  ) {
    throw new AdapterError(
      "VERIFY_MISMATCH",
      adapter.provider,
      `manifest read-back story-id set mismatch: expected ${expected.length} stories, served ${served.length}`,
    );
  }
}
