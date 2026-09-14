import { afterEach, describe, expect, it } from "vitest";

import { createE2eHarness, type E2eHarness } from "./harness.js";

describe("E2E harness", () => {
  let harness: E2eHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("publishes a seeded future photo through the loopback API to the provider origin", async () => {
    harness = await createE2eHarness();

    const published = await fetch(
      `${harness.apiUrl}/api/projects/${harness.projectId}/publish`,
      { method: "POST" },
    );
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({
      status: "published",
      manifestUrl: `${harness.providerUrl}/stories.json`,
    });

    const manifest = await fetch(`${harness.providerUrl}/stories.json`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await manifest.json()).toMatchObject({
      projectId: harness.projectId,
      stories: [
        {
          type: "photo",
          mediaUrl: `${harness.providerUrl}/stories/photo-1/media.jpg`,
        },
      ],
    });
  });

  it("exposes an idempotent closeApi capability for a later PC-off scenario", async () => {
    harness = await createE2eHarness();

    await harness.closeApi();
    await harness.closeApi();
  });
});
