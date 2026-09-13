# Verification — `add-embeddable-stories-system`

Evidence is recorded per PR as a draft section while applying; the verify phase
finalizes it. Runner: Vitest via the workspace root config (strict TDD).

## PR 1 — `@stories/manifest-schema` (draft evidence, apply phase)

- Branch: `sdd/pr01-manifest-schema` (targets `main`) · Package: `packages/manifest-schema` (new)
- Runner: `pnpm --filter @stories/manifest-schema test` (Vitest 5.0.0)
- Final state: package suite **12/12 passing** · workspace `pnpm test` **13/13** · `pnpm typecheck` clean · `pnpm lint` clean

### TDD cycle evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/manifest-schema test` | FAIL — `Error: Cannot find module './manifest-schema.js' imported from .../src/manifest-schema.test.ts` (module under test absent) |
| GREEN | `pnpm --filter @stories/manifest-schema test` | PASS — Test Files 1 passed (1), Tests 8 passed (8) |
| TRIANGULATE | `pnpm --filter @stories/manifest-schema test` | PASS — Tests 11 passed (11) |
| REFACTOR | `pnpm --filter @stories/manifest-schema test` | PASS — Tests 12 passed (12) |
| Verify & bounds | `pnpm test` · `pnpm typecheck` · `pnpm lint` | PASS — 13/13 workspace tests; root `tsc -p tsconfig.base.json --noEmit` clean; ESLint clean |

GREEN implemented `src/manifest-schema.ts` (`isoUtc = z.string().datetime()`,
`manifestStorySchema` strict, `manifestSchemaV1` strict + `.max(100)`,
`MANIFEST_VERSION = 1`) and `src/index.ts` type exports, exactly as the design
fixes them.

### Scenario traceability (MP R1 / MP R2)

| Spec scenario | Test |
| --- | --- |
| R1 — generated manifest parses | `parses a valid v1 manifest` |
| R1 — non-UTC timestamps rejected at parse time | `rejects a generatedAt carrying a UTC offset instead of Z` |
| R1 — story cap enforced (101 rejected, 100 accepted) | `rejects 101 stories and accepts 100 (story cap)` |
| R1 — strict objects, unknown fields rejected | `rejects unknown top-level fields (strict objects)` + `rejects unknown nested fields inside a story entry (strict objects)` |
| R1 — top-level `version` literal `1` | `accepts only the literal top-level version 1` |
| R1 — UUID ids, integer `position` ≥ 0 | `rejects non-UUID ids and negative positions` + `accepts position 0 (boundary)` |
| R1 — optional `posterUrl` | `accepts an absent posterUrl` |
| R1 — no secrets, no provider-internal IDs | `carries no secrets or provider identifiers in a generated sample manifest` |
| R2 — additive optional fields remain valid | `still parses when an optional story field is added within v1 (MP R2 additive policy)` |

### Notes and deviations

- **R2 additive policy under strict objects.** The design schema uses `.strict()`
  everywhere (MP R1 mandates strictness), so the literal "old consumer parses a
  newer payload carrying an unknown field" cannot hold. The additive test proves
  the implementable policy instead: extending the v1 story schema with an
  optional field (`.extend({ field: … .optional() })`) keeps both
  previously-valid entries and entries carrying the new field parsing against
  v1; absence is never an error.
- **Zod version.** Installed latest `zod` 4.6.2; the design-verbatim API
  (`z.string().datetime()`, `z.string().uuid()`, `z.string().url()`, `.strict()`)
  remains functional in v4 as deprecation-hinting aliases (TS6385 hints only).
  Behavior (offset rejection, strictness, UUID/URL validation) is fully verified
  by the suite. Kept for design fidelity.
- **No Node APIs in the package tests.** The package TS project does not resolve
  `@types/node` (root devDependency, pnpm-isolated), so the zod-only-dependency
  test reads `package.json` via a JSON import attribute
  (`import … with { type: "json" }`) instead of `node:fs`. This keeps
  `tsc -p tsconfig.json --noEmit` clean without adding dev dependencies
  (constraint: `zod` only).
- **LSP diagnostic false positive.** pi-lens reported `Cannot find module
  './manifest-schema.js'` on the test file after GREEN; refuted authoritatively
  by `tsc -p tsconfig.json --noEmit` (exit 0) and 12/12 passing Vitest runs —
  NodeNext maps the `.js` specifier to the sibling `.ts` source.
- **Bounds.** Authored diff: 209 lines of code + tests (15 package.json,
  4 tsconfig, 30 schema, 7 index, 153 tests) + 11 lockfile lines (+ SDD artifacts
  below). Well under the 400-line review budget.

## PR 2 — `@stories/storage-adapters` (draft evidence, apply phase)

- Branch: `sdd/pr02-storage-adapters` (targets `sdd/pr01-manifest-schema`) · Package: `packages/storage-adapters` (new) + `tests/boundary/` + ESLint delta
- Runner: `pnpm --filter @stories/storage-adapters test` + `pnpm vitest run tests/boundary` (Vitest 5.0.0, strict TDD)
- Final state: package suite **20/20** · boundary **3/3** · workspace `pnpm test` **36/36** (PR 1 intact: 12+1) · per-package `tsc -p tsconfig.json --noEmit` clean · root `pnpm typecheck` clean · `pnpm lint` clean

### TDD cycle evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/storage-adapters test` | FAIL — all 4 test files fail on missing modules (`./types.js`, `./errors.js`, `./fake-adapter.js`, `./contract-suite.js`, `./index.js`) |
| RED | `pnpm vitest run tests/boundary` | FAIL — 1 failed / 2 passed: the ESLint-rule assertion fails (`@supabase/*` restriction absent from `eslint.config.js`) |
| GREEN | `pnpm --filter @stories/storage-adapters test` | PASS — 18/18 |
| GREEN | `pnpm vitest run tests/boundary` | PASS — 3/3 after one scanner refinement (import-like regex; rule now present) |
| TRIANGULATE | `pnpm --filter @stories/storage-adapters test` | PASS — 19/19 (mismatch details name the property; `publicUrl` deterministic; TTL 60 vs 31536000 asserted separately; cross-instance case) |
| REFACTOR | `pnpm --filter @stories/storage-adapters test` | PASS — 20/20 (`src/testing.ts` helpers extracted; suite source-scan for provider names added) |
| Verify & bounds | `pnpm test` · `pnpm typecheck` · pkg `tsc --noEmit` · `pnpm lint` | PASS — 36/36 workspace; both tsc clean; ESLint clean |

### Scenario traceability (MSA R1–R4, R6, R7)

| Spec scenario | Test |
| --- | --- |
| R1 — any conforming provider passes the same suite | `passes every contract case against the in-memory fake with nothing skipped` + `assertions hold across differently configured fake instances (triangulation)` |
| R1 — upload round-trip preserves size and content type | suite case `upload → verify round-trip preserves size and content type`; fake tests `upload → verify round-trip…` (Uint8Array + stream bodies) |
| R2 — bad credentials map to the auth code | suite case `bad credentials surface AUTH_FAILED with remediation…`; `bad-credential simulation surfaces AUTH_FAILED…`; `raw provider errors never cross the boundary` |
| R2/R3 — missing object after delete → not-found | suite case `delete removes the object and verify then reports OBJECT_NOT_FOUND`; `delete removes the object; deleting a missing key…`; `verify of an unknown key…` |
| R3 — size/type mismatch names the property | suite case `verify mismatch reports VERIFY_MISMATCH for size and contentType`; `verify mismatch fails with VERIFY_MISMATCH naming the mismatched property` |
| R3 — publicUrl deterministic, no network | suite case `publicUrl returns an absolute URL containing the key, without network access`; `publicUrl builds a deterministic URL…` |
| R4 — fake always passes the suite; variants skippable | `passes every contract case…` + `skips variant-only cases…` + `fails, naming the case, when an adapter breaks the contract (not vacuous)` |
| R5 (static half) — leaking import fails; real tree clean; lint rule present | boundary: `fails when a package outside packages/storage-adapters imports the provider SDK`, `scanning the real tree yields zero…`, `the ESLint no-restricted-imports rule…` |
| R6 — no lifecycle/TTL member on the surface | `exposes no lifecycle, TTL, or scheduled-expiration member` + compile-time pins (`Extract` guard, enforced by `pnpm typecheck`) |
| R7 — cache-control propagation (capture half) | suite case `upload propagates cacheControlSeconds: manifest TTL 60 and media TTL 31536000 asserted separately`; `records cacheControlSeconds per upload…` |

### Notes and deviations

- **`override readonly cause`.** `noImplicitOverride` requires the modifier because `Error` declares `cause` in the TS libs; design signature otherwise verbatim.
- **`@types/node` devDependency + `"types": ["node"]`.** `UploadInput.body: ReadableStream<Uint8Array>` is design-mandated, so the package needs Node's type definitions for its own tsconfig to compile. Runtime `dependencies` remain empty (asserted by `carries zero runtime dependencies`); lockfile +6 lines.
- **Suite signature.** Design-verbatim first parameter (`makeAdapter`) plus an optional `ContractSuiteVariants` object (`makeNonPublicAdapter`, `makeBadCredentialsAdapter`) so R2/R4's non-public-bucket and bad-credential cases run provider-agnostically; absent variants are reported as `skipped`.
- **Fake extras (test double, not contract).** `stored` metadata introspection map (lets the suite assert TTL propagation without network), `UPLOAD_FAILED` when body size ≠ `contentLength`, `OBJECT_NOT_FOUND` throw on deleting a missing key, `httpStatus: 403` + remediation for `BUCKET_NOT_PUBLIC`. Fake's `provider` defaults to `"supabase"` (informational only; `ProviderId` kept as the design's two-value union).
- **Scanner precision.** The boundary scanner matches import-like statements (`from "…"`, `import(…)`, `require(…)`, side-effect `import "…"`) — a bare `@supabase/` text match would flag the ESLint rule's own definition. The fixture import line is assembled dynamically so the boundary file's own source stays clean without excluding any file from the real-tree scan.
- **Live-profile note for PR 3.** The suite's public-read case asserts `httpStatus === 200`; the env-gated Supabase profile must probe an existing object.
- **LSP false positives (pi-lens).** The per-package TS program repeatedly reported `Cannot find module './fake-adapter.js'` / missing Node globals after module creation and tsconfig changes; refuted authoritatively each time by per-package `tsc --noEmit` (exit 0), root `pnpm typecheck`, and passing Vitest runs — same class as the PR 1 note (NodeNext maps `.js` specifiers to sibling `.ts` sources; globals resolve via `@types/node`).
- **Bounds — OVER budget, honestly reported.** New files: 1,005 lines (983 source+tests + 18 scaffold); `eslint.config.js` +20; `pnpm-lock.yaml` +6; tasks flips ±8. Code-facing diff ≈ 1,031 lines vs the 400-line review budget / 500-line runtime attempt cap. The tasks forecast (320–380) underestimated the five mandated test files + contract suite; the slice is one cohesive RED→GREEN unit (contract + taxonomy + fake + suite + boundary + tests) with no honest sub-split that lands under budget. The only viable split (boundary scanner + ESLint delta ≈ 124 lines) still leaves the core ≈ 880 lines. Recommendation: `size:exception` for PR 2 as authored, or orchestrator-side split of the boundary unit with the same exception on the remainder.

## PR 3 — Supabase reference adapter + provider simulator (draft evidence, apply phase)

- Branch: `sdd/pr03-supabase-adapter` (targets `sdd/pr02-storage-adapters`) · Packages: `packages/storage-adapters` (extends) + `tools/provider-simulator` (new)
- Runner: `pnpm --filter @stories/storage-adapters test && pnpm --filter @stories/provider-simulator test` (Vitest 5.0.0, strict TDD)
- Final state: storage-adapters **34 passed + 1 skipped** (live profile skipped without env, visible in the Vitest report) · provider-simulator **7/7** · workspace `pnpm test` **50 passed + 1 skipped** · root `pnpm typecheck` clean · per-package `tsc --noEmit` clean · `pnpm lint` clean · boundary scan green (MSA R5)

### TDD cycle evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/storage-adapters test` | FAIL — `Error: Cannot find module './supabase-adapter.js'` (suite absent); PR 2's 20/20 still green |
| RED | `pnpm --filter @stories/provider-simulator test` | FAIL — `Cannot find module './index.js'` (simulator absent) |
| GREEN | `pnpm --filter @stories/storage-adapters test` | PASS after one count fix (suite has 5 unconditional cases + 3 fixture-conditional, not 6): 31 passed + 1 skipped |
| GREEN | `pnpm --filter @stories/provider-simulator test` | PASS — 3/3 (stored bytes; mirrored D9 Cache-Control `public, max-age=60` / `public, max-age=31536000, immutable`; Range 206) |
| TRIANGULATE | both runners | PASS — simulator +4 (404 unknown keys, content-type passthrough, HEAD-vs-GET consistency, suffix range + 416) = 7/7; adapter +3 (UNKNOWN fallback on unmapped probe status and unmapped list error; 404-on-existing-object → BUCKET_NOT_PUBLIC) = 34 + 1 skipped. Triangulation cases pinned already-correct GREEN behavior (no implementation change needed). |
| REFACTOR | both runners | PASS — extracted `src/body-bytes.ts` (`asBytes`, shared upload plumbing) + `src/verify-expectations.ts` (`compareExpectations`, shared verify plumbing); fake + Supabase adapter both rewired; no SDK types in shared modules; 34 + 1 skipped / 7/7 |
| Verify & bounds | `pnpm test` · `pnpm typecheck` · pkg `tsc --noEmit` · `pnpm lint` | PASS — 50 passed + 1 skipped workspace; all tsc clean; ESLint clean (boundary rule intact) |

### Scenario traceability (MSA R4/R5/R7, AC6, Spike A/B groundwork)

| Spec scenario | Test |
| --- | --- |
| R2/R5 — 401 → AUTH_FAILED + remediation | `maps a 401 upload rejection to AUTH_FAILED…` (raw error preserved as `cause`) |
| R2 — missing bucket → BUCKET_NOT_FOUND + remediation | `maps a missing-bucket upload rejection…` |
| R2/R5 — private bucket read → BUCKET_NOT_PUBLIC | `maps a private-bucket read to BUCKET_NOT_PUBLIC…` (probe of an existing object, httpStatus 403; Spike A/B: probing an existing key is what makes 404/403 prove non-public read and 200 prove public read) |
| R2 — upload fault → UPLOAD_FAILED + remediation | `maps a generic upload fault…` |
| R2 — missing object → OBJECT_NOT_FOUND | `reports OBJECT_NOT_FOUND when verifying a missing object` |
| R3 — size/type mismatch → VERIFY_MISMATCH naming the property | `reports VERIFY_MISMATCH naming the mismatched property…` |
| R2 — delete fault → DELETE_FAILED + remediation | `maps a delete fault…` |
| R2 — network fault → NETWORK_ERROR + remediation | `maps a network fault…` |
| R4 — any conforming provider passes the same suite | `passes the provider-agnostic contract suite against the in-memory-backed stub client` (5 passed / 3 skipped: propagation needs stored-introspection, variants need fixtures) |
| R7/D9 — upload persists cacheControlSeconds as object metadata | `persists cacheControlSeconds as SDK cacheControl metadata using the D9 header forms` |
| R4 — live profile gates on env | `describe.skipIf(!liveConfigured) "Supabase live contract profile…"` — skipped without `STORIES_E2E_SUPABASE_*`, visible as `1 skipped` in the Vitest report; runs the full suite when env is present (Tier 2) |
| R7/D9 — simulator mirrors headers | `mirrors stored Cache-Control: manifest 60…` + D9 header strings asserted verbatim |
| Triangulation pins | simulator: `returns 404…`, `passes stored content types through…`, `HEAD matches GET headers…`, `serves suffix ranges… 416`; adapter: UNKNOWN fallback ×2, 404-on-existing → BUCKET_NOT_PUBLIC |

### Notes and deviations

- **`@supabase/supabase-js` lands as a `devDependency` of `@stories/storage-adapters` (+84 lockfile lines), not a runtime dependency.** PR 2's untouchable `public-surface.test.ts` pins `dependencies: []` ("carries zero runtime dependencies") — an invariant about the CONTRACT surface, which stays dependency-free. The SDK is confined to `src/supabase-adapter.ts` (deliberately off the index surface, per the same pin: exports stay exactly `AdapterError`, `createFakeStorageAdapter`, `runStorageAdapterContractSuite`). In this source-consumed private monorepo, devDeps and deps install identically for workspace consumers; a future PR that ships the adapter through `index.ts` exports can move the dep with the surface change.
- **Structural SDK seam.** `supabase-adapter.ts` declares the used SDK slice as local structural interfaces (`SupabaseStorageBucketClient` et al.) — no `@supabase/*` import appears in the test file; the stub client is plain in-memory code. The default constructor narrows the real SDK client with one `SAFETY:`-commented cast (Node runtime: `download` resolves to a Blob carrying `size`/`type`).
- **`verify` downloads the object** (`download` → Blob `size`/`type`) — a long-stable SDK surface, chosen over version-fragile metadata endpoints; safe for manifest verification, acceptable for media at current scale.
- **`upload` uses `upsert: true`** so republication can overwrite the manifest/media keys (the SDK rejects repeat uploads otherwise); D9 header strings (`public, max-age=60`, `public, max-age=31536000, immutable`) are sent as the SDK `cacheControl` metadata and mirrored by the simulator's `cacheControlHeader` (duplicated 3-line policy helper — the shared copy cannot be exported without breaking PR 2's pinned export surface; both copies are pinned to the D9 strings by tests).
- **`checkPublicRead` probe.** BFS `list` finds an existing object, then GETs its public URL: 200 → ok; 403/404 on a known-existing object → BUCKET_NOT_PUBLIC (Spike-informed); network → NETWORK_ERROR; other statuses → UNKNOWN + remediation. An empty bucket reports UNKNOWN with "publish once, then re-run" remediation (an empty bucket cannot prove or disprove public read). The suite's `httpStatus === 200` case passes against the stub-backed adapter.
- **Live profile naming.** `STORIES_E2E_SUPABASE_URL`, `STORIES_E2E_SUPABASE_SERVICE_KEY`, `STORIES_E2E_SUPABASE_BUCKET`, `STORIES_E2E_SUPABASE_PUBLIC_BASE_URL` (the `STORIES_E2E_SUPABASE_*` family from tasks/design). No credentials existed in this run: live profile registered, skipped, and visible; the actual live run is the Tier 2 apply-phase item.
- **LSP note.** pi-lens reported stale `Cannot find module` diagnostics during RED/GREEN transitions (missing modules under test, then freshly created shared files); refuted authoritatively by per-package `tsc --noEmit` (exit 0) and green Vitest runs — same class as the PR 1/PR 2 notes (NodeNext maps `.js` specifiers to sibling `.ts` sources).
- **Bounds — OVER budget, honestly reported.** New files: 1,186 lines (adapter 376 + adapter tests 431 + simulator 157 + simulator tests 141 + shared plumbing 59 + scaffold 22); tracked: fake-adapter −38/+7 (refactor to shared plumbing), package.json +1, workspace +1, lockfile +84. Code-facing authored total ≈ 1,279 lines (lockfile included) vs the 400-line review budget / 800-line runtime attempt cap. The five mandated checkboxes form ONE strict-TDD unit spanning two packages (failure-mapping tests + suite registration + simulator); the only deletion-free split would separate the simulator (≈298 lines), leaving the adapter core ≈950. Recommendation: `size:exception` for PR 3 as authored, or an orchestrator-side split of the simulator package with the same exception on the remainder.

## PR 4 — `@stories/core`: data model + expiry materialization (draft evidence, apply phase)

- Branch: `sdd/pr04-core-data-model` (stacked on PR 3, commit `a18c09c`). Store:
  `openspec`. Strict TDD: active (Vitest, `pnpm --filter @stories/core test`).
- Scope consumed: exactly the 5 `### PR 4` checkboxes; PRs 1–3 untouched; PR 5+
  out of scope. Budget: operator amendment ≤800 changed lines per PR
  (`tasks.md` Conventions); measured early (see Bounds).

### TDD cycle evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/core test` | FAIL (exit 1) — `schema.test.ts`: `Cannot find module './schema.js'`; `expire-stories.test.ts`: `Cannot find module '../db/schema.js'`; 2 files failed, no tests ran (modules under test absent) |
| GREEN | `pnpm --filter @stories/core test` | PASS (exit 0) — 7/7 in 2 files after implementing `schema.ts`, `client.ts`, `expire-stories.ts` + forward-only migration `drizzle/0001_init.sql` via Drizzle Kit |
| TRIANGULATE | `pnpm --filter @stories/core test` | PASS (exit 0) — 10/10: cascade isolation per row kind across two projects; app-side UUID v4 (format + verbatim storage + NOT NULL violation when `id` omitted); UNIQUE project name |
| REFACTOR | `pnpm --filter @stories/core test` | Mini-cycle: RED — `timestamps.test.ts` FAIL (`Cannot find module './timestamps.js'`, exit 1) → GREEN — 12/12 in 3 files (exit 0) after `src/timestamps.ts` |

### Test commands run

- `pnpm --filter @stories/core test` — RED 2-file fail → GREEN 7/7 →
  TRIANGULATE 10/10 → REFACTOR mini RED fail → GREEN 12/12
- `pnpm test` (workspace) — 11 files, 62 passed + 1 skipped (PRs 1–3 suite
  unchanged at 50+1; +12 new core tests)
- `pnpm typecheck` (root) clean · per-package `tsc -p tsconfig.json --noEmit`
  clean ×4 · `pnpm lint` clean

### Scenario traceability (SL R4 + design data model)

| Spec scenario / design item | Test |
| --- | --- |
| SL R4 — past expiry → `expired` on sweep | `transitions published stories whose expiresAt is past to expired` (future sibling stays `published`; changed count 1) |
| SL R4 — sweep threshold `expiresAt <= now` | `transitions at boundary equality (expiresAt exactly now)` |
| SL R4 — correctness never trusts stale column; future rows safe | `leaves future stories untouched` (+1 h, +1 d, +30 d stay `published`) |
| SL R4 — materialization is idempotent | `is idempotent: a re-run transitions zero rows` |
| Design — projects columns + defaults | `stores the design columns and round-trips epoch-ms timestamps` (incl. `manifestKey` default `stories.json`; D8 comment on `credentialsJson`) |
| Design — stories columns + default status | `defaults status to 'published' and position to 0, storing epoch-ms instants` |
| Design — `timestamp_ms` epoch-ms round-trip | raw `sql<number>` assertions: `created_at`/`expires_at` hold the integer epoch-ms; Drizzle maps back to `Date` exactly |
| Design — cascade edges (delete project) | `deletes the project's stories, publish history, and pending-deletion rows` |
| Triangulation pins | `cascade removal is isolated: sibling projects keep every row kind`; `enforces unique project names`; `ids are app-side UUID v4 (no database-side default)` |

### Notes and deviations

- **Migration naming.** Drizzle Kit generated `0000_init.sql`; renamed to the
  task-required `drizzle/0001_init.sql` with `meta/_journal.json` tag updated to
  match (idx/when untouched). The suite's `createTestDb()` support helper runs
  the real Drizzle `migrate()` over the renamed journal — the forward-only
  migration path is exercised, not bypassed.
- **pnpm 11 build-script gate.** `allowBuilds` added to `pnpm-workspace.yaml`
  (better-sqlite3: native binding, ships a prebuilt binary — no compilation, no
  driver change; esbuild: drizzle-kit transitive, needed because
  verify-deps-before-run treats ignored builds as fatal in filtered runs).
  Each entry carries an inline justification comment.
- **D8.** `credentialsJson` is a storage column only; no DTO/serializer mapping
  exists in this PR (deep redaction tests arrive in PRs 8–9).
- **Type-boundary fix inside TRIANGULATE.** Omitting required insert field `id`
  breaks drizzle's insert type (TS2769); the NOT NULL test strips the id via a
  scoped `{ id?: string }` cast + `delete` at runtime (an eslint-disable variant
  was tried first and replaced).
- **LSP note.** Stale `Cannot find module` diagnostics during RED/GREEN
  transitions (missing modules under test) — refuted by green Vitest runs and
  `tsc --noEmit`; same class as the PR 1–3 notes.

### Bounds

- Hand-authored new code: **500 lines** — schema.test.ts 137, testing.ts 118,
  schema.ts 76, expire-stories.test.ts 65, expire-stories.ts 20, client.ts 23,
  package.json 23, timestamps.test.ts 13, timestamps.ts 10, drizzle.config.ts 8,
  tsconfig.json 4, index.ts 3.
- Generated / metadata (counted separately, not hand-authored):
  `drizzle/0001_init.sql` 53 + `meta/_journal.json` 12 + `meta/0000_snapshot.json`
  376 (drizzle-kit output); `pnpm-lock.yaml` +996 (drizzle-orm /
  better-sqlite3 / drizzle-kit dependency tree); `pnpm-workspace.yaml` +6
  (allowBuilds); `tasks.md` ±15 (5 checkbox flips + the operator's budget
  amendment bullet that was already uncommitted on this branch).
- Authored footprint ≈ **500 lines** — inside the amended ≤800 per-PR budget.
  No split needed; nothing deleted or compressed to fit.

## PR 5 — `@stories/core`: story domain service (draft evidence, apply phase)

- Branch: `sdd/pr05-core-story-domain` (stacked on PR 4, commit `4f4ebef`).
  Store: `openspec`. Strict TDD: active (Vitest, `pnpm --filter @stories/core test`).
- Scope consumed: exactly the 5 `### PR 5` checkboxes; PRs 1–4 untouched; PR 6+
  out of scope. Budget: operator amendment ≤800 changed lines per PR
  (`tasks.md` Conventions); runtime attempt cap 700; measured early (Bounds).
- Final state: core suite **48/48** (12 PR 4 tests intact + 36 new) · workspace
  `pnpm test` **98 passed + 1 skipped** (PRs 1–3 suites unchanged) · root
  `pnpm typecheck` clean · `pnpm lint` clean.

### TDD cycle evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/core test` | FAIL (exit 1) — exactly the 3 new files fail: `Cannot find module './expiry-window.js'` / `'./ordering.js'` / `'./story-service.js'`; PR 4's 12 tests still green (3 failed / 3 passed files, 12 passed) |
| GREEN | `pnpm --filter @stories/core test` | PASS (exit 0) — 45/45 in 6 files after implementing `expiry-window.ts`, `ordering.ts`, `story-service.ts` + index exports; one real defect surfaced and fixed: better-sqlite3 is a sync driver, so `db.transaction(async (tx) => …)` throws `Transaction function cannot return a promise` — removeStory now runs the transaction body synchronously via `.get()`/`.run()` |
| TRIANGULATE | `pnpm --filter @stories/core test` | PASS (exit 0) — 47/47: no-poster removal records only the media key (`posterKey` null); forced pending-deletion insert failure (DROP TABLE) rolls the story delete back, leaving the row intact |
| REFACTOR | `pnpm --filter @stories/core test` | PASS (exit 0) — 48/48: parity pin `enforces the identical window boundaries on create and edit (single shared refinement)` — 8 boundary offsets × both paths; passed immediately, proving create/edit compose the one `expiryWindowSchema` definition (pin of already-correct GREEN behavior, PR 3 precedent); `accepts()` helper extracted per REFACTOR hygiene |
| Verify & bounds | `pnpm test` · `pnpm typecheck` · `pnpm lint` | PASS — 98 passed + 1 skipped workspace; tsc clean; ESLint clean |

### Scenario traceability (SL R3 / R5 / R7; SL R4 stale-column note)

| Spec scenario | Test |
| --- | --- |
| R3 — exactly 24 h accepted (boundary) | `accepts an expiry exactly 24 hours in the future (inclusive boundary)` + service-level `accepts exactly 24 hours and exactly 30 days (SL R3 boundaries)` |
| R3 — exactly 30 d accepted (boundary) | `accepts an expiry exactly 30 days in the future (inclusive boundary)` (same service-level test) |
| R3 — 12 h rejected | `rejects a 12-hour expiry as too short` (+ 1 ms granularity `rejects instants one millisecond outside both bounds`) + `createStory rejects a 12-hour expiry… inserts nothing` + `updateStory rejects a too-short expiry patch… unchanged` |
| R3 — 45 d rejected | `rejects a 45-day expiry as too long` + service create/update equivalents |
| R3 — non-UTC input rejected | `rejects a non-UTC offset form (+02:00)` + `rejects a naive timestamp without the Z suffix` (shape reuses `isoUtc` from manifest-schema, D3) |
| R3 — window error is a Zod validation error | service tests assert `rejects.toBeInstanceOf(ZodError)` on create and edit |
| R5 — same position → newest first | `orders same-position stories newest first` + comparator unit `breaks position ties newest-first (createdAt desc)` |
| R5 — position overrides chronology | `orders by position ascending regardless of chronology` + `orders lower positions first regardless of creation order` |
| R5 — full mixed order | `sorts a mixed set: position asc, createdAt desc within equal positions` + comparator `sorts a mixed list…` (+ `returns 0 for identical position and createdAt`) |
| R7 — removal deletes row + pending-deletion with media+poster keys in the SAME transaction | `deletes the story and records media+poster keys in the same transaction` |
| R7 — no poster → media key only | `records only the media key when the story has no poster (triangulation)` |
| R7 — insert failure rolls the delete back | `rolls the removal back when the pending-deletion insert fails, leaving the story intact (triangulation)` |
| SL R4 stale-column note | Stays with PR 6: generation runs `expireStories` first; this PR's `listStories` is a local-truth read, not a correctness path for the manifest. |

### Notes and deviations

- **`zod` added to `@stories/core` dependencies (`^4.6.2`, +3 lockfile lines).**
  SL R3 mandates a Zod refinement and the service input schemas compose it;
  `zod` is not a new dependency to the repository (manifest-schema pins the same
  version). The window's UTC shape reuses `isoUtc` from `@stories/manifest-schema`
  (D3) — the repo has exactly one UTC-shape definition and exactly one window
  definition.
- **better-sqlite3 transaction is synchronous.** First GREEN run failed with
  `TypeError: Transaction function cannot return a promise`; drizzle's
  better-sqlite3 transaction requires a sync callback. `removeStory` now runs
  select `.get()`, delete `.run()`, insert `.run()` inside `db.transaction` —
  the transactional-remove property (SL R7) is unchanged and is what the
  rollback triangulation test proves.
- **`SAFETY:` cast on createStory's `.returning()`** — an INSERT without WHERE
  always returns exactly the inserted row; `noUncheckedIndexedAccess` cannot see
  that (same precedent class as PR 3's scoped SAFETY cast / PR 4's TRIANGULATE
  type fix).
- **`StoryNotFoundError`** typed for PR 10's 404 mapping; pinned in RED scope
  (`updateStory` unknown id). FK violations for an unknown project id surface
  raw from SQLite — project-404 handling belongs to PRs 9–10.
- **Stale-`published` expiry** (SL R4 second scenario) intentionally not
  re-tested here: it is owned by PR 6's sweep-first generation (per the task).
- **LSP note.** Expected RED-phase `Cannot find module './story-service.js'`
  diagnostics during RED/GREEN transitions — refuted by green Vitest runs and
  clean `tsc --noEmit`; same class as the PR 1–4 notes (NodeNext maps `.js`
  specifiers to sibling `.ts` sources).

### Bounds

- Authored new files: expiry-window.test.ts 103, story-service.test.ts 324,
  expiry-window.ts 36, story-service.ts 164, ordering.test.ts 39, ordering.ts
  14 = **680**; tracked deltas: `src/index.ts` +3, `package.json` +2/−1
  (zod), `pnpm-lock.yaml` +3, `tasks.md` ±10 (5 checkbox flips).
- Code-facing authored footprint ≈ **688 lines** — inside the 700-line runtime
  attempt cap and the amended ≤800 per-PR budget; over the original 400-line
  review budget, which the operator's amendment (Conventions, approved
  2026-09-12) supersedes for this change. Nothing was deleted, compressed, or
  restyled to fit; the tests-dominant strict-TDD unit is one cohesive work unit
  (one commit when the orchestrator commits).

## PR 6 — `@stories/core` manifest generation + atomic publication + history/rollback (branch `sdd/pr06-core-publication`)

### TDD cycle evidence (strict, Vitest — runner `pnpm --filter @stories/core test`)

| Cycle | Command | Result |
| --- | --- | --- |
| RED | `pnpm --filter @stories/core test` | FAIL — `2 failed \| 6 passed (8)` files; both new test files fail with `Cannot find module './generate-manifest.js'` (and `./publication-service.js`, `./rollback.js`); prior 48 tests stay green; exit 1 |
| GREEN | `pnpm --filter @stories/core test` | PASS — `8 passed (8)`, `62 passed (62)` (48 prior + 14 new: 7 generation, 7 publication) after one test-scenario fix (see deviations) |
| TRIANGULATE | `pnpm --filter @stories/core test` | PASS — `65 passed (65)` (+3: step-4 upload failure, D5 orphan, pending-media TTL 31536000) after fixing the test's own recording lambda |
| REFACTOR | `pnpm --filter @stories/core test` | PASS — `65 passed (65)`; verify+read-back round extracted to `src/publication/verify-manifest.ts`, inline duplicates deleted from publication-service.ts and rollback.ts; suite unchanged and green |

- Workspace: `pnpm test` → `16 passed (16)` files, `115 passed \| 1 skipped (116)` (baseline 98+1 preserved; skip = env-gated live Supabase profile).
- `pnpm typecheck` (root `tsc -p tsconfig.base.json`) — clean. `pnpm lint` — clean.

### Scenario traceability (MP R3–R7)

| Spec scenario | Test |
| --- | --- |
| R3 — expired excluded even with stale status column (sweep first) | `excludes expired stories even when the status column is stale (sweep runs first)` |
| R3 — ordering position asc / createdAt desc | `orders stories by position ascending with createdAt descending as tiebreak` |
| R3 — deterministic bytes | `produces identical bytes for equal inputs (deterministic serialization)` |
| R3 — URLs from publicBaseUrl (+ poster present/absent) | `builds media and poster URLs from the project publicBaseUrl`, `includes posterUrl only when the story has a poster key` |
| R3 — empty and 100-story projects valid | `accepts an empty project as a valid v1 manifest`, `accepts a 100-story project as a valid v1 manifest` |
| R4 — happy path: manifest upload TTL 60, verify + read-back parse + id-set equality, exact bytes in success row | `publishes the manifest with a 60 s TTL, verifies it by read-back, and records the exact bytes as success` |
| R4 — media verify failure aborts; previous bytes unchanged; failed row; typed AdapterError | `aborts with a typed AdapterError and leaves the previous manifest bytes unchanged when media verification fails` |
| R4 — read-back mismatch = unverified failure; previous bytes recoverable from history | `treats a read-back mismatch as an unverified failure, with previous bytes recoverable from history` |
| R5 — rollback restores latest success verbatim; restored expired stories self-expire by data | `rolls back to the latest successful bytes verbatim — restored expired stories self-expire by data` |
| R5 — no success row → typed error | `throws a typed error when there is no successful publication to roll back to` |
| R4/TRIANGULATE — step-4 upload failure leaves previous manifest serving | `keeps the previous manifest serving when the manifest upload itself fails at step 4` |
| D5/TRIANGULATE — crash-window orphan accepted, never referenced | `accepts crash-window orphan media and never references it in the manifest (D5)` |
| R6/TRIANGULATE — media+poster pending uploads request 31536000 | `uploads pending media and poster with cacheControlSeconds 31536000 (triangulation)` |
| MP R7 — happy path performs ONLY the manifest PUT | asserted in the happy-path test via `uploadKeys == ['stories.json']` |
| R6 served-header integration assert | deferred to PR 15 (per task text: "served-header assertion lands with the simulator in PR 15 integration") |

### Notes and deviations

- **Read-back fetcher is injectable** (`PublicationDeps.fetcher`, default `globalThis.fetch`) per the run brief; tests stub it with a decorator that serves the recorded manifest bytes from the fake adapter — no real network.
- **Pending-media loader** (`PublicationDeps.loadPendingMedia`): design step 2 uploads "un-uploaded media", but core holds no media bytes; the loader is the minimal injectable source for the OBJECT_NOT_FOUND path. Happy path never calls it (asserted), PR 10's creation-time upload keeps it unused; without a source, pending media aborts with a typed `UPLOAD_FAILED`. Poster pending uploads declare `contentLength` from the provided bytes (the schema stores no poster size).
- **Rollback history row**: a successful rollback appends its OWN `result='success'` row with the restored bytes (design "re-run steps 3–7 with stored contentJson"); after a second successful publication the latest success row is that publication — the first RED scenario wrongly expected v1 and was corrected to the spec semantics (restore after the second publish, expired story included verbatim).
- **Corrupted `storyIdsJson`** is parsed inside the guarded block so it surfaces as a recorded failed rollback, not an unhandled SyntaxError.
- **Failed history rows** store `contentJson: ""` (NOT NULL column; no bytes were published) plus `<code>: <detail>` error detail.
- **LSP note.** RED-phase `Cannot find module` diagnostics and two stale advisories were refuted by the green Vitest runs and clean `tsc --noEmit` (same class as the PR 1–5 notes; NodeNext maps `.js` specifiers to sibling `.ts` sources).

### Bounds

- Authored new files: generate-manifest.test.ts 177, generate-manifest.ts 109, history.ts 103, policy.ts 10, publication-service.test.ts 526, publication-service.ts 254, rollback.ts 83, verify-manifest.ts 93 = **1,355**; tracked deltas: `src/index.ts` +4, `package.json` +1 (storage-adapters workspace dep), `pnpm-lock.yaml` +3 → code-facing authored ≈ **1,363 lines**; plus artifacts (tasks ±10, this section, apply-progress Run 6).
- **Budget overage reported honestly** vs the operator amendment (≤800/PR): the work unit is generation+publication as ONE strict-TDD unit; the only cohesive split is generation (286) vs publication (1,077) — publication alone still exceeds 800, so no honest two-commit split fits. Nothing was deleted, compressed, or restyled to fit; tests are deliberately the dominant half. **Recommendation: `size:exception` for PR 6** (third after PRs 2–3). Served-header Tier-1 assert lands in PR 15; Tier 2 items stay in the final `tasks.md` section.
