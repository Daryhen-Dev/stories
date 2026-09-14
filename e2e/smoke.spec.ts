import { expect, test } from "@playwright/test";

const PROVIDER_URL = "http://127.0.0.1:4173";

test("plain HTML renders the published photo directly from the provider manifest", async ({
  page,
  request,
}) => {
  const manifest = await request.get(`${PROVIDER_URL}/stories.json`);
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["cache-control"]).toBe("public, max-age=60");

  const manifestResponse = page.waitForResponse(
    (response) => response.url() === `${PROVIDER_URL}/stories.json`,
  );
  await page.goto("/plain.html");
  expect((await manifestResponse).headers()["cache-control"]).toBe(
    "public, max-age=60",
  );
  const viewer = page.locator("stories-viewer");
  await expect(viewer).toBeVisible();
  const image = viewer.locator("img[alt='Story media']");
  await expect(image).toHaveAttribute(
    "src",
    `${PROVIDER_URL}/stories/photo-1/media.jpg`,
  );
});

test("Astro renders the published photo directly from the provider manifest", async ({
  page,
}) => {
  await page.goto("/astro/");
  const viewer = page.locator("stories-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img[alt='Story media']")).toHaveAttribute(
    "src",
    `${PROVIDER_URL}/stories/photo-1/media.jpg`,
  );
});

test("Next renders the published photo directly from the provider manifest", async ({
  page,
}) => {
  const manifestResponse = page.waitForResponse(
    (response) => response.url() === `${PROVIDER_URL}/stories.json`,
  );
  await page.goto("/next/");
  expect((await manifestResponse).headers()["cache-control"]).toBe(
    "public, max-age=60",
  );
  const viewer = page.locator("stories-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img[alt='Story media']")).toHaveAttribute(
    "src",
    `${PROVIDER_URL}/stories/photo-1/media.jpg`,
  );
});
