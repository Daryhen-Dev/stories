// @vitest-environment happy-dom
/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoriesViewer } from "./stories-viewer.js";

const TAG_NAME = "stories-viewer";
const NOW = new Date("2026-09-14T12:00:00Z");
// Deterministic stamp point for the viewer's last-fetch time: the fake clock
// is pinned to LOADED_AT the moment a manifest body resolves, so every TTL
// assertion below measures from a known instant instead of accidental
// vi.waitFor polling drift.
const LOADED_AT = new Date(NOW.getTime() + 1_000);
const FIRST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SECOND_ID = "4f2504e0-4f89-11d3-9a0c-0305e82c3302";

const createViewer = (): StoriesViewer => {
  if (customElements.get(TAG_NAME) === undefined) {
    customElements.define(TAG_NAME, StoriesViewer);
  }
  return document.createElement(TAG_NAME) as StoriesViewer;
};

const response = (id: string) => ({
  ok: true,
  text: async () => {
    // The viewer stamps its last-fetch time in the microtask chain that
    // resolves this body, so pinning the clock here makes that stamp exactly
    // LOADED_AT regardless of any polling that happens afterwards.
    vi.setSystemTime(LOADED_AT);
    return JSON.stringify({
      version: 1,
      projectId: "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c",
      generatedAt: NOW.toISOString(),
      stories: [
        {
          id,
          type: "photo",
          mediaUrl: `https://cdn.example.com/${id}.jpg`,
          createdAt: "2026-09-14T10:00:00Z",
          expiresAt: "2026-09-14T13:00:00Z",
          position: 0,
        },
      ],
    });
  },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const setVisibility = (value: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
};

const notifyVisibility = () => {
  document.dispatchEvent(new Event("visibilitychange"));
};

async function loadViewer(
  fetcher: ReturnType<typeof vi.fn>,
): Promise<StoriesViewer> {
  vi.stubGlobal("fetch", fetcher);
  const viewer = createViewer();
  viewer.setAttribute("manifest-url", "https://cdn.example.com/stories.json");
  document.body.append(viewer);
  await vi.waitFor(() => {
    expect(viewer.currentStory?.id).toBe(FIRST_ID);
  });
  return viewer;
}

describe("StoriesViewer visibility refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setVisibility("visible");
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("refreshes the same URL only after the 60 second manifest TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(FIRST_ID));
    await loadViewer(fetcher);

    vi.setSystemTime(new Date(LOADED_AT.getTime() + 60_000));
    notifyVisibility();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(LOADED_AT.getTime() + 60_001));
    notifyVisibility();
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://cdn.example.com/stories.json",
    );
  });

  it("does not keep a visibility listener after disconnect", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(FIRST_ID));
    const viewer = await loadViewer(fetcher);

    viewer.remove();
    vi.setSystemTime(new Date(LOADED_AT.getTime() + 60_001));
    notifyVisibility();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale forced refresh when the manifest URL changes", async () => {
    const forcedRefresh = deferred<ReturnType<typeof response>>();
    const changedUrl = deferred<ReturnType<typeof response>>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(FIRST_ID))
      .mockReturnValueOnce(forcedRefresh.promise)
      .mockReturnValueOnce(changedUrl.promise);
    const viewer = await loadViewer(fetcher);

    vi.setSystemTime(new Date(LOADED_AT.getTime() + 60_051));
    notifyVisibility();
    notifyVisibility();
    expect(fetcher).toHaveBeenCalledTimes(2);

    viewer.setAttribute("manifest-url", "https://cdn.example.com/changed.json");
    changedUrl.resolve(response(SECOND_ID));
    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(SECOND_ID);
    });

    forcedRefresh.resolve(response(FIRST_ID));
    await Promise.resolve();
    expect(viewer.currentStory?.id).toBe(SECOND_ID);
  });
});
