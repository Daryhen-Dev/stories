/**
 * Publication policy constants (D9, MP R6, tasks PR 6): the manifest PUT
 * requests a 60 s cache TTL, media uploads request one year immutable, the
 * manifest body is always JSON, and at least the last 50 history rows are
 * retained per project.
 */
export const MANIFEST_CACHE_CONTROL_SECONDS = 60;
export const MEDIA_CACHE_CONTROL_SECONDS = 31_536_000;
export const MANIFEST_CONTENT_TYPE = "application/json";
export const PUBLISH_HISTORY_LIMIT = 50;
