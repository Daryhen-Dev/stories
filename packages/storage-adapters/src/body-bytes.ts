import type { UploadInput } from "./types.js";

/**
 * In-memory test-double plumbing: drains a contract body into bytes so the fake
 * can emulate object storage. Product adapters must not call this helper for
 * media uploads because it materializes the whole stream in application memory.
 */
export const asBytes = async (
  body: UploadInput["body"],
): Promise<Uint8Array> => {
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
