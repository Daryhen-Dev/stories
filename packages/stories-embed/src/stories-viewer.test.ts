// @vitest-environment happy-dom
/// <reference lib="dom" />

import { beforeEach, describe, expect, it, vi } from "vitest";

import { StoriesViewer } from "./stories-viewer.js";

const TAG_NAME = "stories-viewer";

const createViewer = () => {
  if (customElements.get(TAG_NAME) === undefined) {
    customElements.define(TAG_NAME, StoriesViewer);
  }
  return document.createElement(TAG_NAME) as StoriesViewer;
};

const PROJECT_ID = "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c";
const FIRST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SECOND_ID = "4f2504e0-4f89-11d3-9a0c-0305e82c3302";

const manifest = (stories: object[]) => ({
  version: 1,
  projectId: PROJECT_ID,
  generatedAt: "2026-09-13T12:00:00Z",
  stories,
});

const story = (id: string, expiresAt: string) => ({
  id,
  type: "photo",
  mediaUrl: `https://cdn.example.com/${id}.jpg`,
  createdAt: "2026-09-13T10:00:00Z",
  expiresAt,
  position: 0,
});

const response = (body: object) => ({
  ok: true,
  text: async () => JSON.stringify(body),
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("StoriesViewer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    document.body.replaceChildren();
  });

  it("loads the manifest URL and exposes the current story", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(manifest([story(FIRST_ID, "2026-09-13T13:00:00Z")])),
      );
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();
    viewer.setAttribute("manifest-url", "https://cdn.example.com/one.json");
    document.body.append(viewer);

    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(FIRST_ID);
    });

    expect(fetcher).toHaveBeenCalledWith("https://cdn.example.com/one.json");
    expect(
      viewer.model.stories.map((item: { readonly id: string }) => item.id),
    ).toEqual([FIRST_ID]);
  });

  it("skips stories that expire after load and safely clears an empty model on next", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          manifest([
            story(FIRST_ID, "2026-09-13T12:00:01Z"),
            story(SECOND_ID, "2026-09-13T13:00:00Z"),
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();
    viewer.setAttribute("manifest-url", "https://cdn.example.com/stories.json");
    document.body.append(viewer);

    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(FIRST_ID);
    });
    vi.setSystemTime(new Date("2026-09-13T12:00:01Z"));

    viewer.next();
    expect(viewer.currentStory?.id).toBe(SECOND_ID);

    vi.setSystemTime(new Date("2026-09-13T13:00:00Z"));
    expect(() => viewer.next()).not.toThrow();
    expect(viewer.currentStory).toBeUndefined();
    expect(viewer.model.stories).toEqual([]);
  });

  it("selects the following active story when the current one expires", async () => {
    const thirdId = "5f2504e0-4f89-11d3-9a0c-0305e82c3303";
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          manifest([
            story(FIRST_ID, "2026-09-13T13:00:00Z"),
            story(SECOND_ID, "2026-09-13T12:00:01Z"),
            story(thirdId, "2026-09-13T14:00:00Z"),
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();
    viewer.setAttribute("manifest-url", "https://cdn.example.com/order.json");
    document.body.append(viewer);

    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(FIRST_ID);
    });
    viewer.next();
    expect(viewer.currentStory?.id).toBe(SECOND_ID);

    vi.setSystemTime(new Date("2026-09-13T12:00:01Z"));
    viewer.next();

    expect(viewer.currentStory?.id).toBe(thirdId);
    expect(viewer.model.stories.map((item) => item.id)).toEqual([
      FIRST_ID,
      thirdId,
    ]);
  });

  it("does not fetch when no manifest URL is configured", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(manifest([story(FIRST_ID, "2026-09-13T13:00:00Z")])),
      );
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();

    document.body.append(viewer);
    await viewer.updateComplete;

    expect(fetcher).not.toHaveBeenCalled();
    expect(viewer.currentStory).toBeUndefined();
  });

  it("loads a manifest URL that was set before the element connects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(manifest([story(FIRST_ID, "2026-09-13T13:00:00Z")])),
      );
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();
    viewer.setAttribute("manifest-url", "https://cdn.example.com/preset.json");

    expect(fetcher).not.toHaveBeenCalled();

    document.body.append(viewer);

    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(FIRST_ID);
    });

    expect(fetcher).toHaveBeenCalledWith("https://cdn.example.com/preset.json");
  });

  it("refetches on manifest-url changes and rejects stale load results", async () => {
    const first = deferred<ReturnType<typeof response>>();
    const second = deferred<ReturnType<typeof response>>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetcher);
    const viewer = createViewer();
    document.body.append(viewer);

    viewer.setAttribute("manifest-url", "https://cdn.example.com/first.json");
    await viewer.updateComplete;
    viewer.setAttribute("manifest-url", "https://cdn.example.com/second.json");
    await viewer.updateComplete;
    second.resolve(
      response(manifest([story(SECOND_ID, "2026-09-13T13:00:00Z")])),
    );

    await vi.waitFor(() => {
      expect(viewer.currentStory?.id).toBe(SECOND_ID);
    });
    first.resolve(
      response(manifest([story(FIRST_ID, "2026-09-13T13:00:00Z")])),
    );
    await Promise.resolve();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://cdn.example.com/first.json",
      "https://cdn.example.com/second.json",
    ]);
    expect(viewer.currentStory?.id).toBe(SECOND_ID);
  });
});
