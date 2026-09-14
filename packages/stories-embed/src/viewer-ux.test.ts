// @vitest-environment happy-dom
/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoriesViewer } from "./stories-viewer.js";

const TAG_NAME = "stories-viewer";
const NOW = "2026-09-14T12:00:00Z";
const FIRST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SECOND_ID = "4f2504e0-4f89-11d3-9a0c-0305e82c3302";
const THIRD_ID = "5f2504e0-4f89-11d3-9a0c-0305e82c3303";

const createViewer = (): StoriesViewer => {
  if (customElements.get(TAG_NAME) === undefined) {
    customElements.define(TAG_NAME, StoriesViewer);
  }
  return document.createElement(TAG_NAME) as StoriesViewer;
};

const story = (
  id: string,
  type: "photo" | "video",
  expiresAt = "2026-09-14T13:00:00Z",
  posterUrl?: string,
) => ({
  id,
  type,
  mediaUrl: `https://cdn.example.com/${id}.${type === "photo" ? "jpg" : "mp4"}`,
  ...(posterUrl === undefined ? {} : { posterUrl }),
  createdAt: "2026-09-14T10:00:00Z",
  expiresAt,
  position: 0,
});

const response = (stories: object[]) => ({
  ok: true,
  text: async () =>
    JSON.stringify({
      version: 1,
      projectId: "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c",
      generatedAt: NOW,
      stories,
    }),
});

async function loadViewer(stories: object[]): Promise<StoriesViewer> {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(stories)));
  const viewer = createViewer();
  viewer.setAttribute("manifest-url", "https://cdn.example.com/stories.json");
  document.body.append(viewer);
  await vi.waitFor(() => {
    expect(viewer.currentStory).toBeDefined();
  });
  await viewer.updateComplete;
  return viewer;
}

describe("StoriesViewer viewer UX", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders ordered photo and video stories with a poster fallback", async () => {
    const posterUrl = "https://cdn.example.com/poster.jpg";
    const viewer = await loadViewer([
      story(FIRST_ID, "photo"),
      story(SECOND_ID, "video", "2026-09-14T13:00:00Z", posterUrl),
      story(THIRD_ID, "video"),
    ]);

    const photo = viewer.shadowRoot?.querySelector<HTMLImageElement>("img");
    expect(photo?.src).toBe(`https://cdn.example.com/${FIRST_ID}.jpg`);
    expect(
      viewer.shadowRoot?.querySelectorAll("[data-progress-segment]"),
    ).toHaveLength(3);

    viewer.next();
    await viewer.updateComplete;
    const posterVideo =
      viewer.shadowRoot?.querySelector<HTMLVideoElement>("video");
    expect(posterVideo?.src).toBe(`https://cdn.example.com/${SECOND_ID}.mp4`);
    expect(posterVideo?.getAttribute("poster")).toBe(posterUrl);

    viewer.next();
    await viewer.updateComplete;
    const mediaOnlyVideo =
      viewer.shadowRoot?.querySelector<HTMLVideoElement>("video");
    expect(mediaOnlyVideo?.src).toBe(`https://cdn.example.com/${THIRD_ID}.mp4`);
    expect(mediaOnlyVideo?.hasAttribute("poster")).toBe(false);
  });

  it("navigates through tap zones and arrow keys while keeping host focusable", async () => {
    const viewer = await loadViewer([
      story(FIRST_ID, "photo"),
      story(SECOND_ID, "photo"),
    ]);

    expect(viewer.tabIndex).toBe(0);
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(viewer.currentStory?.id).toBe(SECOND_ID);

    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(viewer.currentStory?.id).toBe(FIRST_ID);

    const next = viewer.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[aria-label="Next story"]',
    );
    next?.click();
    expect(viewer.currentStory?.id).toBe(SECOND_ID);

    const previous = viewer.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous story"]',
    );
    previous?.click();
    expect(viewer.currentStory?.id).toBe(FIRST_ID);
  });

  it("automatically advances progress and pauses the timer and active video on pointer hold", async () => {
    const viewer = await loadViewer([
      story(FIRST_ID, "video"),
      story(SECOND_ID, "photo"),
    ]);
    const video = viewer.shadowRoot?.querySelector<HTMLVideoElement>("video");
    const pause = vi.fn();
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperties(video ?? {}, {
      pause: { configurable: true, value: pause },
      play: { configurable: true, value: play },
    });

    vi.advanceTimersByTime(2_500);
    await viewer.updateComplete;
    const progress = viewer.shadowRoot?.querySelector<HTMLElement>(
      '[data-progress-segment="0"]',
    );
    const beforePause = Number(progress?.getAttribute("aria-valuenow"));
    expect(beforePause).toBeGreaterThan(0);

    const shell = viewer.shadowRoot?.querySelector<HTMLElement>(".viewer");
    shell?.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(pause).toHaveBeenCalledTimes(1);
    shell?.dispatchEvent(
      new Event("pointerleave", { bubbles: true, composed: true }),
    );
    vi.advanceTimersByTime(5_000);
    await viewer.updateComplete;
    expect(viewer.currentStory?.id).toBe(FIRST_ID);
    expect(Number(progress?.getAttribute("aria-valuenow"))).toBe(beforePause);

    document.dispatchEvent(
      new Event("pointerup", { bubbles: true, composed: true }),
    );
    expect(play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_500);
    expect(viewer.currentStory?.id).toBe(SECOND_ID);
  });

  it("skips a story that expires during the visual session", async () => {
    const viewer = await loadViewer([
      story(FIRST_ID, "photo", "2026-09-14T12:00:01Z"),
      story(SECOND_ID, "photo"),
    ]);

    vi.setSystemTime(new Date("2026-09-14T12:00:01Z"));
    viewer.next();
    await viewer.updateComplete;

    expect(viewer.currentStory?.id).toBe(SECOND_ID);
    expect(viewer.shadowRoot?.querySelector<HTMLImageElement>("img")?.src).toBe(
      `https://cdn.example.com/${SECOND_ID}.jpg`,
    );
    expect(
      viewer.shadowRoot?.querySelectorAll("[data-progress-segment]"),
    ).toHaveLength(1);
  });
});
