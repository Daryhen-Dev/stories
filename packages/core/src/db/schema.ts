import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Local-first data model (design: "Data model (SQLite via Drizzle, in core)").
 *
 * Timestamps are stored as integer epoch-ms UTC (`mode: 'timestamp_ms'`) and
 * serialized as ISO-8601 `Z` strings only at boundaries. UUIDs are generated
 * app-side (v4): no database-side id defaults exist.
 */

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  provider: text("provider").notNull(), // 'supabase' | 'insforge'
  bucket: text("bucket").notNull(),
  manifestKey: text("manifest_key").notNull().default("stories.json"),
  publicBaseUrl: text("public_base_url").notNull(),
  // D8: service-role material. Storage column only — never selected into DTOs
  // or serializers (PRs 8–9 prove this in depth; here it is simply not mapped).
  credentialsJson: text("credentials_json").notNull(),
  lastConnectionCheck: text("last_connection_check"), // JSON ConnectionCheckResult | null
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'photo' | 'video'
  mediaKey: text("media_key").notNull(),
  posterKey: text("poster_key"),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSeconds: integer("duration_seconds"),
  position: integer("position").notNull().default(0),
  status: text("status").notNull().default("published"), // published | expired | cleaned
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  cleanedAt: integer("cleaned_at", { mode: "timestamp_ms" }),
  lastCleanupError: text("last_cleanup_error"),
});

export const publishHistory = sqliteTable("publish_history", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  manifestVersion: integer("manifest_version").notNull(),
  contentJson: text("content_json").notNull(), // exact bytes published (rollback source)
  storyIdsJson: text("story_ids_json").notNull(),
  result: text("result").notNull(), // 'success' | 'failed'
  errorDetail: text("error_detail"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Media keys awaiting best-effort provider deletion (design: cleanup flow).
 * Written in the same transaction as the story delete (SL R7). `storyId` is a
 * plain reference on purpose — the story row is already gone when this row
 * exists; project deletion still cascades here.
 */
export const storyMediaPendingDeletion = sqliteTable(
  "story_media_pending_deletion",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    mediaKey: text("media_key").notNull(),
    posterKey: text("poster_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
);
