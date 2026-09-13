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

## Run 7 — PR 7 `@stories/core` cleanup service (branch `sdd/pr07-core-cleanup`)

- Date: 2026-09-12 · Store: `openspec` · Strict TDD: active (Vitest).
- Status consumed: parent-authoritative — change `add-embeddable-stories-system`,
  `applyState: ready`, repo-local workspace `/home/daryhen/Documents/proyects/stories`,
  assigned work unit `pr07-core-cleanup` stacked on PR 6 commit `b69f252`, and only
  the five PR 7 implementation-owned checkboxes. Delivery is `auto-chain` /
  `stacked-to-main`; parent has runtime-attempt authority (max 3; max 800 changed
  lines). No attempt-ledger, branch, commit, or PR action was taken.
- Action-context warning: none. All edits remain inside the parent-authorized roots
  and user-specified PR 7 edit surfaces.
- Skill resolution: `paths-injected` (`gentle-ai`, `work-unit-commits`).

### Completed tasks (checkboxes persisted in `tasks.md`)

- [x] RED — `cleanup-service.test.ts` referenced the absent module; the required
      core command failed only on `Cannot find module './cleanup-service.js'` while
      the pre-existing 65 tests stayed green.
- [x] GREEN — `cleanup-service.ts` implemented `createCleanupService(db,
      makeAdapter)`, explicit `adapter.delete` calls, `CleanupReport`, expiry-first
      selection, per-story updates, and pending-deletion cleanup; 70/70 core tests.
- [x] TRIANGULATE — no-poster, pending-failure/non-blocking, exact
      `3 attempted / 2 deleted / 1 failed`, poster-failure, and always-failing
      adapter coverage; 71/71 core tests.
- [x] REFACTOR — cleanup reuses `expireStories(db, now)`, the same helper used by
      publication, and is exported from the core package; export RED then 72/72
      GREEN confirmed behavior.
- [x] Verify & bounds — full verification passed; all five PR 7 persisted task rows
      are visibly `[x]`; details are in `verify.md`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR 7 cleanup service | `packages/core/src/cleanup/cleanup-service.test.ts` | Unit with in-memory SQLite and a contract-shaped adapter | 65/65 core | Missing module; 65 prior pass | 70/70 | 71/71 mixed/no-poster/pending failure | Export RED then 72/72; shared `expireStories` retained |

### Files changed

- `packages/core/src/cleanup/cleanup-service.ts` (new) — best-effort project
  cleanup factory and report types.
- `packages/core/src/cleanup/cleanup-service.test.ts` (new) — seven behavior tests
  covering EMC R2–R5 and the EMC R4 service half.
- `packages/core/src/index.ts` — public cleanup-service export.
- `openspec/changes/add-embeddable-stories-system/tasks.md` — only PR 7’s five
  implementation checkboxes set `[x]`.
- `openspec/changes/add-embeddable-stories-system/verify.md` — PR 7 strict-TDD and
  verification evidence appended.
- `openspec/changes/add-embeddable-stories-system/apply-progress.md` — this
  cumulative run entry.

### Test commands run

- `pnpm --filter @stories/core test` — safety net PASS 65/65; RED FAIL (missing
  cleanup module, prior 65 pass); GREEN PASS 70/70; TRIANGULATE PASS 71/71;
  REFACTOR export RED FAIL; REFACTOR GREEN PASS 72/72.
- `pnpm test` — PASS: 17 files, 122 passed, 1 skipped (existing env-gated live
  Supabase profile).
- `pnpm typecheck` — PASS: root `tsc -p tsconfig.base.json` clean.
- `pnpm lint` — PASS: `eslint .` clean.
- `git diff --check` — PASS: no whitespace errors.

### Deviations from design

- None. The service uses existing `expireStories` as the shared expire-first
  preamble with publication, so no scope-expanded shared abstraction was needed.

### Remaining tasks

- None in the assigned PR 7 scope; all five PR 7 implementation-owned rows are
  complete and persisted as `[x]`.
- PR 8–18 implementation rows and the five final Tier 2 rows remain unchecked and
  are out of this PR 7 boundary.

### Workload / PR boundary

- The initial 477-line checkpoint was a provisional estimate. Final measurement
  supersedes it: **634 code-facing lines** (174 `cleanup-service.ts`, 459 test
  lines, 1 index export), excluding OpenSpec evidence.
- The strict-TDD test surface and implementation are one cohesive cleanup-service
  work unit. No code, tests, comments, or docs were deleted or compressed. Parent
  handles any size-exception settlement; this executor made no delivery action.

### PR 7 correction — idempotent partial-deletion retries

- Status consumed: parent-authoritative `add-embeddable-stories-system` status,
  `applyState: ready`, `repo-local` action context, workspace root authorized;
  scope restricted to the active PR 7 work unit. Action-context warnings: none.
  No branch, commit, push, review, dependency, PR 8+, or attempt-ledger action
  was taken.
- Strict-TDD safety net: `pnpm --filter @stories/core test` passed (exit 0), 9
  files / 72 tests before edits.
- RED: two stateful fake-adapter tests were added for an expired story and a
  pending-deletion row. `pnpm --filter @stories/core test` failed (exit 1): 1
  file failed / 8 passed; 2 new assertions failed while 72 existing tests passed.
  On the second cleanup run, the fake threw `AdapterError(OBJECT_NOT_FOUND)` for
  already-deleted media, so the poster was not retried.
- GREEN: cleanup now routes each explicit delete through `deleteObject`, which
  suppresses only `AdapterError` code `OBJECT_NOT_FOUND`; it rethrows all other
  typed and unknown failures. `pnpm --filter @stories/core test` passed (exit 0),
  9 files / 74 tests.
- TRIANGULATE / refactor: the two record types prove distinct persistence results
  (story becomes `cleaned`; pending row is removed), and first-run assertions pin
  media-then-poster deletion order. Final core run passed (exit 0), 9 files / 74
  tests. No additional production refactor was needed.
- Final verification: `pnpm test` PASS (exit 0), 17 files / 124 passed / 1
  skipped; `pnpm typecheck` PASS (exit 0); `pnpm lint` PASS (exit 0);
  `git diff --check` PASS (exit 0, no output).
- Persisted task state: `tasks.md` was intentionally unchanged because all five
  PR 7 implementation-owned rows were already truthfully `[x]`; it was re-read
  and confirmed before return. The cumulative Run 7 section retains the exact
  unchecked rows outside this PR 7 correction scope.
- Files changed by this correction: `packages/core/src/cleanup/cleanup-service.ts`
  and `packages/core/src/cleanup/cleanup-service.test.ts`, plus this cumulative
  progress record and the PR 7 verification record. No design deviation.
- Final measured PR 7 candidate against `b69f252`: **+896/−9 = 905 logical
  changed lines** — 634 code-facing lines and 262 OpenSpec-evidence lines. This
  exceeds the active runtime attempt cap of 800 by 105 lines, but remains below the
  1,500-line human review budget in `tasks.md`. The operator explicitly approved
  a `size:exception` for this cohesive PR 7 unit; the delivery boundary remains
  PR 7 and no delivery action was taken.

### Exact persisted unchecked rows outside PR 7

- [ ] **RED** Write `src/server.test.ts`: binds `127.0.0.1:3789` and honors `STORIES_API_PORT`; foreign `Host` header → `403` before handlers; foreign `Origin` → `403`; responses carry **no** CORS headers (D6); a global `preSerialization` hook replaces values of credential-like keys (`/(credential|secret|token|api.?key|service.?role)/i`) with `"[REDACTED]"` in any serialized payload (D8); logger serializers redact `authorization`/`cookie`; `GET /api/health` → 200. Write `tests/boundary/secret-scan.test.ts` (scanner unit-tested on a synthetic file list, then run on the tracked tree with a fixture secret declared only inside the test file — PM R2 scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/server.ts` (`buildServer({ db, makeAdapter })` factory), `src/plugins/loopback-guard.ts` (Host allowlist `127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>` + Origin allowlist), `src/plugins/redact.ts`, logger serializers, `src/routes/health.ts`; scanner passes on the real tree (`.env*` git-ignored per bootstrap). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Host `[::1]:3789` accepted; IPv6-mapped forms rejected; redaction hits nested objects and arrays; port override reflected in the allowlist. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Collapse guard checks into one `onRequest` hook with typed 403 payloads. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; PM R5 scenarios + PM R2 repo-scan scenario pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `packages/core/src/domain/project-service.test.ts` (create/list/update/delete; DTOs omit credential columns; delete cascades — PM R1 scenarios) and `packages/local-api/test/projects.test.ts`: CRUD via HTTP with redacted responses; **every** GET endpoint scanned for a fixture secret (PM R2 scenario); `POST /api/projects/:id/connection-test` runs the adapter `checkPublicRead` from Node, stores the result on `projects.lastConnectionCheck`, responds `browserPending: true`; bad credentials diagnose auth-class, never `cors` (PM R3 scenario); `POST /api/projects/:id/cors-check` stores the panel result and diagnoses `cors` when the node probe passed but the browser fetch was rejected; ranged-probe failure reports the video-seeking diagnosis (PM R4 scenarios); invalid payloads → typed 400; unknown id → 404. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/domain/project-service.ts`, `src/routes/projects.ts`, `src/routes/connection-test.ts`, `src/routes/cors-check.ts`, `src/domain/cors-diagnosis.ts` (per-provider remediation strings from `spike-findings.md`). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Redaction hook catches a deliberately mis-mapped DTO field (defense in depth); connection-test overwrites previous results; diagnosis precedence network/auth/bucket before cors. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Factor shared Zod request schemas; keep provider types out of routes (contract only). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; PM R1–R4 scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `packages/local-api/test/stories.test.ts`: multipart creation streams the media part end-to-end (fake adapter captures a stream + `contentLength`; no full-file buffering); Zod parses fields **before** the stream is consumed (invalid `expiresAt` → typed 400 and `adapter.upload` never called — SL R1 scenario); oversized part → `413` typed payload with no story row (limit configured small in test; SL R2 scenario); creation inserts status `published` and triggers a project publish automatically (manifest bytes change without a second call — Q2); `PATCH /api/stories/:id` re-validates the window; `DELETE /api/stories/:id` removes the row + pending-deletion record (SL R7); poster part optional and stored (`posterKey`). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/stories.ts` (multipart handler: parse fields → size guard `min(part, STORIES_MAX_UPLOAD_MB)` → stream into `adapter.upload` → `adapter.verify(key, { size, contentType })` → insert → auto-publish via the PR 6 service), `src/routes/story-edit.ts`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Video with `durationSeconds` field; upload-failure surfaces the typed `AdapterError` code and creates no row; publish trigger failure still records the story (local truth) and reports the publish failure separately. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Extract the field-first validation guard into a reusable multipart helper. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; SL R1/R2/R7 + MP R4 (creation path) scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `packages/local-api/test/publication.test.ts`: `POST /api/projects/:id/publish` runs the flow and returns success + manifest URL; failure returns the typed `AdapterError` code/detail payload (AC3 panel surfacing); `POST /api/projects/:id/rollback` republishes the latest successful bytes verbatim; `GET /api/projects/:id/publish-history` lists ≤50 rows newest-first with results; unknown project → 404. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/publication.ts` wiring the PR 6 services with Zod-validated params. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Rollback with no successful history row → typed error; history reflects a failed publication without changing the manifest. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** — (thin slice; confirm route/error shapes match PR 10 conventions). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; MP R4/R5 endpoint scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `packages/local-api/test/cleanup.test.ts` + `src/scheduler.test.ts` (fake timers): `POST /api/projects/:id/cleanup` runs the project job and returns the report; `GET /api/cleanup/status` returns the latest report; server startup runs the job without operator action (expired rows deleted via fake adapter); the 60-min interval fires and is configurable (EMC R1 scenarios). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/cleanup.ts` and `src/scheduler.ts` wired into `buildServer` startup. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Startup cleanup failure does not prevent the server from listening (best-effort, D1); interval override via env. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Unify trigger → service → report plumbing in one module. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; EMC R1 scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `src/stories-viewer.test.ts`: fetch + parse via `manifestSchemaV1` (mocked fetch); unknown `version` → console warning + renders nothing, never guesses (SEV R4 scenario); expiry filter by client clock with `vi.setSystemTime` — expired-at-or-before filtered, valid kept, re-checked on each `next()` so a mid-session expiry drops out (SEV R2 scenarios); displayed order equals manifest array order — no re-sort (SEV R3 scenario); `src/registration.test.ts`: module import without `window` registers nothing; `defineStoriesViewer()` registers explicitly; `/register` entry side-effects only in a browser-like env (SEV R6 client-only scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/stories-viewer.ts` (Lit `<stories-viewer manifest-url="…">` core: load → parse → filter → hold), `src/manifest-loader.ts`, `src/registration.ts`, `src/index.ts`, `src/register.ts`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Malformed payload → warning + empty render; poster present/absent surfaced to the render model; refetch on attribute change. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Split parse/filter into a pure module consumed by the element (kept SSR-free by construction). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SEV R2/R3/R4 + R6 (client-only) scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `src/viewer-ux.test.ts` (jsdom): per-story progress bars; prev/next via tap zones and arrow keys; pause on pointer-hold; photo renders, video renders with `posterUrl` and media-only fallback when absent (SEV R1 scenarios); `src/refresh.test.ts`: re-fetch when the tab becomes visible if last fetch >60 s, no re-fetch under 60 s (SEV R5 scenarios); `src/bundle-size.test.ts` (runs post-build): `dist/stories-viewer.iife.js` exists and gzipped size ≤50 KB. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement the viewer template/styles (full-screen, zero external assets), `vite.config.ts` dual build (ESM `dist/index.js` + types; IIFE `dist/stories-viewer.iife.js` with Lit + Zod + styles inlined), `/register` side-effect entry in the npm build. Tests + build pass; size budget met. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Story expiring mid-session skipped on next navigation (UI level); keyboard focus handling; `posterUrl` absent → no error and no broken image. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Deduplicate progress-bar timing logic; assert no SSR code path in the bundle (string scan test). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Tests + build green; SEV R1/R5/R6 scenarios pass; IIFE ≤50 KB gzipped; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED/STRUCTURE** Scaffold `apps/demo-astro` (static page: `<script defer src="…/stories-viewer.iife.js">` + `<stories-viewer manifest-url>`) and `apps/demo-next` (`dynamic(() => import('@stories/stories-embed/register'), { ssr: false })`); add `e2e/helpers/simulator-adapter.ts` (contract-backed adapter writing into the provider simulator) and `playwright.config.ts` web-server orchestration: provider simulator + local-api (wired to it) + both demos. Write `e2e/smoke.spec.ts`: plain HTML page + both demos render photo and video, viewer opens and navigates (SEV R7 scenarios); published manifest served by the simulator carries `Cache-Control: public, max-age=60` (MP R6 integration assert). Specs fail before demos exist. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Make the smokes pass: demos build and render against the simulator manifest. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED→GREEN (PC-off)** Add `e2e/pc-off.spec.ts`: publish via the API → **stop local-api** → load a demo → site still lists and renders published non-expired stories from the provider (simulator) alone (AC10 / MP R7 / SEV R7 PC-off scenario). Spec fails until orchestration stops the API correctly; then passes. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Smokes assert video playback starts and navigation reaches both stories in each framework (AC9). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** `pnpm e2e` green; SEV R7 + MP R6/R7 + AC9/AC10 Tier-1 proofs recorded in `verify.md`; diff ≤400 lines (generated lockfiles excluded from the count per one honest-slicing note if needed); record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `src/lib/connection-probe.test.ts` (browser probes: plain `fetch(publicManifestUrl)` + ranged `fetch(mediaUrl, { headers: { Range: 'bytes=0-1023' } })`; rejected fetch + passing node probe ⇒ diagnosis `cors`; range failure ⇒ video-seeking diagnosis) and `src/pages/projects.test.ts` (create/edit forms with validation errors surfaced; list shows non-secret fields only; delete confirms and cascades; connection-test flow: call node probe → run browser probes → POST `cors-check` → render stored diagnosis + per-provider remediation steps on failure). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement the app shell + routes, `src/api-client.ts` (typed, loopback same-origin via Vite proxy), `src/pages/projects/*`, `src/lib/connection-probe.ts`, remediation rendering. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Form blocks submission on invalid expiry/credentials shapes; diagnosis `network`/`auth` renders non-CORS remediation; credentials never displayed or present in client state (AC8). <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Extract shared form-field components. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; PM R4 browser-side scenarios pass in jsdom (real-origin confirmation is Tier 2); diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `src/lib/poster-capture.test.ts` (object-URL `<video>` mocked: seek target `min(0.1s, duration / 2)`; canvas capped at 720 px long edge; JPEG quality 0.8; capture failure or 3 s timeout omits the poster part and submission proceeds — SL R6 scenarios) and `src/pages/story-editor.test.ts` (file pre-check blocks submission over `STORIES_MAX_UPLOAD_MB` and shows the current limit — SL R2 scenario; expiry-window API errors mapped to visible UI errors naming the 24 h–30 d rule — SL R3/AC7; submit builds multipart with type/expiresAt/position/durationSeconds + optional poster). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/pages/story-editor/*` and `src/lib/poster-capture.ts` (non-blocking: capture runs concurrently with input; never gates publish). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Capture timeout race (resolve after submit started) leaves the story intact without poster; oversized selection after a valid one re-blocks; position field editable. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Share the limit constant source (API-provided config) instead of duplicating 200 MB. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SL R2/R3/R6 UI scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED** Write `src/pages/publish.test.ts` (publish button triggers `POST /publish`; success surfaces the manifest URL; failure surfaces the typed error code/detail — AC3; history list renders results; rollback action republishes with confirmation) and `src/pages/cleanup.test.ts` (cleanup status view renders the latest `CleanupReport` counts and per-story errors — AC5/EMC R3; manual cleanup button; help surface states that expired media may remain reachable by direct URL until the next successful run — EMC R4 operator-visibility scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/pages/publish/*` and `src/pages/cleanup/*` including the residual-window help text. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Failed publish leaves the previous manifest notice shown; report with zero expired stories renders an empty state; rollback disabled without a successful history row. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Share result/error banner components with PR 16/17 pages. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Panel suite + full `pnpm e2e` green (whole chain integrated); EMC R4 + MP R5 UI scenarios pass; diff ≤400 lines; record evidence; flag the change ready for the apply-phase Tier 2 list below. <!-- sdd-owner: implementation -->
- [ ] Run the env-gated live contract profile (`STORIES_E2E_SUPABASE_*`) — MSA R4 live scenario, AC6. <!-- sdd-owner: implementation -->
- [ ] Execute the PC-off scenario end-to-end against the real bucket: publish → stop local-api → demo site renders (AC1, AC10, MP R7). <!-- sdd-owner: implementation -->
- [ ] `curl -I` the real manifest URL and assert `Cache-Control: public, max-age=60` (AC4, MP R6). <!-- sdd-owner: implementation -->
- [ ] Confirm hosted CORS from a real site origin: plain GET + ranged video request (Spike B open item; PM R4). <!-- sdd-owner: implementation -->
      - [ ] After a story's `expiresAt` passes, re-fetch the real manifest and confirm exclusion (AC2 live half). <!-- sdd-owner: implementation -->

## Run 8 — PR 8 `@stories/local-api` security backbone + repository secret scan (branch `sdd/pr08-local-api-security`)

- Status consumed: parent-authoritative `add-embeddable-stories-system` status,
  `applyState: ready`, `repo-local` action context, workspace root authorized.
  Delivery: `auto-chain` + `stacked-to-main`, assigned work unit
  `pr08-local-api-security`, approved budget ≤1,500 changed lines. Warnings: none.
- Runtime attempt: authenticated to the parent-held active attempt using request id
  `pr08-local-api-security-kiro-auth-20260912`; token matched the active objective.
  The attempt was not settled, and no branch, commit, push, PR, review, or
  `.codegraph/` action was performed.
- Strict TDD: active with Vitest. Skill resolution: `paths-injected`
  (`/home/daryhen/.claude/skills/typescript/SKILL.md`).

### Completed tasks (persisted in `tasks.md`)

- [x] RED — added the local-api security and tracked-repository scan tests; the
  focused local-api run failed only because `./server.js` was absent.
- [x] GREEN — created `@stories/local-api` with the Fastify factory, loopback
  guard, recursive serialization redaction, logger serializers, and health route;
  added the tracked-tree secret scanner; focused tests passed.
- [x] TRIANGULATE — covered `STORIES_API_PORT`, `[::1]`, rejected IPv6-mapped
  Host, allowed same-origin localhost, nested and root-array payload redaction,
  and synthetic scan findings.
- [x] REFACTOR — retained one typed `onRequest` guard with typed 403 payloads;
  extracted loopback authority construction and removed unnecessary async noise.
- [x] Verify & bounds — package and boundary suites, typecheck, lint, and whitespace
  validation all passed; PM R5 and PM R2 traceability is recorded in `verify.md`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR 8 security backbone | `packages/local-api/src/server.test.ts` | HTTP integration | Core 74/74; boundary 3/3 | Missing `./server.js` | 8/8 | 10/10 | Single typed guard retained; 10/10 |
| PR 8 secret scan | `tests/boundary/secret-scan.test.ts` | Boundary/unit | Boundary 3/3 | Scanner test added before implementation | Boundary 5/5 | Synthetic + tracked-tree cases | In-memory fixture construction; 5/5 |

### Files changed

- `packages/local-api/package.json`, `tsconfig.json`, and `src/index.ts` — new
  workspace package scaffold with pinned `fastify` 5.12.4.
- `packages/local-api/src/server.ts` and `src/server.test.ts` — loopback server
  factory/listener, port resolution, safe logger serializers, and 10 HTTP tests.
- `packages/local-api/src/plugins/loopback-guard.ts` — typed Host/Origin
  `onRequest` boundary with 403 payloads.
- `packages/local-api/src/plugins/redact.ts` — recursive credential-key redaction.
- `packages/local-api/src/routes/health.ts` — `GET /api/health` liveness route.
- `tests/boundary/secret-scan.test.ts` — synthetic and Git-tracked-tree secret scan.
- `pnpm-lock.yaml` — Fastify resolved dependency graph.
- `openspec/changes/add-embeddable-stories-system/tasks.md` — only the five PR 8
  implementation task rows marked `[x]`.
- `openspec/changes/add-embeddable-stories-system/verify.md` and this file —
  cumulative strict-TDD and verification evidence.

### Commands and results

- `pnpm --filter @stories/core test && pnpm vitest run tests/boundary` — safety net
  PASS: core 74/74; boundary 3/3 before PR 8.
- `pnpm --filter @stories/local-api test` — RED FAIL: missing `./server.js`; then
  GREEN 8/8; TRIANGULATE/REFACTOR/final PASS 10/10.
- `pnpm vitest run tests/boundary` — final PASS: 2 files, 5/5.
- `pnpm typecheck` — PASS.
- `pnpm lint` — PASS.
- `git diff --check` — PASS: no whitespace errors.

### Deviations from design

- None. The factory reserves `db` and `makeAdapter` for later route slices but does
  not register them in PR 8; no route behavior beyond the security backbone landed.

### Remaining tasks / PR boundary

- All five implementation-owned PR 8 rows are visibly `[x]` in `tasks.md`.
- PR 9 onward remains unchecked and out of scope. Exact next unchecked row:
  `- [ ] **RED** Write \`packages/core/src/domain/project-service.test.ts\` (create/list/update/delete; DTOs omit credential columns; delete cascades — PM R1 scenarios) and \`packages/local-api/test/projects.test.ts\`: CRUD via HTTP with redacted responses; **every** GET endpoint scanned for a fixture secret (PM R2 scenario); \`POST /api/projects/:id/connection-test\` runs the adapter \`checkPublicRead\` from Node, stores the result on \`projects.lastConnectionCheck\`, responds \`browserPending: true\`; bad credentials diagnose auth-class, never \`cors\` (PM R3 scenario); \`POST /api/projects/:id/cors-check\` stores the panel result and diagnoses \`cors\` when the node probe passed but the browser fetch was rejected; ranged-probe failure reports the video-seeking diagnosis (PM R4 scenarios); invalid payloads → typed 400; unknown id → 404. All fail. Record evidence. <!-- sdd-owner: implementation -->`
- Final candidate measurement: **+1,091/−8 = 1,099 logical changed lines**:
  606 local-api/boundary source and tests, 347 resolved Fastify lockfile lines,
  and 138 added/8 removed OpenSpec lines. This is within the approved ≤1,500
  PR 8 budget; no code, tests, comments, docs, or evidence were removed to
  affect review size.

## Run 9 — PR 9 `@stories/local-api` project management + two-context connection test

- Status consumed: parent-authoritative `add-embeddable-stories-system`, `applyState: ready`, `repo-local` workspace `/home/daryhen/Documents/proyects/stories`, allowed root confirmed; delivery `auto-chain` + `stacked-to-main`, PR 9 only, approved ≤1,500 changed lines. Warnings: none.
- Runtime: authenticated to the parent-held active attempt with request id `pr09-project-management-kiro-child`; active token matched; no settlement, branch, staging, commit, push, PR, native review, dependency install, or `.codegraph/` mutation occurred.
- Strict TDD: active (Vitest). Safety net before edits: core **74/74** and local-api **10/10** passed. Skill resolution: `paths-injected` (`typescript`, `zod-4`).

### Completed tasks (persisted in `tasks.md`)

- [x] RED — core project-service tests failed on absent `./project-service.js`; eight HTTP scenarios failed with route `404`s while existing local-api tests remained green.
- [x] GREEN — local SQLite CRUD with UUIDs/redacted DTOs, project-aware adapter construction, Node probe persistence, browser-pending state, browser result storage, and typed project endpoint errors; core **78/78**, local-api **18/18**.
- [x] TRIANGULATE — deliberate `credentialsJson` DTO mis-map redacted; repeated Node check overwrites prior result; auth/network/bucket/public-read diagnoses precede CORS; failed range yields `video-seeking`; provider remediation covers Supabase and InsForge.
- [x] REFACTOR — shared Zod 4 request parsers live in core; route modules consume only project/core and `@stories/storage-adapters` contract types, never provider SDK types.
- [x] Verify & bounds — core **78/78**, local-api **20/20**, root typecheck/lint/diff check green; five PR 9 task rows visibly `[x]`.

### TDD Cycle Evidence

| Task | Test files | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR 9 project service + HTTP checks | `project-service.test.ts`, `projects.test.ts`, `cors-diagnosis.test.ts` | SQLite unit + Fastify integration + pure unit | 74/74 core; 10/10 API | Missing service; 8 route 404s | 78/78 core; 18/18 API | 20/20 API | Shared parsers/contract imports; all green |

### Files changed

- `packages/core/src/domain/project-service.{ts,test.ts}` and `src/index.ts` — project persistence, secret-free DTOs, JSON-safe check storage, shared request parsing.
- `packages/local-api/src/server.{ts,test.ts}`, `src/routes/{projects,connection-test,cors-check}.ts`, and `src/domain/cors-diagnosis.{ts,test.ts}` — CRUD and two-context checks without weakening PR 8 loopback/redaction controls.
- `packages/local-api/test/projects.test.ts` — CRUD, GET-secret scan, typed errors, result overwrite/persistence, CORS/range behavior.
- `openspec/changes/add-embeddable-stories-system/{tasks.md,verify.md,apply-progress.md}` — PR 9 task and evidence updates only.

### Commands and results

- `pnpm --filter @stories/core test` — PASS, 10 files / **78 tests**.
- `pnpm --filter @stories/local-api test` — PASS, 3 files / **20 tests**.
- `pnpm typecheck` — PASS; `pnpm lint` — PASS; `git diff --check` — PASS.

### Deviations, remaining tasks, and boundary

- No design deviation. Zod 4 disallows `.omit()` after an object refinement, so equivalent shared request schemas are explicit and tested; remediation language is sourced from Spike B's documented gateway/S3-compatibility limits.
- Next unchecked PR 10 rows remain exactly: `- [ ] **RED** Write \`packages/local-api/test/stories.test.ts\`...`;`- [ ] **GREEN** Implement \`src/routes/stories.ts\`...`;`- [ ] **TRIANGULATE** Video with \`durationSeconds\` field...`;`- [ ] **REFACTOR** Extract the field-first validation guard...`;`- [ ] **Verify & bounds** Suites green...` (all remain visibly unchecked in `tasks.md`; PR 11+ untouched).
- PR boundary: PR 9 only. Code-facing diff is **+1,379/−6 = 1,385** lines before OpenSpec evidence; final candidate remains within the approved 1,500-line PR budget. No size exception is needed.

## Run 10 — PR 10A `@stories/storage-adapters` truthful streaming contract + upload protocol (branch `sdd/pr10a-streaming-contract`)

- Status consumed: parent-authoritative `add-embeddable-stories-system`, `applyState: ready`, repo-local workspace `/home/daryhen/Documents/proyects/stories`; delivery `auto-chain` + stacked-to-main; native attempt generation 10 `pr10a-streaming-contract`, explicit 1,500-line cap. The one pre-existing untracked `.codegraph/.gitignore` was excluded through the provider inventory.
- Strict TDD: active (Vitest). The active runtime did not expose the configured SDD executor after its profile cache reported invalid `max` effort values, so the parent performed a bounded fallback limited to the exact five PR 10A tasks; no local-api route, dependency, Git delivery, or review operation occurred.

### Completed tasks (persisted in `tasks.md`)

- [x] RED — an SDK-boundary stream test failed: the adapter passed a `Uint8Array` and had already consumed/closed the source stream; the new guard test initially failed because its module was absent.
- [x] GREEN — `stream-guard.ts` validates declared size before reads, counts streamed chunks without collecting them, and the Supabase adapter now passes `UploadInput.body` directly to the SDK. The fake remains the only `asBytes()` consumer.
- [x] TRIANGULATE — tests cover stream identity plus zero pre-SDK pulls, multi-chunk forwarding, declared-size rejection, underflow, declared overflow, actual configured-limit overflow, and `Uint8Array` compatibility.
- [x] REFACTOR — guard exports/types are focused and reusable for PR 10B; fake and collector comments distinguish in-memory test emulation from production forwarding.
- [x] Verify & bounds — adapter 42 passing / 1 live profile skipped; workspace 158 passing / 1 skipped; package/root typecheck, lint, and whitespace checks pass. All five PR 10A rows are visibly `[x]`; PR 10B remains `[ ]`.

### TDD Cycle Evidence

| Task | Test files | RED | GREEN | TRIANGULATE | REFACTOR / verify |
| --- | --- | --- | --- | --- | --- |
| Direct adapter streaming | `supabase-adapter.test.ts` | Stub received buffered `Uint8Array` | Exact `ReadableStream` forwarded | Zero pre-SDK pulls + provider consumes same bytes | Contract suite remains green |
| Declared-length guard | `stream-guard.test.ts` | Missing module | Guard streams without collection | multi-chunk, underflow, both overflow modes, bytes regression | Public exports + fake-only collection documented |

### Files changed

- `packages/storage-adapters/src/stream-guard.{ts,test.ts}` — reusable non-buffering declared-length guard and strict tests.
- `src/supabase-adapter.{ts,test.ts}` — direct SDK body forwarding with an unread-stream boundary proof.
- `src/{body-bytes,fake-adapter,index,public-surface.test}.ts` — test-double-only collection documentation and guard exports.
- `openspec/changes/add-embeddable-stories-system/{tasks,design,specs/*}` — approved PR 10A/PR 10B split and protocol contract; `verify.md` / this progress log — evidence only.

### Commands and results

- `pnpm --filter @stories/storage-adapters test` — PASS, 6 files / **42 tests**, 1 env-gated live profile skipped.
- `pnpm --filter @stories/storage-adapters exec tsc -p tsconfig.json --noEmit` — PASS.
- `pnpm typecheck` · `pnpm lint` · `git diff --check` — PASS.
- `pnpm test` — PASS, 23 files / **158 tests**, 1 skipped live profile.

### Remaining tasks / PR boundary

- PR 10A is complete only through its adapter transport/protocol boundary. PR 10B is the next unchecked work unit and owns `@fastify/multipart`, endpoint parsing, story CRUD, verification, and auto-publication.
- Current local aggregate measurement is **+704/−100 = 804 logical lines**, below the ≤1,500 PR cap; native settlement owns each attempt's authoritative count. No tests, docs, or comments were removed for budget purposes.
- `.codegraph/.gitignore` remains untracked and excluded; no stage, commit, push, PR, or native review was performed.

### Judgment Day remediation — `R10A-STREAM-ERROR-REASON`

- Strict TDD RED: `pnpm --filter @stories/storage-adapters test -- src/supabase-adapter.test.ts` failed (exit 1) with the new default-client, installed `@supabase/storage-js@2.116.0` local-fetch seam: consuming a guarded underflow stream in mocked `fetch` made `adapter.upload()` reject a generic `AdapterError` rather than `StreamLengthError`.
- GREEN: upload recognizes only the SDK error's one-level `originalError` when that value is already an `AdapterError`; the original `StreamLengthError` now crosses unchanged, retaining `reason === "UNDERFLOW"`. Other nested values and the existing provider taxonomy are unchanged.
- Focused verification: the same test command passed (exit 0), 6 files / 42 passed / 1 env-gated live profile skipped; package `tsc -p tsconfig.json --noEmit` and `git diff --check` passed (exit 0). No stream guard, local-api, dependency, lockfile, task, or delivery file changed.

### Judgment Day remediation — `R10A-GUARD-PREFETCH`

- RED: `pnpm --filter @stories/storage-adapters test -- src/stream-guard.test.ts` failed (exit 1): after one microtask an unconsumed guard had pulled its `{ highWaterMark: 0 }` source once (`expected 0`, received `1`).
- GREEN: `guardUploadBody()` now constructs its output `ReadableStream` with `{ highWaterMark: 0 }`, so it neither acquires nor pulls or locks the source until a consumer reads the returned stream. The focused test also consumes the guard and confirms multi-chunk byte forwarding.
- Focused validation: the same command passed (exit 0), 6 files / 42 passed / 1 env-gated live profile skipped. Underflow and both overflow scenarios remain in the focused suite.
- Final safety net after the correction: adapter suite 42 passing / 1 skipped; root typecheck, lint, `git diff --check`, and workspace suite 158 passing / 1 skipped all pass.

## Run 11 — PR 10B `@stories/local-api` streaming story endpoints (size-gated)

- Status consumed: parent-authoritative change `add-embeddable-stories-system`, `applyState: ready`, repo-local workspace and approved roots, delivery `auto-chain` / `stacked-to-main`, PR 10B-only scope, strict TDD active. Action-context warnings: none. `.codegraph/.gitignore` stayed uninspected and excluded.
- Skill resolution: `paths-injected` (`work-unit-commits`, TypeScript, Zod 4).

### Implemented work, pending delivery decision

- Added pinned `@fastify/multipart@9.4.0`, field-first multipart parsing, Node-to-Web stream conversion only after scalar validation, PR 10A `guardUploadBody()` usage, upload/verify, media/poster cache policy, auto-publication, typed failures, PATCH, and pending-deletion DELETE.
- Added the narrow core seam: creation can accept a validated preallocated UUID so `stories/<storyId>/…` storage keys and the inserted local row match; core metadata parsing owns scalar Zod expiry/type/position/size validation.
- Publication failure semantics are pinned: creation returns 201 with the persisted story plus `publication.status: "failed"` and typed `{ code, detail }`; no rollback of local truth occurs.

### TDD Cycle Evidence

| Task | Test file | Safety net | RED | GREEN | TRIANGULATE | REFACTOR / final checks |
| --- | --- | --- | --- | --- | --- | --- |
| PR 10B story endpoints | `packages/local-api/test/stories.test.ts` | API 20/20; PR 10A 22/1 skipped | 7 endpoint 404 failures | 7/7 then 8/8 | limits, mismatch, video/poster, adapter/publication failures, edit/delete/404 | API 28/28; core 80/80; workspace 168/1 skipped; typecheck/lint/diff check pass |
| Minimal core seam | `packages/core/src/domain/story-service.test.ts` | core 78/78 | strict input rejected `id` | 19/19 | metadata schema valid/invalid cases | 20/20 focused, 80/80 package |

### Commands and results

- `pnpm --filter @stories/local-api test` — PASS, 4 files / 28 tests.
- `pnpm --filter @stories/core test` — PASS, 10 files / 80 tests.
- `pnpm --filter @stories/storage-adapters exec vitest run src/stream-guard.test.ts src/supabase-adapter.test.ts` — PASS, 22 tests / 1 expected env-gated skip.
- `pnpm test` — PASS, 24 files / 168 tests / 1 expected env-gated skip.
- `pnpm typecheck`, `pnpm lint`, and `git diff --check` — PASS.

### Blocked delivery boundary

- Before OpenSpec evidence: 121 tracked + 724 new route + 626 new test = **1,471 logical lines**. Required evidence/task records push the cohesive unit over the explicit 1,500-line runtime cap.
- Task checkboxes were intentionally not flipped: the five PR 10B rows remain visibly `[ ]` until an explicit `size:exception` or maintainer-approved re-slice is supplied. No commit, stage, push, PR, branch, or attempt-ledger action was taken.
- Required decision: `size:exception` for this cohesive endpoint + strict-TDD test unit, or a new approved boundary preserving tests/evidence with the moved behavior.

### Resolution — maintainer-approved size exception

- The maintainer approved an updated `size:exception`; native SDD authority recorded the exact PR 10B candidate at **1,735 / 1,500 logical changed lines** (**+235**), superseding the earlier 1,620-line accounting after the request-clock correction and mandatory evidence. Final accounting is 221 tracked diff lines plus 1,514 selected untracked route/test lines; ordinary `git diff --numstat` omits those untracked files.
- No behavior, tests, comments, or documentation was removed or compressed. The multipart parser, streaming route, edit/delete routes, minimal core seam, strict-TDD integration suite, and OpenSpec evidence remain one cohesive work unit.
- Reconciliation gates reran successfully: local-api 28/28, core 80/80, PR 10A adapters 22 passed / 1 expected skip, typecheck, lint, and `git diff --check` clean. Exactly the five PR 10B task rows were then marked `[x]`; downstream rows remain untouched.
- Candidate is ready for independent verification and native review. No commit, stage, push, or PR action occurred.

### Correction — request-scoped expiry boundary clock

- Independent readback exposed a real boundary defect: multipart metadata validation and final story insertion allocated separate clocks. A request exactly 24 hours ahead could pass before streaming then fail after the adapter consumed media, leaving an accepted orphan and returning HTTP 500.
- RED: a Date-only fake-timer integration test fixed the request instant at `2030-01-01T00:00:00.000Z`, advanced it by one millisecond after media upload, and observed the expected failing 500 response.
- GREEN: `stories.ts` now captures one request-scoped `now`, forwards it to `readStoryMultipart`, and passes it into `createStory`; `story-multipart.ts` parses scalar metadata with that same instant. The focused test passed 9/9.
- TRIANGULATE: a 24-hour-minus-one-millisecond request is rejected 400 before upload/insert, while the exact boundary accepts. Final gates: local-api 30/30; core 80/80; adapter regression 22 passed / 1 expected skip; workspace 170 passed / 1 expected skip; typecheck, lint, and diff checks clean.
- The correction is confined to the existing PR 10B route/parser/test work unit. It introduces no new endpoint or contract surface, and the current runtime objective is `pr10b-expiry-boundary-clock`.
