# Design — `add-embeddable-stories-system`

Technical design for the first product slice of `stories`: a local-first panel
that publishes Instagram-style stories to per-project public manifests on
Supabase, plus a Lit embed for Astro/Next.js sites — with availability and
expiry guaranteed while the operator's PC is off. This document fixes the
package boundaries, data model, the two integration contracts (storage adapter,
manifest schema), the publication/cleanup flows, security controls, and the
test map. It implements nothing and reopens none of the confirmed decisions
(Q1–Q5, locked macro decisions).

- Artifact store: `openspec` (this file).
- Inputs: `proposal.md` (scope, six capabilities, forecast), `exploration.md`
  (PC-off guarantees, sketches, acceptance criteria), `spike-findings.md`
  (Spike A/B results), `openspec/config.yaml` + `openspec/project.md`.
- Prerequisite: `sdd-monorepo-bootstrap` provides the pnpm workspace, TS strict
  config, Vitest, and Playwright. This change consumes them, never recreates
  them.

## Decision index

| # | Decision | One line |
| --- | --- | --- |
| D1 | Cleanup stays panel-driven | Spike A: provider lifecycle only expires non-current object versions → expiry is data-driven, deletion is best-effort hygiene. |
| D2 | CORS preflight is a mandatory browser-context check | Spike B: Supabase storage sets no CORS headers; hosted behavior is gateway-delegated and doc-unverifiable → connection test proves it live, every time. |
| D3 | Two contracts, one home each | The adapter contract lives in `storage-adapters`; the `stories.json` Zod schema lives in `manifest-schema`. Everything else consumes, nothing redefines. |
| D4 | Local truth converges remotely via one atomic step | Media uploads mutate local SQLite + provider objects; the single manifest PUT is the only production cutover. |
| D5 | Orphan objects are accepted, not swept (MVP) | Sweeping crash-window orphans would require a `list` method on the adapter contract; deferred to keep the contract at the agreed five operations. |
| D6 | No CORS headers on the local API | Dev uses the Vite proxy (same-origin); packaged mode serves the panel from the API itself. Origin/Host checks replace CORS. |
| D7 | Embed is client-only, distributed as npm + prebuilt IIFE | No SSR path exists at all; script-tag bundle is the primary integration (Q1). |
| D8 | Secrets live only in local SQLite and are redacted in every response | DTOs omit them; a global `preSerialization` hook is defense in depth; a repo-wide scan test guards the repository. |
| D9 | Policy values are design-owned constants | Manifest TTL 60 s, media cache 1 y immutable, max upload 200 MB (configurable), cleanup interval 60 min, loopback port 3789. |
| D10 | Two-tier verification | Automated suite runs against a fake adapter + provider simulator; the real-provider PC-off run is an apply-phase, operator-credentials step recorded in `verify.md`. |

**Delivery decision: PENDING — not taken in this design.** Forecast stays
1,900–3,100 changed lines (5–8× the 400-line review budget). Per
`ask-on-risk` / `chain_strategy: deferred`, the chain-vs-single-PR (+ any
`size:exception`) decision belongs to the operator and must be resolved before
`tasks.md` is written. This design assumes no PR sequence and no chain
strategy.

## Package architecture

Layout matches the proposal's recommended target, now fixed. Dependency edges
point downward only; `storage-adapters` types never leak upward (R4).

```text
packages/
  manifest-schema/    zod-only. stories.json schema + types. No internal deps.
  storage-adapters/   adapter contract + Supabase impl + contract test suite + fake adapter.
  core/               domain: Drizzle schema/migrations, story lifecycle,
                      manifest generation, publication service, cleanup service.
                      depends on: manifest-schema, storage-adapters (contract only).
  local-api/          Fastify loopback REST backbone; wires core + adapters.
                      depends on: core, storage-adapters, manifest-schema.
  panel/              React + Vite UI; the only browser context that talks to
                      both the API and the provider (CORS probe, D2).
                      depends on: manifest-schema (types + probe helper).
  stories-embed/      Lit viewer. depends on: manifest-schema (runtime parse).
apps/
  demo-astro/         minimal consumer site; script-tag integration.
  demo-next/          minimal consumer site; dynamic-import integration.
```

Boundary enforcement (mechanical, not aspirational):

| Rule | Mechanism |
| --- | --- |
| No `@supabase/*` outside `packages/storage-adapters` | ESLint `no-restricted-imports` + a Vitest boundary test that scans package imports. |
| No DB/Drizzle imports outside `core` | Same lint + test pattern. |
| `manifest-schema` stays dependency-light | Only `zod`; the embed can bundle it (bundle budget: IIFE ≤ 50 KB gzipped including Lit + Zod). |

Scoped package names: `@stories/manifest-schema`, `@stories/storage-adapters`,
`@stories/core`, `@stories/local-api`, `@stories/panel`,
`@stories/stories-embed`.

## Data model (SQLite via Drizzle, in `core`)

Timestamps are stored as integer epoch-ms UTC and serialized as ISO-8601 `Z`
strings at every boundary. UUIDs are generated app-side (v4).

```ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  provider: text('provider').notNull(),            // 'supabase' | 'insforge'
  bucket: text('bucket').notNull(),
  manifestKey: text('manifest_key').notNull().default('stories.json'),
  publicBaseUrl: text('public_base_url').notNull(),
  credentialsJson: text('credentials_json').notNull(), // service-role material; never selected into DTOs (D8)
  lastConnectionCheck: text('last_connection_check'),  // JSON ConnectionCheckResult | null
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),                    // 'photo' | 'video'
  mediaKey: text('media_key').notNull(),
  posterKey: text('poster_key'),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  durationSeconds: integer('duration_seconds'),
  position: integer('position').notNull().default(0),
  status: text('status').notNull().default('published'), // published | expired | cleaned
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  cleanedAt: integer('cleaned_at', { mode: 'timestamp_ms' }),
  lastCleanupError: text('last_cleanup_error'),
});

export const publishHistory = sqliteTable('publish_history', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  manifestVersion: integer('manifest_version').notNull(),
  contentJson: text('content_json').notNull(),     // exact bytes published (rollback source)
  storyIdsJson: text('story_ids_json').notNull(),
  result: text('result').notNull(),                // 'success' | 'failed'
  errorDetail: text('error_detail'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
});
```

Story status state machine (explicit statuses per the proposal):

```text
published ──(expiresAt <= now, sweep)──▶ expired ──(adapter.delete ok)──▶ cleaned
published ──(operator removes story)──▶ row deleted; media deleted best-effort by cleanup sweep of orphans-of-record
```

- `published` means "live local truth, eligible for the next manifest" — not
  "present in the current remote manifest". The remote manifest converges on
  the next explicit publish (D4). With immediate-publish (Q2) the panel
  triggers a project publish automatically after each story mutation; the
  operator can also publish manually.
- `expired` is materialized by `expireStories(now)` in `core`, invoked on API
  startup, before manifest generation, and before cleanup — never trusted from
  a stale column on correctness paths.
- Migrations: Drizzle Kit, forward-only, checked into `core/drizzle/`.

## Storage adapter contract (`packages/storage-adapters`)

Exactly five operations plus one probe — matching the proposal's contract
scope. Provider SDK types are wrapped at this boundary; consumers only ever see
`StorageAdapter`, `AdapterError`, and the result types below.

```ts
export type ProviderId = 'supabase' | 'insforge';

export interface AdapterConfig {
  readonly bucket: string;
  readonly publicBaseUrl: string;   // e.g. https://<ref>.supabase.co/storage/v1/object/public/<bucket>
}

export interface UploadInput {
  readonly key: string;             // object key, e.g. stories/<storyId>/media.mp4
  readonly body: ReadableStream<Uint8Array> | Uint8Array;
  readonly contentType: string;
  readonly contentLength: number;   // mandatory; enables verify + streaming guard
  readonly cacheControlSeconds: number; // 60 for the manifest, 31_536_000 for media (D9)
}

export interface ObjectExpectation {
  readonly contentType?: string;
  readonly size?: number;
}

export type VerifyResult =
  | { readonly ok: true; readonly size: number; readonly contentType: string | null }
  | { readonly ok: false; readonly code: AdapterErrorCode; readonly detail: string };

export type PublicReadCheck =
  | { readonly ok: true; readonly httpStatus: number }
  | { readonly ok: false; readonly code: AdapterErrorCode; readonly httpStatus?: number;
      readonly remediation: string };

export interface StorageAdapter {
  readonly provider: ProviderId;
  upload(input: UploadInput): Promise<{ readonly etag?: string }>;
  verify(key: string, expected?: ObjectExpectation): Promise<VerifyResult>;
  publicUrl(key: string): string;
  delete(key: string): Promise<void>;
  /** Node-side (no CORS semantics): proves reachability + public read. */
  checkPublicRead(): Promise<PublicReadCheck>;
}

export type AdapterErrorCode =
  | 'AUTH_FAILED' | 'BUCKET_NOT_FOUND' | 'BUCKET_NOT_PUBLIC'
  | 'UPLOAD_FAILED' | 'OBJECT_NOT_FOUND' | 'VERIFY_MISMATCH'
  | 'DELETE_FAILED' | 'NETWORK_ERROR' | 'CORS_BLOCKED' | 'UNKNOWN';

export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    readonly provider: ProviderId,
    message: string,
    readonly remediation?: string,   // operator-facing, per-provider steps
    readonly cause?: unknown,
  ) { super(message); }
}
```

Contract rules:

- **Error wrapping.** Adapters never throw raw SDK/network errors; everything
  is normalized to `AdapterError` with a code from the taxonomy above.
  `remediation` carries provider-specific operator guidance (populated for
  auth, bucket, public-read, and CORS-adjacent failures).
- **No TTL/lifecycle API in the contract** (D1, Spike A): nothing here expresses
  "delete at timestamp". Deletion is an explicit `delete` call from cleanup.
- **Contract test suite is first-class** and lives in the package:
  `runStorageAdapterContractSuite(makeAdapter: () => Promise<StorageAdapter>)`.
  It asserts, for any provider: upload→verify round-trip (size/content-type
  match and mismatch paths), `publicUrl` shape, delete → `OBJECT_NOT_FOUND` on
  verify, `checkPublicRead` on a public vs. non-public bucket, error-code
  mapping for bad credentials, and `cacheControlSeconds` propagation on upload.
- **Two implementations ship now:** the Supabase reference adapter
  (service-role credentials, held only in local SQLite) and an in-memory fake
  used by the suite, local-api integration tests, and the provider simulator.
  The suite runs against both; the Supabase profile additionally runs live when
  env credentials are present (`STORIES_E2E_SUPABASE_*`), skipped otherwise.
- **InsForge** implements the same suite later; nothing in the contract names
  Supabase except the reference adapter file itself (D3).

### CORS probe (D2, Spike B) — where it actually runs

Browser-enforced CORS cannot be observed from Node, and Spike B showed hosted
CORS behavior is gateway-delegated and doc-unverifiable. The connection test is
therefore a two-context orchestration owned by `project-management`:

1. **Node probe** (`adapter.checkPublicRead()` via local-api): proves DNS/TLS/
   auth/public-read. If this fails, diagnosis is `network`/`not-public` — CORS
   is not implicated.
2. **Browser probes** (panel, real origin = the Vite/packaged panel origin):
   plain `fetch(publicManifestUrl)` and a ranged `fetch(mediaUrl, { headers: {
   Range: 'bytes=0-1023' } })`. A rejected fetch (TypeError) with a passing
   Node probe ⇒ diagnosis `cors`.
3. The panel POSTs the combined `CorsCheckResult` to the API, which stores it
   on `projects.lastConnectionCheck` and renders operator-facing remediation
   (per-provider dashboard/CLI steps) on failure. Range requests are part of
   the check (video seeking depends on them).

The Playwright demo smokes are the end-to-end CORS proof on real site origins;
the hands-on confirmation against the operator's real Supabase project happens
in apply and is recorded in `verify.md`.

## Manifest schema (`packages/manifest-schema`)

Final schema; the exploration sketch is promoted verbatim with the strictness
rules made explicit. Versioned from day one; additive-only within v1.

```ts
import { z } from 'zod';

export const MANIFEST_VERSION = 1;

/** UTC ISO-8601 with `Z` suffix only — Zod's .datetime() rejects offsets by default. */
export const isoUtc = z.string().datetime();

export const manifestStorySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['photo', 'video']),
  mediaUrl: z.string().url(),
  posterUrl: z.string().url().optional(),
  createdAt: isoUtc,
  expiresAt: isoUtc,
  position: z.number().int().min(0),
}).strict();

export const manifestSchemaV1 = z.object({
  version: z.literal(MANIFEST_VERSION),
  projectId: z.string().uuid(),
  generatedAt: isoUtc,
  stories: z.array(manifestStorySchema).max(100),
}).strict();

export type Manifest = z.infer<typeof manifestSchemaV1>;
export type ManifestStory = z.infer<typeof manifestStorySchema>;
```

Rules encoded here and enforced by generation:

- **Versioning.** `version` is a literal. Additive optional fields are the only
  allowed change within v1; breaking changes require v2 alongside v1 for a
  deprecation window. Consumers (embed) assert the literal and no-op with a
  console warning on unknown versions — never guess.
- **UTC everywhere.** `isoUtc` rejects non-`Z` timestamps at parse time.
- **No secrets, no provider-internal IDs.** Only public URLs and story UUIDs.
- **Ordering.** Stories are serialized sorted by `position` asc, `createdAt`
  desc as tiebreak (operator-controlled order, chronological default, Q3).
  The embed trusts manifest order; it does not re-sort.
- **Expiry exclusion at generation.** `expiresAt > generatedAt` or the story is
  omitted; combined with the embed-side filter this is the two-layer PC-off
  expiry guarantee (R2, R8 defense in depth).

### Cache TTL policy (R2, D9)

| Object | `Cache-Control` | Enforced by |
| --- | --- | --- |
| `stories.json` | `public, max-age=60` | `cacheControlSeconds: 60` on the manifest upload; Supabase persists it as object metadata and serves it as the response header. |
| Media + posters | `public, max-age=31536000, immutable` | `cacheControlSeconds: 31536000` on media uploads; keys are content-addressed per story (new story ⇒ new key), so long cache is safe. |

60 s bounds worst-case expiry visibility to ~60 s of CDN/browser staleness; the
embed-side filter covers the residual window. The provider simulator mirrors
these headers so integration tests can assert the policy end-to-end.

## Publication flow (atomic cutover, rollback)

Owned by the publication service in `core`; exposed by local-api as
`POST /api/projects/:id/publish`.

```text
1. expireStories(now)                        # local truth swept; expired excluded
2. For each story with un-uploaded media:    # (normally done at story creation)
     adapter.upload(media/poster) → adapter.verify(key, { size, contentType })
     any failure → abort, manifest untouched
3. Build Manifest from SQLite (exclude expired, sort per schema rules),
   serialize deterministically (fixed key order, no pretty-print)
4. adapter.upload({ key: manifestKey, body, cacheControlSeconds: 60 })   # ← atomic cutover
5. Verify round: adapter.verify(manifestKey, { size, contentType: 'application/json' })
   + read-back: fetch(adapter.publicUrl(manifestKey)) → parse with manifestSchemaV1
   → story-id set equality with step 3
6. Insert publish_history row: result='success', contentJson = exact bytes
   (retain last 50 rows per project; older pruned)
```

Failure semantics:

| Failure point | State after | Panel behavior |
| --- | --- | --- |
| Step 2 upload/verify | Previous manifest still serving; new media may be orphaned (accepted, D5) | Error surfaced with `AdapterError.code`; publish_history row `result='failed'` |
| Step 4 upload | Previous manifest still serving (single-object PUT is atomic per object) | Same as above |
| Step 5 read-back/parse mismatch | New manifest may be live but is treated as unverified; previous bytes are known from history | Failure surfaced; operator can republish or rollback |
| Crash anywhere | At worst an orphan object + previous manifest — harmless and consistent | Startup sweep reports orphans-of-record only (DB-known rows) |

**Rollback** = `POST /api/projects/:id/rollback` → take the latest
`result='success'` history row → re-run steps 3–7 substituting its stored
`contentJson` verbatim as step 3's output. Verbatim, not regenerated: expired
stories in the restored bytes still self-expire via data (generation + embed
filter), so restoring bytes can never resurrect a live expired story. The PC-off
acceptance criterion depends on this being the only write path to the public
manifest.

## Expired-media cleanup flow (best-effort, D1)

Owned by the cleanup service in `core`; runs inside local-api. Spike A decided
this: provider lifecycle rules expire only non-current object versions and are
day-granular bucket/prefix rules, so per-story `expiresAt` deletion does not
exist and must not be modeled.

```text
Triggers: local-api startup · every 60 min (D9, configurable) · POST /api/projects/:id/cleanup (manual)
Algorithm:
  1. expireStories(now)
  2. SELECT stories WHERE status='expired' AND mediaKey IS NOT NULL
  3. For each: adapter.delete(mediaKey); adapter.delete(posterKey) if set
       success → status='cleaned', cleanedAt=now, lastCleanupError=null
       failure → lastCleanupError = '<code>: <detail>'; continue   # never breaks the job
  4. Emit CleanupReport { attempted, deleted, failed, errors: [{ storyId, code }] }
```

- Cleanup deletes storage objects only; it is never on the expiry correctness
  path. Availability and expiry work with cleanup permanently broken (R7
  accepted): expired media remains reachable by direct URL until the next
  successful run, and the panel documents that window to the operator.
- `stories.json` needs no remote action on expiry: the next regeneration
  excludes expired stories, and the embed filters client-side in the meantime.
- Deletion of a removed story's media reuses the same path: the story row is
  deleted and its media keys are recorded for the sweep via a `story_media_
  pending_deletion` companion row written in the same transaction as the story
  delete — best-effort, same report.

## Media upload path (streaming + limits, R5)

```text
Panel form → POST /api/projects/:id/stories  (multipart/form-data, loopback only)
  fields: type, expiresAt, position, durationSeconds?
  files:  media (required), poster (optional, see below)
local-api: @fastify/multipart streaming handler
  → fileSize limit = min(part size, STORIES_MAX_UPLOAD_MB, default 200 MB) → 413 on exceed
  → Zod-parse fields FIRST (reject before touching the stream)
  → pipe file part body → adapter.upload({ ..., contentLength: part.file.bytesExpected })
  → adapter.verify(key, { size, contentType })
  → INSERT story row (status='published') + auto-trigger project publish (Q2)
```

- Streaming end-to-end: browser `File` → multipart part stream → adapter body.
  No full-file buffering in the API; `contentLength` travels with the part so
  the adapter can guard and later verify.
- Limits are surfaced in the panel UI (pre-check `file.size`, show the current
  limit); exceeding returns HTTP 413 with a typed error payload.
- Loopback-only transport means the stream is disk-to-disk on the operator's
  machine; the 200 MB default bounds a single story, not bandwidth.

## Poster capture (Q4, panel-side)

At video file selection, before submit:

1. Create an object-URL `<video>`, wait for `loadedmetadata`, seek to
   `min(0.1s, duration / 2)`.
2. Draw the frame to a canvas capped at 720 px on the long edge; export
   `image/jpeg`, quality 0.8 → `Blob`.
3. Attach as the `poster` part of the same multipart POST
   (`posterKey = stories/<id>/poster.jpg`).

Non-blocking rules: capture runs concurrently with operator input; a capture
failure or 3 s timeout simply omits the poster part and publish proceeds
(`posterUrl` absent in the manifest; embed shows its media-only fallback).
Poster is never a publish prerequisite, and no operator-supplied image path
exists in the MVP (Q4 chosen answer).

## Secret handling (R6, D8)

| Layer | Control |
| --- | --- |
| Storage | Service-role credentials live only in `projects.credentials_json` in the local SQLite file on the operator's PC. Plaintext-at-rest is an accepted local-first trade-off (single machine, no deployment); OS-keychain encryption is a future option, not MVP. |
| API responses | DTOs never select credential columns; additionally a global Fastify `preSerialization` hook runs `redactDeep()`, replacing values of keys matching `/(credential\|secret\|token\|api.?key\|service.?role)/i` with `"[REDACTED]"`. Defense in depth: even a forgotten column lands redacted. |
| Logs | Fastify logger serializers redact `authorization`/`cookie` headers and credential-keyed fields. |
| Repository | `.env*` git-ignored (bootstrap); a repo-wide Vitest scan test asserts no fixture secret and no tracked credential-bearing file patterns. |
| Transport | Loopback only; provider calls use HTTPS with credentials from SQLite, never from the panel bundle. |

## Loopback security (local API)

| Control | Design |
| --- | --- |
| Binding | `fastify({ logger: true }).listen({ host: '127.0.0.1', port: 3789 })` — never `0.0.0.0`; port overridable via `STORIES_API_PORT` (D9). |
| Host validation | `onRequest` hook: `Host` must be `127.0.0.1:<port>`, `localhost:<port>`, or `[::1]:<port>`; anything else → `403`. Blocks DNS-rebinding. |
| Local CORS (D6) | The API sets **no** CORS headers. Dev: the panel's Vite dev server proxies `/api` → loopback (same-origin). Packaged: the API serves the built panel statics (same-origin). An `Origin` header on any request must match the localhost allowlist or the request is rejected `403` — cross-origin browser reads are impossible by construction. |
| CSRF-adjacent | Mutations require `Content-Type: application/json` (or multipart for uploads); combined with Host+Origin checks and loopback binding, cross-site drives are blocked. |
| No auth in MVP | Single-operator local process; the Host/Origin/binding trio is the trust boundary. An optional local token is a future hardening, not MVP scope. |

## Embed viewer distribution (Q1, R11, D7)

| Concern | Decision |
| --- | --- |
| Component | `<stories-viewer manifest-url="…">` (Lit). Full-screen tap-through viewer: per-story progress bars, prev/next (tap zones + arrow keys), pause on pointer-hold, photo + video, `posterUrl` fallback to media-only. |
| Expiry defense | After parse, filter `Date.parse(story.expiresAt) > Date.now()`; a story expiring mid-session is filtered on next navigation. Manifest order is trusted (no re-sort). |
| Manifest refresh | Fetch on connect; re-fetch when tab becomes visible if the last fetch is older than 60 s (matches manifest TTL, D9). |
| Version guard | Parse with `manifestSchemaV1`; unknown `version` → console warning + render nothing. Never guess forward. |
| SSR safety | No server path exists. The npm module auto-registers the element only when `typeof window !== 'undefined'`; `defineStoriesViewer()` is exported for explicit registration. No `@lit-labs/ssr`. |
| npm build | Vite library mode → ESM `dist/index.js` + types; `@stories/stories-embed/register` side-effect entry. |
| Prebuilt bundle | Single-file IIFE `dist/stories-viewer.iife.js` (Lit + Zod + styles inlined; zero external assets) — the primary integration path: one `<script defer src>` + the custom element tag. Budget ≤ 50 KB gzipped. |
| Demos | `demo-astro`: plain script tag + element in a static page. `demo-next`: `dynamic(() => import('@stories/stories-embed/register'), { ssr: false })` + element. Both consume the IIFE or npm build identically to a real site. |
| CORS dependency | The embed's cross-origin `fetch` of the manifest/media is exactly what the D2 probe and the demo smokes verify. |

## Local API surface (backbone across capabilities 1/3/4/6)

| Method + path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness for the panel + Playwright orchestration. |
| `POST/GET/PATCH/DELETE /api/projects[/:id]` | Project CRUD; responses redacted (D8). |
| `POST /api/projects/:id/connection-test` | Node probe (adapter `checkPublicRead`); returns `{ nodeGet, browserPending: true }`; browser probes arrive via the next endpoint. |
| `POST /api/projects/:id/cors-check` | Panel posts its browser-probe `CorsCheckResult`; stored + diagnosis returned. |
| `POST /api/projects/:id/stories` | Multipart story creation (streaming upload path above); auto-publishes (Q2). |
| `PATCH/DELETE /api/stories/:id` | Edit expiry/position; remove story (+ media pending-deletion row). |
| `POST /api/projects/:id/publish` | Publication flow. |
| `GET /api/projects/:id/publish-history` | History listing. |
| `POST /api/projects/:id/rollback` | Republish last successful manifest bytes. |
| `POST /api/projects/:id/cleanup` · `GET /api/cleanup/status` | Manual cleanup + last report. |

All request bodies are Zod-validated (schemas from `manifest-schema` and
`core`); all responses pass the redaction hook.

## Verification map (acceptance criteria → tests)

**Two-tier strategy (D10).** Tier 1 is the automated suite: a fake adapter and
a static "provider simulator" server (serves `stories.json` + media with the
D9 cache headers) prove all logic without provider credentials. Tier 2 is the
apply-phase run against the operator's real Supabase project (hands-on items
from `spike-findings.md`), recorded as evidence in `verify.md`. Playwright
orchestrates real processes: it starts the provider simulator + local-api +
demo apps, and for the PC-off test **stops local-api before loading the site**.

| # | Acceptance criterion (abridged) | Automated proof (Tier 1) | Live proof (Tier 2) |
| --- | --- | --- | --- |
| 1 | Photo story publishes; manifest + media serve with panel off | Vitest: publication service against fake adapter → manifest bytes valid; Playwright PC-off: publish via API → kill local-api → demo site renders media from the simulator | Same flow against the operator's real bucket, executed once in apply |
| 2 | 24 h story expires: manifest excludes + embed filters by client clock | Vitest: `expireStories`/generation with fake clock excludes expired; embed filter unit test with `vi.setSystemTime` | Manifest re-fetch after expiry on the real bucket |
| 3 | Failed media verification aborts; previous manifest keeps serving; panel shows failure | Vitest integration: fake adapter verify-failure → manifest bytes unchanged, `publish_history` row `failed`, API error payload | — |
| 4 | Successful publication cacheable per short-TTL policy | Vitest: fake adapter records `cacheControlSeconds: 60`; provider simulator asserts `Cache-Control: public, max-age=60` on the served manifest; schema round-trip on read-back | `curl -I` on the real manifest URL |
| 5 | Cleanup: per-story delete, successes → `cleaned`, failures reported, job continues | Vitest: fake adapter with mixed delete results → status transitions + `CleanupReport` shape + job completes | Real bucket: expired objects disappear |
| 6 | Supabase adapter passes contract suite; no Supabase types outside the package | `runStorageAdapterContractSuite` on fake + (env-gated) live Supabase; ESLint + Vitest boundary scan test | Live profile with operator credentials |
| 7 | Expiry outside 24 h–30 d rejected by Zod, surfaced as UI error | Vitest: boundary refinements (`expiresAt` 24 h–30 d in the future); panel form error mapping | — |
| 8 | Credentials never in plaintext responses; never in repo | Vitest: fixture project + every GET endpoint scanned for the secret; repo-wide scan test | — |
| 9 | Embed renders photo+video: plain HTML, Astro, Next.js | Playwright smokes: static page + both demos, viewer opens, navigation, video plays | Real manifest URL in the demos |
| 10 | Panel offline end-to-end; site renders from provider alone | Playwright PC-off scenario (Tier 1 simulator) | Apply-phase run with real project |

Test placement: unit + contract tests in each package (`*.test.ts` beside
sources, Vitest); integration tests in `local-api/test/` with the fake adapter
injected via the service factories; boundary scan at the repo root;
Playwright specs under `e2e/` with the process orchestration in
`playwright.config.ts` web servers. Strict TDD (RED→GREEN→TRIANGULATE→REFACTOR)
applies from the first task, per `openspec/config.yaml`.

## Spike findings → design consequences (not re-investigated)

| Finding | Design consequence |
| --- | --- |
| **Spike A:** Supabase lifecycle rules expire only *non-current* object versions (versioning on, day-granular bucket/prefix rules); InsForge exposes no lifecycle API. | Cleanup is panel-driven best-effort on startup + 60-min interval (D1). The adapter contract has **no** TTL/lifecycle surface; expiry is purely data-driven (`expiresAt` UTC + generation exclusion + embed filter). R7's direct-URL window is accepted and documented in the panel. Provider lifecycle is noted as a possible future optimization only. |
| **Spike B:** Supabase storage sets no CORS headers itself (`kong should take care of cors`); hosted behavior is gateway-delegated and doc-level permissiveness is unverified. | The connection test's CORS preflight is **mandatory** and runs in the browser context with a Node reachability probe to isolate `cors` from `network` (D2). Range-request checking is part of the probe. Failures render per-provider manual remediation steps. Playwright demo smokes are the end-to-end CORS proof; hands-on confirmation against the real project is an apply-phase item. |

## Deviations and accepted gaps

- **Orphan sweep (D5).** `exploration.md` sketched "orphans swept by cleanup".
  Sweeping crash-window orphans (uploaded bytes with no DB row) requires a
  `list` operation on the adapter contract, which the proposal fixed at five
  operations + probe. MVP: orphans are harmless (never referenced by any
  manifest) and accepted; DB-known pending deletions **are** swept (see
  cleanup flow). A `list`-based reconciliation is the first candidate when the
  contract is extended for InsForge.
- **`published` status semantics.** With immediate publish (Q2) the panel
  auto-publishes after story mutations, but "published" formally means
  "eligible local truth"; the remote manifest is the convergence point of the
  atomic publish, not a per-story write. This keeps exactly one production
  write path (D4) and makes rollback trivially safe.

## Parameters owned by this design (D9, adjustable at spec time)

| Parameter | Value | Where enforced |
| --- | --- | --- |
| Manifest cache TTL | 60 s | Upload `cacheControlSeconds`, embed refresh interval, simulator headers |
| Media cache TTL | 1 y, immutable | Upload `cacheControlSeconds` (content-addressed keys) |
| Max upload size | 200 MB (`STORIES_MAX_UPLOAD_MB`) | Multipart limit + panel pre-check |
| Cleanup interval | 60 min | local-api scheduler |
| Expiry window | 24 h–30 d in the future | Zod refinement in `core` |
| Manifest story cap | 100 per manifest | `manifestSchemaV1` |
| Loopback bind | `127.0.0.1:3789` (`STORIES_API_PORT`) | local-api bootstrap |
| Poster | 720 px long edge, JPEG q0.8, 3 s capture timeout | Panel capture util |
| Manifest version | `1` | `manifestSchemaV1` literal |

## Checklist for reviewers

- [ ] Package boundaries: adapter types and DB types cannot leak (mechanisms, not intentions).
- [ ] The two contracts (adapter, manifest schema) are unambiguous enough for delta specs to be written from them without further design.
- [ ] Publication failure table covers every step; rollback restores bytes verbatim and cannot resurrect expired stories.
- [ ] Cleanup never gates correctness; the R7 window is operator-visible.
- [ ] CORS probe runs in the browser context (D2) and the PC-off proof exists at both tiers (D10).
- [ ] No Q1–Q5 decision reopened; the delivery decision is explicitly left pending for `ask-on-risk`.

## Next step

Resolve the delivery decision with the operator under `ask-on-risk`
(chain vs. single PR vs. `size:exception`) — **before** `tasks.md`. Then write
the six delta specs, starting with `manifest-publication` and
`media-storage-adapters` (they own the two contracts designed here).
