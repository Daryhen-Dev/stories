import type { Manifest, ManifestStory } from "@stories/manifest-schema";

/** Render-ready story data; an absent poster remains absent for the viewer. */
export interface ManifestStoryModel {
  readonly id: string;
  readonly type: ManifestStory["type"];
  readonly mediaUrl: string;
  readonly posterUrl?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly position: number;
}

/** Pure viewer state derived only from a validated manifest and a client clock. */
export interface ManifestModel {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly stories: readonly ManifestStoryModel[];
}

/** SEV R2/R3: expiry is client-clock based and serialized manifest order is trusted. */
export function filterActiveStories(
  manifest: Manifest,
  now: Date,
): ManifestModel {
  const nowTime = now.getTime();
  const stories: ManifestStoryModel[] = [];
  for (const story of manifest.stories) {
    if (new Date(story.expiresAt).getTime() > nowTime) {
      stories.push(toManifestStoryModel(story));
    }
  }
  return {
    projectId: manifest.projectId,
    generatedAt: manifest.generatedAt,
    stories,
  };
}

function toManifestStoryModel(story: ManifestStory): ManifestStoryModel {
  return {
    id: story.id,
    type: story.type,
    mediaUrl: story.mediaUrl,
    ...(story.posterUrl === undefined ? {} : { posterUrl: story.posterUrl }),
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    position: story.position,
  };
}
