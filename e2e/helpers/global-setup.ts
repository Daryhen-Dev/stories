import { createE2eHarness } from "./harness.js";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const harness = await createE2eHarness();
  const published = await fetch(
    `${harness.apiUrl}/api/projects/${harness.projectId}/publish`,
    { method: "POST" },
  );
  if (!published.ok) {
    await harness.close();
    throw new Error(
      `E2E fixture publication failed with HTTP ${published.status}`,
    );
  }
  return async () => {
    await harness.close();
  };
}
