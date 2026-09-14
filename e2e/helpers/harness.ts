import {
  createTestDb,
  insertStory,
  seedProject,
} from "../../packages/core/src/db/testing.js";
import {
  buildServer,
  listenServer,
} from "../../packages/local-api/src/index.js";
import {
  createProviderSimulator,
  type ProviderSimulator,
} from "../../tools/provider-simulator/index.js";
import { createSimulatorStorageAdapter } from "./simulator-adapter.js";
import { createStaticServer, type StaticServer } from "./static-server.js";

const API_PORT = 4174;
const STATIC_PORT = 4175;
const PHOTO_KEY = "stories/photo-1/media.jpg";

export interface E2eHarness {
  readonly apiUrl: string;
  readonly projectId: string;
  readonly providerUrl: string;
  readonly staticUrl: string;
  closeApi(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Fixed-port E2E fixture: a public provider origin, a loopback-only local API,
 * and the static browser origin. The latter is reserved for Playwright's server.
 */
export async function createE2eHarness(): Promise<E2eHarness> {
  let simulator: ProviderSimulator | undefined;
  let server: ReturnType<typeof buildServer> | undefined;
  let staticServer: StaticServer | undefined;
  let apiClosed = false;

  try {
    simulator = await createProviderSimulator({
      port: 4173,
      corsOrigins: [`http://127.0.0.1:${STATIC_PORT}`],
    });
    const db = createTestDb();
    const projectId = await seedProject(db, {
      name: "E2E photo stories",
      bucket: "stories-bucket",
      publicBaseUrl: simulator.url,
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await insertStory(db, projectId, {
      id: "00000000-0000-4000-8000-000000000001",
      type: "photo",
      mediaKey: PHOTO_KEY,
      mimeType: "image/jpeg",
      sizeBytes: 11,
      position: 0,
      status: "published",
      expiresAt,
    });

    const adapter = createSimulatorStorageAdapter({
      simulator,
      bucket: "stories-bucket",
      publicReadKey: PHOTO_KEY,
    });
    await adapter.upload({
      key: PHOTO_KEY,
      body: new TextEncoder().encode("photo bytes"),
      contentType: "image/jpeg",
      contentLength: 11,
      cacheControlSeconds: 31_536_000,
    });
    server = buildServer({
      db,
      makeAdapter: () => adapter,
      publicationFetcher: fetch,
      port: API_PORT,
    });
    await listenServer(server, API_PORT);
    staticServer = await createStaticServer();

    const closeApi = async (): Promise<void> => {
      if (apiClosed) return;
      apiClosed = true;
      await server?.close();
    };
    return {
      apiUrl: `http://127.0.0.1:${API_PORT}`,
      projectId,
      providerUrl: simulator.url,
      staticUrl: staticServer.url,
      closeApi,
      close: async () => {
        await staticServer?.close();
        await closeApi();
        await simulator?.close();
      },
    };
  } catch (error) {
    await staticServer?.close();
    await server?.close();
    await simulator?.close();
    throw error;
  }
}
