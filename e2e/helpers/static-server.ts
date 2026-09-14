import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_PORT = 4175;
const NEXT_ASSETS_DIRECTORY = fileURLToPath(
  new URL("../../apps/demo-next/out/_next/", import.meta.url),
);

const files = {
  "/plain.html": {
    path: fileURLToPath(new URL("../plain.html", import.meta.url)),
    contentType: "text/html; charset=utf-8",
  },
  "/astro/": {
    path: fileURLToPath(
      new URL("../../apps/demo-astro/dist/index.html", import.meta.url),
    ),
    contentType: "text/html; charset=utf-8",
  },
  "/next/": {
    path: fileURLToPath(
      new URL("../../apps/demo-next/out/index.html", import.meta.url),
    ),
    contentType: "text/html; charset=utf-8",
  },
  "/stories-viewer.iife.js": {
    path: fileURLToPath(
      new URL(
        "../../packages/stories-embed/dist/stories-viewer.iife.js",
        import.meta.url,
      ),
    ),
    contentType: "text/javascript; charset=utf-8",
  },
} as const;

export interface StaticServer {
  readonly url: string;
  close(): Promise<void>;
}

/** Serves the static demos and their built assets from a fixed browser origin. */
export function createStaticServer(): Promise<StaticServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url ?? "/", "http://static-server.local")
        .pathname;
      const file =
        files[pathname as keyof typeof files] ?? nextAssetFile(pathname);
      if (file === undefined) {
        response.writeHead(404, { "Content-Length": 0 });
        response.end();
        return;
      }
      try {
        const body = await readFile(file.path);
        response.writeHead(200, {
          "Content-Type": file.contentType,
          "Content-Length": body.byteLength,
        });
        response.end(body);
      } catch {
        response.writeHead(500, { "Content-Length": 0 });
        response.end();
      }
    });
    server.once("error", reject);
    server.listen(STATIC_PORT, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${STATIC_PORT}`,
        close: () => closeServer(server),
      });
    });
  });
}

function nextAssetFile(
  pathname: string,
): { readonly path: string; readonly contentType: string } | undefined {
  const prefix = "/next/_next/";
  if (!pathname.startsWith(prefix)) return undefined;

  const path = resolve(NEXT_ASSETS_DIRECTORY, pathname.slice(prefix.length));
  const relativePath = relative(NEXT_ASSETS_DIRECTORY, path);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return undefined;
  }
  return {
    path,
    contentType: pathname.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8",
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
