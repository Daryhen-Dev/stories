/**
 * Boundary serialization for the epoch-ms instants stored across core's
 * tables: every boundary (manifest bytes, API responses, logs) carries
 * ISO-8601 UTC strings with the `Z` suffix — never local-offset forms.
 * Epoch-ms storage itself is centralized in `db/schema.ts`
 * (`mode: 'timestamp_ms'`).
 */
export function toIsoUtcZ(instant: Date): string {
  return instant.toISOString();
}
