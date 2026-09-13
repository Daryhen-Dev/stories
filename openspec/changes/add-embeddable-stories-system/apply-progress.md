# Apply Progress — `add-embeddable-stories-system`

Cumulative log of apply runs. New runs are appended; prior entries are never
rewritten or lost.

## Run 1 — PR 1 `@stories/manifest-schema` (branch `sdd/pr01-manifest-schema`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative native status — change
  `add-embeddable-stories-system`, apply UNBLOCKED, scope = exactly the 5
  `### PR 1` checkboxes, runtime attempt cap 500 lines (400-line human review
  budget), no touching PR 2+. Bootstrap prerequisite `sdd-monorepo-bootstrap`
  confirmed landed (commit `8664958`).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `src/manifest-schema.test.ts` written; run failed with
      `Cannot find module './manifest-schema.js'` (evidence in `verify.md`)
- [x] GREEN — `src/manifest-schema.ts` + `src/index.ts` implemented per design;
      package.json/tsconfig added; 8/8 passing
- [x] TRIANGULATE — nested unknown field rejected; `position: 0` accepted;
      sample manifest scanned for secrets/provider IDs; 11/11 passing
- [x] REFACTOR — fixtures collapsed into single `validManifest()` factory;
      zod-only-dependency test added; 12/12 passing
- [x] Verify & bounds — workspace 13/13, typecheck + lint clean; diff within
      budget; evidence in `verify.md`

### Files changed

- `packages/manifest-schema/package.json` (new) — name, `test` script, dep `zod`
- `packages/manifest-schema/tsconfig.json` (new) — extends `tsconfig.base.json`
- `packages/manifest-schema/src/manifest-schema.ts` (new) — design-verbatim schema
- `packages/manifest-schema/src/index.ts` (new) — type exports
- `packages/manifest-schema/src/manifest-schema.test.ts` (new) — 12 tests
- `pnpm-lock.yaml` — zod 4.6.2 importer entry (+11 lines)
- `openspec/changes/add-embeddable-stories-system/tasks.md` — only the 5 PR 1
  checkboxes flipped to `[x]`; PR 2+ sections untouched
- `openspec/changes/add-embeddable-stories-system/verify.md` (new) — PR 1 draft
  evidence section

### Test commands run

- `pnpm --filter @stories/manifest-schema test` — RED fail → GREEN 8/8 →
  TRIANGULATE 11/11 → REFACTOR 12/12
- `pnpm test` — 13/13 (12 package + 1 bootstrap smoke)
- `pnpm typecheck` (root, covers `packages/**`) — clean; package-level
  `tsc -p tsconfig.json --noEmit` — clean
- `pnpm lint` — clean

### Deviations from design/tasks (all recorded in `verify.md`)

1. R2 additive test proven against the evolved v1 schema (`.extend` + optional)
   because strict objects make the literal old-consumer reading unimplementable.
2. `zod` 4.6.2 (latest) with the design-verbatim deprecated-alias API; TS6385
   hints accepted in favor of design fidelity.
3. Dependency test uses a JSON import attribute instead of `node:fs` (package
   project cannot resolve root `@types/node`; no extra deps allowed).
4. Package scaffolding (package.json/tsconfig) landed during RED so the filtered
   runner command resolves and fails on the missing module, as the task specifies.

### Remaining work

- PR 2 … PR 18 (all unchecked; intentionally untouched this run).
- Tier 2 apply-phase items (final unchecked section of `tasks.md`).

### Workload / PR boundary

- Authored this slice: 209 code+test lines + 11 lockfile lines; with SDD
  artifacts (tasks flips, this file, verify.md) the PR diff stays ≤ ~345 lines —
  inside the 400-line review budget and the 500-line runtime attempt cap.
- Delivery: `auto-chain` + `stacked-to-main` (operator-resolved in tasks.md);
  PR 1 targets `main`; no commits made (orchestrator owns them).

## Run 2 — PR 2 `@stories/storage-adapters` (branch `sdd/pr02-storage-adapters`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative native status — change
  `add-embeddable-stories-system`, branch `sdd/pr02-storage-adapters`, apply
  UNBLOCKED with edit authority for the workspace root (per-change, audited),
  scope = exactly the 5 `### PR 2` checkboxes, runtime attempt cap 500 lines.
  PR 1 confirmed intact (`pnpm --filter @stories/manifest-schema test` and full
  workspace suite green before starting).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — 4 package test files + boundary test written; package run fails on
      missing modules; boundary fails on the absent ESLint rule (evidence in
      `verify.md`)
- [x] GREEN — `types.ts` (five operations + probe), `errors.ts` (AdapterError +
      10-code taxonomy), `fake-adapter.ts` (public/non-public/auth-failure
      simulation, cache-control metadata), `contract-suite.ts`
      (`runStorageAdapterContractSuite`, 8 cases), `index.ts`, ESLint
      `no-restricted-imports` delta; 18/18 + boundary 3/3
- [x] TRIANGULATE — mismatch details name the property; `publicUrl`
      deterministic; TTL 60 vs 31536000 asserted separately; cross-instance
      case; 19/19
- [x] REFACTOR — `src/testing.ts` helpers (bytes + UploadInput builders);
      suite kept provider-agnostic (source scan test); 20/20
- [x] Verify & bounds — 36/36 workspace, per-package + root typecheck clean,
      lint clean; MSA R1–R4, R6–R7 traced; **budget overage reported honestly
      (≈1,031 code-facing lines vs 500 cap) with `size:exception`
      recommendation**

### Files changed

- `packages/storage-adapters/` (new): `package.json` (zero runtime deps;
  `@types/node` devDep), `tsconfig.json` (`types: ["node"]`), `src/types.ts`,
  `src/errors.ts`, `src/fake-adapter.ts`, `src/contract-suite.ts`,
  `src/testing.ts`, `src/index.ts`, 4 `*.test.ts` files
- `tests/boundary/provider-encapsulation.test.ts` (new) — scanner + real-tree
  scan + ESLint-rule assertion
- `eslint.config.js` — `no-restricted-imports` delta for `@supabase/*` outside
  `packages/storage-adapters`
- `pnpm-lock.yaml` (+6) · `tasks.md` (only the 5 PR 2 checkboxes flipped)
- `verify.md` / `apply-progress.md` (this file) — evidence appended

### Test commands run

- `pnpm --filter @stories/storage-adapters test` — RED fail → GREEN 18/18 →
  TRIANGULATE 19/19 → REFACTOR 20/20
- `pnpm vitest run tests/boundary` — RED 1 failed/2 passed → GREEN 3/3
- `pnpm test` (workspace) 36/36 · `pnpm typecheck` (root) clean · per-package
  `tsc -p tsconfig.json --noEmit` clean · `pnpm lint` clean

### Deviations from design/tasks (recorded in `verify.md`)

1. `override readonly cause` (noImplicitOverride vs `Error.cause`).
2. `@types/node` devDependency + `types: ["node"]` — `ReadableStream` in the
   contract is design-mandated; runtime deps stay zero.
3. Suite takes optional `ContractSuiteVariants` after the design-verbatim
   `makeAdapter` (non-public + bad-credentials fixtures).
4. Fake extras documented as test-double surface (`stored` introspection,
   UPLOAD_FAILED length guard, OBJECT_NOT_FOUND on missing delete).
5. Boundary scanner matches import-like statements only (avoids self-flagging
   the ESLint rule); fixture line assembled dynamically.

### Remaining work

- PR 3 … PR 18 (all unchecked; untouched this run). PR 3 owns the Supabase
  reference adapter + provider simulator (live profile must probe an existing
  object for the suite's `httpStatus === 200` case).
- Tier 2 apply-phase items (final unchecked section of `tasks.md`).

### Workload / PR boundary

- Authored this slice: 1,005 new-file lines (983 src+tests) + 20 eslint + 6
  lockfile + 8 tasks flips + artifact appends ≈ **1,031 code-facing lines** —
  over the 500-line runtime attempt cap and the 400-line review budget.
- Why it cannot shrink: the 5 checkboxes mandate 4 test files + 4 source
  modules + boundary + lint rule as ONE strict-TDD unit; the forecast
  (320–380) underestimated the suite/test surface. One honest split exists
  (boundary + ESLint delta ≈ 124 lines) but the core stays ≈ 880.
- **Recommendation: `size:exception` for PR 2** (or orchestrator-side split of
  the boundary unit + exception on the remainder). No commits made (orchestrator
  owns them). No subagents launched.

## Run 3 — PR 3 Supabase reference adapter + provider simulator (branch `sdd/pr03-supabase-adapter`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative native status — change
  `add-embeddable-stories-system`, branch `sdd/pr03-supabase-adapter` stacked on
  PR 2, apply UNBLOCKED with edit authority for the workspace root (per-change,
  audited), scope = exactly the 5 `### PR 3` checkboxes, runtime attempt cap 800
  lines (lockfile margin). PR 1 + PR 2 confirmed intact before starting
  (`pnpm --filter @stories/manifest-schema test`, existing 20/20 green during RED).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `src/supabase-adapter.test.ts` (8 failure mappings with remediation,
      stubbed structural SDK client, no `@supabase` import in tests) +
      `tools/provider-simulator/index.test.ts` (bytes, mirrored D9 Cache-Control,
      Range 206); both runners failed on missing modules (evidence in `verify.md`)
- [x] GREEN — `src/supabase-adapter.ts` (structural SDK seam + one SAFETY-cast
      default constructor; upload persists `cacheControlSeconds` as SDK
      cacheControl metadata with D9 header forms; download-based verify;
      publicUrl from publicBaseUrl; delete; list-probe checkPublicRead) +
      `src/verify-expectations.ts` + `tools/provider-simulator/index.ts`
      (static store, metadata, Range/206/416) + env-gated live profile
      (`describe.skipIf`, `STORIES_E2E_SUPABASE_*`); 31 + 1 skipped / 3/3
- [x] TRIANGULATE — simulator: 404, content-type passthrough, HEAD-vs-GET
      consistency, suffix range + 416 (7/7); adapter: UNKNOWN fallback on
      unmapped probe status and unmapped list error, 404-on-existing →
      BUCKET_NOT_PUBLIC (34 + 1 skipped)
- [x] REFACTOR — `src/body-bytes.ts` (`asBytes`) shared by fake + Supabase
      adapter; `compareExpectations` shared verify plumbing; no SDK types in
      shared modules; suite re-run against both (34 + 1 skipped / 7/7; fake
      tests still 20/20)
- [x] Verify & bounds — workspace `pnpm test` 50 passed + 1 skipped (live
      profile visible as skipped without env); boundary scan green (MSA R5);
      root + per-package typecheck clean; lint clean; **budget overage reported
      honestly (≈1,279 code-facing lines vs 800 cap / 400 budget) with
      `size:exception` recommendation**; Tier 2 live run deferred (no
      credentials in this environment — none invented)

### Files changed

- `packages/storage-adapters/src/supabase-adapter.ts` (new, 376) — the ONLY file
  importing `@supabase/*`; `src/supabase-adapter.test.ts` (new, 431);
  `src/verify-expectations.ts` (new, 33); `src/body-bytes.ts` (new, 26)
- `packages/storage-adapters/src/fake-adapter.ts` (−38/+7 — rewired to shared
  plumbing, behavior unchanged, PR 2 tests untouched and green)
- `packages/storage-adapters/package.json` (+1 — `@supabase/supabase-js`
  devDependency; `dependencies` stay zero per the pinned contract invariant)
- `tools/provider-simulator/` (new package): `index.ts` (157), `index.test.ts`
  (141), `package.json` (15), `tsconfig.json` (7)
- `pnpm-workspace.yaml` (+1 — `tools/*` glob was missing) · `pnpm-lock.yaml`
  (+84 — supabase-js tree + simulator importer)
- `openspec/.../tasks.md` (only the 5 PR 3 checkboxes flipped),
  `verify.md` / `apply-progress.md` (this file)

### Test commands run

- `pnpm --filter @stories/storage-adapters test` — RED fail → GREEN 31+1skip →
  TRIANGULATE 34+1skip → REFACTOR 34+1skip
- `pnpm --filter @stories/provider-simulator test` — RED fail → GREEN 3/3 →
  TRIANGULATE 7/7
- `pnpm test` (workspace) 50 passed + 1 skipped · `pnpm typecheck` (root) clean ·
  per-package `tsc -p tsconfig.json --noEmit` clean ×2 · `pnpm lint` clean
  (ESLint `no-restricted-imports` + boundary scanner green)

### Deviations from design/tasks (recorded in `verify.md`)

1. `@supabase/supabase-js` as devDependency — PR 2's pinned zero-runtime-deps
   contract invariant kept; SDK confined to the reference adapter file (off the
   pinned index surface).
2. Structural SDK seam + single SAFETY-cast default constructor (tests stub
   without importing the SDK; boundary scanner green).
3. verify via `download` (stable surface) instead of version-fragile metadata
   endpoints; `upsert: true` on upload for republication.
4. D9 header helper duplicated in simulator (3 lines) — export from index would
   break PR 2's pinned export surface; both copies test-pinned to D9 strings.
5. checkPublicRead probes an existing object via list+GET (Spike A/B); empty
   bucket → UNKNOWN + remediation.
6. RED-phase scaffolding (workspace glob, simulator package files, SDK install)
   landed before the RED run so the filtered runner commands resolve and fail
   on the missing modules, per task + PR 1 precedent.

### Remaining work

- PR 4 … PR 18 (all unchecked; untouched this run). Tier 2: run the live
  Supabase profile with operator credentials during apply (`verify.md` notes
  the exact env names and the empty-bucket probe caveat).
- Tier 2 apply-phase items (final unchecked section of `tasks.md`).

### Workload / PR boundary

- Authored this slice: 1,186 new-file lines + 93 tracked insertions (−38/+7
  refactor delta, +1 package.json, +1 workspace, +84 lockfile) ≈ **1,279
  code-facing lines** — over the 800-line runtime attempt cap and the 400-line
  review budget.
- Why it cannot shrink: the 5 checkboxes mandate, as ONE strict-TDD unit across
  two packages, the failure-mapping test file + adapter + suite registration +
  simulator + its tests; no deletion-free honest split lands under budget (the
  only viable split — the simulator package, ≈298 lines — still leaves ≈950).
- **Recommendation: `size:exception` for PR 3** (or orchestrator-side split of
  `tools/provider-simulator` into its own chained PR with the same exception on
  the adapter remainder). No commits made (orchestrator owns them). No
  subagents launched.

## Run 4 — PR 4 `@stories/core` data model + expiry materialization (branch `sdd/pr04-core-data-model`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative — change `add-embeddable-stories-system`,
  branch `sdd/pr04-core-data-model` (stacked on PR 3), scope = exactly the 5
  `### PR 4` checkboxes, PRs 1–3 intocables, PR 5+ out of scope. Budget:
  operator amendment ≤800 changed lines per PR (Conventions, `tasks.md`).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `src/db/schema.test.ts` + `src/domain/expire-stories.test.ts`
      written; run failed on missing modules under test (`./schema.js`,
      `../db/schema.js`), 2 files failed / no tests, exit 1
- [x] GREEN — `src/db/schema.ts` (projects/stories/publishHistory/
      storyMediaPendingDeletion per design), `src/db/client.ts` (Drizzle init
      helper, foreign_keys ON), forward-only `drizzle/0001_init.sql` (Drizzle
      Kit generate + rename 0000→0001 with journal tag fix), `src/domain/
      expire-stories.ts`; 7/7
- [x] TRIANGULATE — cascade isolation across sibling projects (history +
      pending-deletion per row kind), UUID v4 app-side (format + verbatim +
      NOT NULL without default), UNIQUE project name; 10/10
- [x] REFACTOR — `src/timestamps.ts` (`toIsoUtcZ`, ISO-8601 `Z` boundary
      serialization) via mini RED→GREEN cycle (epoch-ms storage stays
      centralized in `schema.ts` `mode: 'timestamp_ms'`); 12/12
- [x] Verify & bounds — workspace 62 passed + 1 skipped; typecheck/tsc/lint
      clean; authored ≈500 lines vs amended ≤800 budget

### Files changed

- New: `packages/core/` — `package.json`, `tsconfig.json`, `drizzle.config.ts`,
  `src/index.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/testing.ts`
  (test fixtures/support), `src/db/schema.test.ts`,
  `src/domain/expire-stories.ts`, `src/domain/expire-stories.test.ts`,
  `src/timestamps.ts`, `src/timestamps.test.ts`, `drizzle/0001_init.sql`,
  `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`
- Tracked: `pnpm-workspace.yaml` +6 (allowBuilds: better-sqlite3, esbuild),
  `pnpm-lock.yaml` +996 (dependency tree), `tasks.md` ±15 (5 checkbox flips +
  pre-existing operator amendment bullet)

### Test commands run

- `pnpm --filter @stories/core test` — RED fail → GREEN 7/7 → TRIANGULATE
  10/10 → REFACTOR mini RED fail → GREEN 12/12
- `pnpm test` (workspace) 62 passed + 1 skipped · `pnpm typecheck` clean ·
  per-package `tsc --noEmit` clean ×4 · `pnpm lint` clean

### Deviations from design/tasks (recorded in `verify.md`)

1. Migration file renamed `0000_init.sql` → `0001_init.sql` (task-required
   name) with journal tag updated; `migrate()` exercised in tests.
2. pnpm 11 `allowBuilds` entries (better-sqlite3 prebuilt binary — no driver
   change; esbuild via drizzle-kit) because ignored builds are fatal in
   filtered runs.
3. `credentialsJson` unmapped (D8 minimal-scope per prompt); deep redaction
   tests in PRs 8–9.
4. TRIANGULATE type fix: id-stripping NOT NULL test uses a scoped cast instead
   of an eslint-disable (drizzle types `id` as required on insert).

### Remaining work

- PR 5 … PR 18 (all unchecked; untouched this run). Tier 2 apply-phase items
  at the end of `tasks.md`.

### Workload / PR boundary

- Authored this slice: **500 hand-written lines** (one cohesive strict-TDD
  unit: schema + migrations + expiry sweep, tests-dominant) — inside the
  amended ≤800 per-PR budget; +1,437 generated/metadata lines (lockfile 996,
  drizzle-kit snapshot 376, init SQL 53, journal 12) counted separately.
  One work unit → one commit when the orchestrator commits; no commits made
  (orchestrator owns them). No subagents launched.

## Run 5 — PR 5 `@stories/core` story domain service (branch `sdd/pr05-core-story-domain`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative — change `add-embeddable-stories-system`,
  branch `sdd/pr05-core-story-domain` (stacked on PR 4, commit `4f4ebef`), edit
  authority for the workspace root (per-change, audited), scope = exactly the 5
  `### PR 5` checkboxes, runtime attempt cap 700 lines, budget = operator
  amendment ≤800 (Conventions, `tasks.md`). PRs 1–4 untouched and green before
  starting (baseline `pnpm --filter @stories/core test` 12/12).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `expiry-window.test.ts` (14), `ordering.test.ts` (4),
      `story-service.test.ts` (16) written; run failed on the 3 missing modules
      under test while PR 4's 12 tests stayed green; exit 1
- [x] GREEN — `expiry-window.ts` (`expiryWindowSchema` composing `isoUtc` +
      inclusive 24 h–30 d refinement; `isWithinExpiryWindow` pure predicate),
      `ordering.ts` (`compareStories`: position asc / createdAt desc),
      `story-service.ts` (`createStoryService` factory: create/update/
      listStories/removeStory; transactional remove); sync-driver transaction
      fix surfaced by the SL R7 test; 45/45
- [x] TRIANGULATE — no-poster removal records only the media key; DROP TABLE
      forces the pending-deletion insert to fail → transaction rolls the story
      delete back, row intact; 47/47
- [x] REFACTOR — parity pin: 8 boundary offsets produce identical create/edit
      outcomes (single shared `expiryWindowSchema` definition); `accepts()`
      helper extracted; 48/48
- [x] Verify & bounds — workspace 98 passed + 1 skipped (PRs 1–4 suites
      unchanged); typecheck + lint clean; authored ≈688 code-facing lines vs
      700 cap / amended ≤800 budget

### Files changed

- New: `packages/core/src/domain/expiry-window.ts` (36), `expiry-window.test.ts`
  (103), `ordering.ts` (14), `ordering.test.ts` (39), `story-service.ts` (164),
  `story-service.test.ts` (324)
- Tracked: `packages/core/src/index.ts` +3 (domain exports),
  `packages/core/package.json` +2/−1 (`zod ^4.6.2` — already pinned by
  manifest-schema; not new to the repo), `pnpm-lock.yaml` +3 (importer entry),
  `tasks.md` ±10 (only the 5 PR 5 checkboxes flipped),
  `verify.md` / `apply-progress.md` (this file)

### Test commands run

- `pnpm --filter @stories/core test` — RED fail (exit 1) → GREEN 45/45 →
  TRIANGULATE 47/47 → REFACTOR 48/48
- `pnpm test` (workspace) — 98 passed + 1 skipped · `pnpm typecheck` clean ·
  `pnpm lint` clean

### Deviations from design/tasks (recorded in `verify.md`)

1. `zod` declared in core's dependencies (SL R3 mandates a Zod refinement;
   service schemas compose it; same version pinned by manifest-schema; UTC
   shape reused via `isoUtc`, D3).
2. better-sqlite3 transactions are sync — `removeStory` uses `.get()`/`.run()`
   inside `db.transaction` after the first GREEN run failed with
   `Transaction function cannot return a promise`.
3. `SAFETY:` cast on createStory's `.returning()` (noUncheckedIndexedAccess vs
   insert-without-WHERE always returning the row).
4. `StoryNotFoundError` typed early for PR 10's 404 mapping (pinned in tests);
   unknown-project FK errors left raw pending PRs 9–10.
5. Stale-`published` expiry (SL R4 second scenario) deliberately left to PR 6's
   sweep-first generation, per the task text.

### Remaining work

- PR 6 … PR 18 (all unchecked; untouched this run). Tier 2 apply-phase items at
  the end of `tasks.md`.

### Workload / PR boundary

- Authored this slice: **≈688 code-facing lines** (680 new-file lines + 3 index
  - 5 package/lockfile) — inside the 700-line runtime attempt cap and the
  amended ≤800 per-PR budget; one cohesive strict-TDD work unit (one commit
  when the orchestrator commits). No commits made (orchestrator owns them). No
  subagents launched.

## Run 6 — PR 6 `@stories/core` manifest generation + atomic publication + history/rollback (branch `sdd/pr06-core-publication`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest)
- Status consumed: parent-authoritative — change `add-embeddable-stories-system`,
  branch `sdd/pr06-core-publication` (stacked on PR 5, commit `3aa1de3`), edit
  authority for the workspace root, scope = exactly the 5 `### PR 6`
  checkboxes, runtime attempt `max_changed_lines 900`, budget = operator
  amendment ≤800 with measure-early rule. PRs 1–5 untouched and green before
  starting (baseline `pnpm --filter @stories/core test` 48/48; workspace 98+1).
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `generate-manifest.test.ts` (7: sweep-first stale column, ordering
      tiebreak, deterministic bytes, publicBaseUrl URLs, poster present/absent,
      empty + 100-story valid) + `publication-service.test.ts` (7: happy path
      TTL 60 + read-back + exact bytes, media verify-failure abort, read-back
      mismatch recoverable, prune 50, verbatim rollback w/ self-expiring data,
      no-success typed error, ProjectNotFoundError); run failed on missing
      modules with the 48 prior tests green; exit 1
- [x] GREEN — `generate-manifest.ts` (expireStories → filter published →
      compareStories → schema-order JSON, no pretty-print, `toIsoUtcZ`),
      `history.ts` (recordSuccess/recordFailure/latestSuccessRow/prune-to-50),
      `policy.ts` (TTL 60 / 31536000, JSON content type, history limit),
      `publication-service.ts` (factory `(db, makeAdapter)`, design steps 1–6,
      single manifest PUT as only production write — MP R7; injectable
      read-back fetcher defaulting to `globalThis.fetch`; pending-media
      upload+verify path), `rollback.ts` (verbatim bytes re-upload + verify);
      62/62
- [x] TRIANGULATE — step-4 upload failure keeps previous bytes serving; D5
      crash-window orphan accepted and never referenced; pending
      media+poster uploads assert `cacheControlSeconds: 31536000`; 65/65
- [x] REFACTOR — verify+read-back round extracted to `verify-manifest.ts`
      (options-object signature, explicit id-sort comparator), inline
      duplicates deleted from publish and rollback; 65/65 green
- [x] Verify & bounds — workspace 115 passed + 1 skipped; typecheck + lint
      clean; MP R3–R6 traced (served-header assert deferred to PR 15 per task);
      measured diff reported honestly vs amended ≤800 budget

### Files changed

- New: `packages/core/src/publication/` — `policy.ts` (10), `history.ts` (103),
  `generate-manifest.ts` (109), `publication-service.ts` (254), `rollback.ts`
  (83), `verify-manifest.ts` (93), `generate-manifest.test.ts` (177),
  `publication-service.test.ts` (526)
- Tracked: `packages/core/src/index.ts` +4 (publication exports),
  `packages/core/package.json` +1 (`@stories/storage-adapters` workspace dep),
  `pnpm-lock.yaml` +3, `tasks.md` ±10 (only the 5 PR 6 checkboxes flipped),
  `verify.md` / `apply-progress.md` (this file)

### Test commands run

- `pnpm --filter @stories/core test` — RED fail (exit 1) → GREEN 62/62 →
  TRIANGULATE 65/65 → REFACTOR 65/65
- `pnpm test` (workspace) — 115 passed + 1 skipped · `pnpm typecheck` clean ·
  `pnpm lint` clean

### Deviations from design/tasks (recorded in `verify.md`)

1. Injected `loadPendingMedia` dependency as the step-2 pending-media source
   (core holds no media bytes; happy path never calls it — asserted).
2. Rollback appends its own success row with the restored bytes; RED scenario
   corrected to spec semantics (latest success = the newest successful
   publication, not "first").
3. Failed history rows carry `contentJson: ""` (NOT NULL column) + typed
   `<code>: <detail>`; corrupted `storyIdsJson` surfaces as a recorded failed
   rollback (parse inside the guarded block).
4. Read-back fetcher injectable per run brief; tests serve recorded fake-adapter
   bytes with no network.

### Remaining work

- PR 7 … PR 18 (all unchecked; untouched this run). Tier 2 apply-phase items at
  the end of `tasks.md`.

### Workload / PR boundary

- Authored this slice: **≈1,363 code-facing lines** (1,355 new-file + 8
  tracked) + artifact appends — **over the amended ≤800 per-PR budget**.
- Why it cannot shrink: the 5 checkboxes mandate generation + publication +
  history/rollback as ONE strict-TDD unit; the only cohesive commit split is
  generation (286) vs publication (1,077), and publication alone still exceeds
  800 — no honest split fits without deleting tests (forbidden).
- **Recommendation: `size:exception` for PR 6** (third after PRs 2–3), or an
  orchestrator-side re-plan that splits the publication unit across a chained
  pair with the exception recorded. No commits made (orchestrator owns them).
  No subagents launched.
