import { describe, expect, it, vi } from "vitest";

import { loadManifest } from "./manifest-loader.js";

const PROJECT_ID = "9f8c3b5a-2d1e-4f6a-8b7c-5d4e3f2a1b0c";
const MANIFEST_URL = "https://cdn.example.com/stories.json";
const NOW = new Date("2026-09-13T12:00:00Z");

const validManifest = () => ({
  version: 1,
  projectId: PROJECT_ID,
  generatedAt: "2026-09-13T12:00:00Z",
  stories: [
    {
      id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      type: "photo",
      mediaUrl:
        "https://cdn.example.com/stories/3f2504e0-4f89-11d3-9a0c-0305e82c3301/media.jpg",
      createdAt: "2026-09-13T10:00:00Z",
      expiresAt: "2026-09-13T13:00:00Z",
      position: 4,
    },
  ],
});

const response = (body: string, ok = true) => ({
  ok,
  text: async () => body,
});

describe("loadManifest (SEV R4)", () => {
  it("fetches and validates a v1 manifest through the injected seam", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify(validManifest())));
    const warn = vi.fn();

    const result = await loadManifest(MANIFEST_URL, {
      fetcher,
      now: NOW,
      warn,
    });

    expect(fetcher).toHaveBeenCalledWith(MANIFEST_URL);
    expect(result.stories).toMatchObject([
      {
        id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        mediaUrl:
          "https://cdn.example.com/stories/3f2504e0-4f89-11d3-9a0c-0305e82c3301/media.jpg",
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and returns no stories for an unknown manifest version without guessing forward", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(JSON.stringify({ ...validManifest(), version: 2 })),
      );
    const warn = vi.fn();

    const result = await loadManifest(MANIFEST_URL, {
      fetcher,
      now: NOW,
      warn,
    });

    expect(result.stories).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring unsupported stories manifest version: 2.",
    );
  });

  it("warns and returns empty data for malformed JSON and schema-invalid v1 data", async () => {
    const malformedWarn = vi.fn();
    const malformed = await loadManifest(MANIFEST_URL, {
      fetcher: vi.fn().mockResolvedValue(response("not-json")),
      now: NOW,
      warn: malformedWarn,
    });
    const invalidWarn = vi.fn();
    const invalid = await loadManifest(MANIFEST_URL, {
      fetcher: vi
        .fn()
        .mockResolvedValue(
          response(
            JSON.stringify({ ...validManifest(), stories: "not-an-array" }),
          ),
        ),
      now: NOW,
      warn: invalidWarn,
    });

    expect(malformed.stories).toEqual([]);
    expect(malformedWarn).toHaveBeenCalledWith(
      "Stories manifest contained malformed JSON.",
    );
    expect(invalid.stories).toEqual([]);
    expect(invalidWarn).toHaveBeenCalledWith(
      "Stories manifest failed schema validation.",
    );
  });

  it("warns and returns empty data when the manifest HTTP request is unsuccessful", async () => {
    const warn = vi.fn();

    const result = await loadManifest(MANIFEST_URL, {
      fetcher: vi.fn().mockResolvedValue(response("provider failure", false)),
      now: NOW,
      warn,
    });

    expect(result.stories).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Stories manifest request was unsuccessful.",
    );
  });
});
