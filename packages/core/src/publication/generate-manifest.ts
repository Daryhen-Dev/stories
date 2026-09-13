import { and, eq } from "drizzle-orm";
import { MANIFEST_VERSION } from "@stories/manifest-schema";
import type { Manifest, ManifestStory } from "@stories/manifest-schema";

import type { DrizzleDb } from "../db/client.js";
import { stories } from "../db/schema.js";
import { expireStories } from "../domain/expire-stories.js";
import { compareStories } from "../domain/ordering.js";
import type { StoryRow } from "../domain/story-service.js";
import { toIsoUtcZ } from "../timestamps.js";
import type { ProjectRow } from "./publication-service.js";

export interface GeneratedManifest {
  readonly manifest: Manifest;
  /** Exact serialized bytes (also the `contentJson` history source). */
  readonly json: string;
  readonly bytes: Uint8Array;
  readonly storyIds: readonly string[];
  /** The `published` rows that produced this manifest (publication step 2 input). */
  readonly includedStories: readonly StoryRow[];
}

/** Public provider URL for an object key (same shape the adapter contract pins). */
export function joinPublicUrl(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
}

/**
 * Deterministic serialization (MP R3): fixed key order — the order of the
 * shared Zod schema — and no pretty-print, so equal inputs produce equal
 * bytes. Optional `posterUrl` keeps its schema slot only when present.
 */
export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify({
    version: manifest.version,
    projectId: manifest.projectId,
    generatedAt: manifest.generatedAt,
    stories: manifest.stories.map((story) => ({
      id: story.id,
      type: story.type,
      mediaUrl: story.mediaUrl,
      ...(story.posterUrl === undefined ? {} : { posterUrl: story.posterUrl }),
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      position: story.position,
    })),
  });
}

/**
 * Manifest generation from local truth (MP R3, design steps 1+3): the expiry
 * sweep runs FIRST (SL R4 — the status column is never trusted on correctness
 * paths), then `published` stories are sorted (position asc, createdAt desc)
 * and serialized deterministically.
 */
export async function generateManifest(
  db: DrizzleDb,
  project: ProjectRow,
  now: Date,
): Promise<GeneratedManifest> {
  await expireStories(db, now);
  const rows = (
    await db
      .select()
      .from(stories)
      .where(
        and(eq(stories.projectId, project.id), eq(stories.status, "published")),
      )
  ).sort(compareStories);
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    projectId: project.id,
    generatedAt: toIsoUtcZ(now),
    stories: rows.map((row) => toManifestStory(row, project.publicBaseUrl)),
  };
  const json = serializeManifest(manifest);
  return {
    manifest,
    json,
    bytes: new TextEncoder().encode(json),
    storyIds: rows.map((row) => row.id),
    includedStories: rows,
  };
}

function toManifestStory(row: StoryRow, publicBaseUrl: string): ManifestStory {
  return {
    id: row.id,
    // SAFETY: creation validates `type` against the photo|video enum (SL R1);
    // the column is plain text only because SQLite has no enum type.
    type: row.type as ManifestStory["type"],
    mediaUrl: joinPublicUrl(publicBaseUrl, row.mediaKey),
    ...(row.posterKey === null
      ? {}
      : { posterUrl: joinPublicUrl(publicBaseUrl, row.posterKey) }),
    createdAt: toIsoUtcZ(row.createdAt),
    expiresAt: toIsoUtcZ(row.expiresAt),
    position: row.position,
  };
}
