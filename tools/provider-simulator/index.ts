import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const encoder = new TextEncoder();

export interface SimulatorUpload {
  readonly body: Uint8Array | string;
  readonly contentType: string;
  readonly cacheControlSeconds: number;
}

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly cacheControl: string;
}

export interface ProviderSimulator {
  /** Base URL, e.g. http://127.0.0.1:41234 */
  readonly url: string;
  put(key: string, upload: SimulatorUpload): void;
  /** Removes an object and reports whether it existed. */
  delete(key: string): boolean;
  close(): Promise<void>;
}

export interface ProviderSimulatorOptions {
  readonly port?: number;
  /** Explicit browser origins that may read this public test bucket cross-origin. */
  readonly corsOrigins?: readonly string[];
}

const DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:4175"] as const;

const corsHeaders = (
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> => {
  if (origin === undefined || !allowedOrigins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  };
};

const corsPreflightHeaders = (
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> => ({
  ...corsHeaders(origin, allowedOrigins),
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Max-Age": "600",
});

/**
 * D9 cache policy (design table): the manifest's short TTL is served as
 * `public, max-age=60`; the one-year media TTL is served immutable. The
 * simulator mirrors the header the real provider persists from the upload's
 * cacheControl metadata, so the policy is assertable end-to-end (MSA R7).
 */
const cacheControlHeader = (seconds: number): string =>
  seconds >= 31_536_000
    ? `public, max-age=${seconds}, immutable`
    : `public, max-age=${seconds}`;

type Range =
  { readonly start: number; readonly end: number } | "invalid" | null;

/** Parses a single `bytes=a-b` / suffix `bytes=-n` range (RFC 9110 §14.1.1). */
const parseRange = (header: string | undefined, size: number): Range => {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [rawStart, rawEnd] = [match[1] ?? "", match[2] ?? ""];
  if (rawStart === "" && rawEnd === "") return "invalid";
  if (rawStart === "") {
    const length = Number(rawEnd);
    if (length === 0 || size === 0) return "invalid";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return "invalid";
  return { start, end };
};

const respond = (
  res: ServerResponse,
  status: number,
  headers: Record<string, number | string>,
  body?: Uint8Array,
): void => {
  res.writeHead(status, { "Content-Length": 0, ...headers });
  res.end(body);
};

const handle = (
  store: Map<string, StoredObject>,
  allowedOrigins: ReadonlySet<string>,
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  const url = new URL(req.url ?? "/", "http://simulator.local");
  const headers = corsHeaders(req.headers.origin, allowedOrigins);
  if (req.method === "OPTIONS") {
    respond(res, 204, corsPreflightHeaders(req.headers.origin, allowedOrigins));
    return;
  }
  const key = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const stored = store.get(key);
  if (!stored) {
    respond(res, 404, headers);
    return;
  }
  const metadata = {
    ...headers,
    "Content-Type": stored.contentType,
    "Cache-Control": stored.cacheControl,
    "Accept-Ranges": "bytes",
  };
  if (req.method === "HEAD") {
    respond(res, 200, {
      ...metadata,
      "Content-Length": stored.body.byteLength,
    });
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405, {
      ...headers,
      Allow: "GET, HEAD, OPTIONS",
      "Content-Length": 0,
    });
    res.end();
    return;
  }
  const range = parseRange(req.headers.range, stored.body.byteLength);
  if (range === "invalid") {
    respond(res, 416, {
      ...metadata,
      "Content-Range": `bytes */${stored.body.byteLength}`,
    });
    return;
  }
  if (range) {
    const slice = stored.body.subarray(range.start, range.end + 1);
    respond(
      res,
      206,
      {
        ...metadata,
        "Content-Range": `bytes ${range.start}-${range.end}/${stored.body.byteLength}`,
        "Content-Length": slice.byteLength,
      },
      slice,
    );
    return;
  }
  respond(
    res,
    200,
    { ...metadata, "Content-Length": stored.body.byteLength },
    stored.body,
  );
};

/**
 * Static provider simulator (D10 Tier 1): a loopback HTTP server that serves
 * stored objects with their cache-control metadata and Range/206 support —
 * the stand-in for the real provider bucket in integration tests (MSA R7).
 */
export const createProviderSimulator = (
  options: ProviderSimulatorOptions = {},
): Promise<ProviderSimulator> =>
  new Promise((resolve, reject) => {
    const store = new Map<string, StoredObject>();
    const allowedOrigins = new Set(options.corsOrigins ?? DEFAULT_CORS_ORIGINS);
    const server = createServer((req, res) => {
      handle(store, allowedOrigins, req, res);
    });
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        put(key, upload) {
          store.set(key, {
            body:
              typeof upload.body === "string"
                ? encoder.encode(upload.body)
                : upload.body,
            contentType: upload.contentType,
            cacheControl: cacheControlHeader(upload.cacheControlSeconds),
          });
        },
        delete(key) {
          return store.delete(key);
        },
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.closeAllConnections();
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            );
          }),
      });
    });
  });
