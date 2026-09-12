import { z } from "zod";

export const MANIFEST_VERSION = 1;

/** UTC ISO-8601 with `Z` suffix only — Zod's .datetime() rejects offsets by default. */
export const isoUtc = z.string().datetime();

export const manifestStorySchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["photo", "video"]),
    mediaUrl: z.string().url(),
    posterUrl: z.string().url().optional(),
    createdAt: isoUtc,
    expiresAt: isoUtc,
    position: z.number().int().min(0),
  })
  .strict();

export const manifestSchemaV1 = z
  .object({
    version: z.literal(MANIFEST_VERSION),
    projectId: z.string().uuid(),
    generatedAt: isoUtc,
    stories: z.array(manifestStorySchema).max(100),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchemaV1>;
export type ManifestStory = z.infer<typeof manifestStorySchema>;
