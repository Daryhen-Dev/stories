import type { UploadInput } from "./types.js";

/**
 * Shared upload plumbing: drains any contract body (Uint8Array or single/multi
 * chunk stream) into bytes. Both the in-memory fake and the Supabase adapter
 * consume bodies through this helper (provider-agnostic; no SDK types).
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
