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
