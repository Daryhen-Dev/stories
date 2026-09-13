import { eq } from "drizzle-orm";
import { z } from "zod";

import type { DrizzleDb } from "../db/client.js";
import { stories, storyMediaPendingDeletion } from "../db/schema.js";
import { expiryWindowSchema } from "./expiry-window.js";
import { compareStories } from "./ordering.js";

export type StoryRow = typeof stories.$inferSelect;

export interface ServiceClock {
  /** Reference instant for the window check and row timestamps; tests pin it. */
  readonly now?: Date;
}

const createStoryInputSchema = (now: Date) =>
  z
    .object({
      type: z.enum(["photo", "video"]),
      mediaKey: z.string().min(1),
      posterKey: z.string().min(1).nullish(),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().positive(),
      durationSeconds: z.number().int().positive().nullish(),
      position: z.number().int().min(0).default(0),
      expiresAt: expiryWindowSchema(now),
    })
    .strict();

const updateStoryInputSchema = (now: Date) =>
  z
    .object({
      expiresAt: expiryWindowSchema(now).optional(),
      position: z.number().int().min(0).optional(),
    })
    .strict()
    .refine(
      (patch) => patch.expiresAt !== undefined || patch.position !== undefined,
      { message: "update requires expiresAt or position" },
    );

export type CreateStoryInput = z.input<
  ReturnType<typeof createStoryInputSchema>
>;
export type UpdateStoryInput = z.input<
  ReturnType<typeof updateStoryInputSchema>
>;

/** Thrown when a story id does not exist (endpoints map it to 404 in PR 10). */
export class StoryNotFoundError extends Error {
  constructor(readonly storyId: string) {
    super(`story ${storyId} not found`);
    this.name = "StoryNotFoundError";
  }
}

/**
 * Story domain service (SL R3/R5/R7 local truth). The streaming upload itself
 * belongs to the API layer (PR 10); this service receives the verified
 * storage keys and owns validation, ordering, and removal bookkeeping.
 */
export function createStoryService(db: DrizzleDb) {
  /**
   * Validates first, then inserts an app-generated UUID v4 row with local
   * status `published` (design: creation sets local status; the remote
   * manifest converges on the next publish).
   */
  async function createStory(
    projectId: string,
    input: CreateStoryInput,
    clock: ServiceClock = {},
  ): Promise<StoryRow> {
    const now = clock.now ?? new Date();
    const parsed = createStoryInputSchema(now).parse(input);
    const rows = await db
      .insert(stories)
      .values({
        id: crypto.randomUUID(),
        projectId,
        type: parsed.type,
        mediaKey: parsed.mediaKey,
        posterKey: parsed.posterKey ?? null,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        durationSeconds: parsed.durationSeconds ?? null,
        position: parsed.position,
        status: "published",
        createdAt: now,
        expiresAt: new Date(parsed.expiresAt),
      })
      .returning();
    // SAFETY: an INSERT without a WHERE clause always returns exactly the
    // inserted row; noUncheckedIndexedAccess cannot see that.
    return rows[0] as StoryRow;
  }

  /**
   * Edits expiry/position. Any new `expiresAt` re-validates the window (SL R3
   * at edit time) against the same refinement used at creation.
   */
  async function updateStory(
    id: string,
    patch: UpdateStoryInput,
    clock: ServiceClock = {},
  ): Promise<StoryRow> {
    const now = clock.now ?? new Date();
    const parsed = updateStoryInputSchema(now).parse(patch);
    const set: { expiresAt?: Date; position?: number } = {};
    if (parsed.expiresAt !== undefined) {
      set.expiresAt = new Date(parsed.expiresAt);
    }
    if (parsed.position !== undefined) {
      set.position = parsed.position;
    }
    const [row] = await db
      .update(stories)
      .set(set)
      .where(eq(stories.id, id))
      .returning();
    if (!row) throw new StoryNotFoundError(id);
    return row;
  }

  /** SL R5: rows leave SQLite in operator-controlled order. */
  async function listStories(projectId: string): Promise<StoryRow[]> {
    const rows = await db
      .select()
      .from(stories)
      .where(eq(stories.projectId, projectId));
    return rows.sort(compareStories);
  }

  /**
   * SL R7: the story delete and its pending-deletion record happen in ONE
   * transaction — if the pending insert fails, the whole transaction rolls
   * back and the story row survives with its media keys intact, so cleanup
   * can never lose track of deletable objects.
   */
  async function removeStory(
    id: string,
    clock: ServiceClock = {},
  ): Promise<void> {
    const now = clock.now ?? new Date();
    // better-sqlite3 is a sync driver: inside the transaction the queries run
    // via .get()/.run() — async callbacks are rejected by the transaction.
    await db.transaction((tx) => {
      const row = tx.select().from(stories).where(eq(stories.id, id)).get();
      if (!row) throw new StoryNotFoundError(id);
      tx.delete(stories).where(eq(stories.id, id)).run();
      tx.insert(storyMediaPendingDeletion)
        .values({
          id: crypto.randomUUID(),
          storyId: row.id,
          projectId: row.projectId,
          mediaKey: row.mediaKey,
          posterKey: row.posterKey,
          createdAt: now,
        })
        .run();
    });
  }

  return { createStory, updateStory, listStories, removeStory } as const;
}

export type StoryService = ReturnType<typeof createStoryService>;
