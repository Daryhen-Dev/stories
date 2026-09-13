# Tasks — `add-embeddable-stories-system`

Implementation plan for the first product slice: local-first panel → per-project
public manifests on Supabase → Lit embed for Astro/Next.js sites, with PC-off
availability and expiry. The change is delivered as **18 stacked PRs**
(`stacked-to-main`), each ≤400 estimated changed lines, each with its own
verification and rollback boundary. This file plans work only; it implements
nothing.

- Prerequisite: `sdd-monorepo-bootstrap` (NOT yet applied — it is the first
  implementation step and must land before PR 1) provides the pnpm workspace, TS
  strict config, Vitest, and Playwright. **No tooling is created in this
  change**; every PR below only consumes the bootstrap. Per-package
  `package.json`/`tsconfig` files created below extend the bootstrap base.
- Artifact store: `openspec`. Inputs: `proposal.md`, `design.md` (D1–D10,
  D9 parameters), `spike-findings.md`, `specs/*/spec.md`.
- Delivery decision (operator, resolved): `auto-chain` + `stacked-to-main`,
  400-line budget per PR. `Decision needed before apply: No`.

## Conventions

- **Strict TDD (non-negotiable, runner: Vitest).** Every implementation task
  cycles RED → GREEN → TRIANGULATE → REFACTOR. Record evidence (failing output
  for RED, passing output for GREEN, command used) in
  `openspec/changes/add-embeddable-stories-system/verify.md` as a per-PR draft
  section while applying.
- **Test placement** (per design): unit/contract tests beside sources
  (`*.test.ts`); local-api integration tests in `packages/local-api/test/`;
  repo-root boundary/scan tests in `tests/boundary/`; Playwright specs in
  `e2e/`.
- **Spec shorthand** (`R#` = ADDED requirement order within each delta spec):
  MP = `manifest-publication`, MSA = `media-storage-adapters`,
  PM = `project-management`, SL = `story-lifecycle`,
  SEV = `stories-embed-viewer`, EMC = `expired-media-cleanup`.
- **Verification tiers** (design D10): Tier 1 = automated (fake adapter +
  provider simulator); Tier 2 = apply-phase run against the operator's real
  Supabase project, recorded in `verify.md`. Every PR below is Tier 1;
  Tier 2 items are listed at the end.
- **D9 constants** referenced by tasks: manifest TTL 60 s; media TTL
  31536000 immutable; max upload 200 MB (`STORIES_MAX_UPLOAD_MB`); cleanup
  interval 60 min; loopback `127.0.0.1:3789` (`STORIES_API_PORT`); poster
  720 px / JPEG 0.8 / 3 s timeout; manifest version `1`; story cap 100;
  expiry window 24 h–30 d in the future.
- **PR mechanics (stacked-to-main):** PR 1 targets `main`; PR N targets the
  branch of PR N−1 (GitHub retargets to `main` as predecessors merge; the last
  PR is the final integration to `main`). Branch names: `sdd/prNN-<slug>`.
  Before opening any PR: measure `git diff --stat <base>...HEAD`; if it exceeds
  400 lines, make **one honest slicing pass** (chained-pr skill) — never shrink
  diffs by deleting comments/tests/docs. No child subagents are launched by
  this plan; the orchestrator owns delegation.

## Review Workload Forecast (summary)

| Field | Value |
| ------- | ------- |
| Estimated changed lines | ≈4,800–5,900 across 18 stacked PRs (bottom-up; see per-PR table at the end) |
| 400-line budget risk | Low (per PR: every PR is sized ≤400 with a measured guard at PR-open time) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 18 stacked-to-main (manifest-schema → adapters → core → local-api → embed → demos/e2e → panel) |
| Delivery strategy | auto-chain (operator decision; supersedes the `ask-on-risk` config default) |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

Forecast note: the bottom-up total is higher than the proposal's top-down
1,900–3,100 estimate because it itemizes platform/test infrastructure the
capability rollup did not line-item (security backbone, thin endpoint PRs,
Supabase adapter + provider simulator, boundary scans, demos/e2e orchestration)
and uses conservative test sizing. Total-size risk is acknowledged and accepted
by the operator's `auto-chain` decision; per-PR budget risk stays Low.

---

## PR sequence

### PR 1 — `@stories/manifest-schema`: stories.json schema v1

| | |
| --- | --- |
| Package | `packages/manifest-schema` (new; dep: `zod` only) |
| Specs | MP R1 (schema v1), MP R2 (additive versioning) |
| Depends on | bootstrap workspace only · Branch `sdd/pr01-manifest-schema` → `main` |
| Bounds | Start: empty workspace · Finish: schema parses/rejects per spec · Verify: `pnpm --filter @stories/manifest-schema test` · Rollback: revert branch; no dependents yet |

- [x] **RED** Write `packages/manifest-schema/src/manifest-schema.test.ts` covering MP R1/R2 scenarios: valid v1 manifest parses; `generatedAt` with UTC offset (non-`Z`) rejected; 101 stories rejected and 100 accepted (cap); unknown field rejected (strict objects); top-level `version` is literal `1`; an added optional story field still parses with the previous v1 schema; non-UUID `id`/`projectId` and negative `position` rejected; absent `posterUrl` accepted. Run `pnpm --filter @stories/manifest-schema test` → fails (module missing). Record evidence. <!-- sdd-owner: implementation -->
- [x] **GREEN** Implement `src/manifest-schema.ts` (`isoUtc` = `z.string().datetime()`, `manifestStorySchema`, `manifestSchemaV1` with `.strict()` + `.max(100)`, `MANIFEST_VERSION = 1`) and `src/index.ts` type exports; add `package.json` + tsconfig extending the bootstrap base. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE** Add nested-unknown-field rejection and `position: 0` boundary acceptance; assert exports contain no secrets/provider IDs (type-level scan of a generated sample manifest). <!-- sdd-owner: implementation -->
- [x] **REFACTOR** Collapse fixtures into a single `validManifest()` factory; keep `zod` the only dependency (assert in a test). <!-- sdd-owner: implementation -->
- [x] **Verify & bounds** Full suite green; MP R1–R2 scenarios all pass; diff ≤400 lines before opening the PR; PR body states start/finish/rollback. Record evidence in `verify.md`. <!-- sdd-owner: implementation -->

### PR 2 — `@stories/storage-adapters`: contract, error taxonomy, fake, contract suite, boundary

| | |
| --- | --- |
| Package | `packages/storage-adapters` (new) + ESLint `no-restricted-imports` delta for `@supabase/*` |
| Specs | MSA R1 (contract), R2 (taxonomy), R3 (verify/delete semantics), R4 (contract suite), R5 (encapsulation, static half), R6 (no TTL surface), R7 (cache-control propagation) |
| Depends on | PR 1 (workspace order only) · Branch → PR 1 branch |
| Bounds | Start: no storage seam · Finish: fake passes the full contract suite; boundary enforced mechanically · Verify: `pnpm --filter @stories/storage-adapters test` + `tests/boundary` · Rollback: revert branch; PR 1 untouched |

- [x] **RED** Write `src/contract-suite.test.ts` (suite vs in-memory fake), `src/errors.test.ts` (every taxonomy code constructible; raw SDK error never crosses the boundary), `src/fake-adapter.test.ts` (upload→verify round-trip incl. size/content-type mismatch naming the property; delete → `OBJECT_NOT_FOUND`; `checkPublicRead` public vs non-public bucket; bad-credential simulation → `AUTH_FAILED` + remediation; `cacheControlSeconds` recorded), `src/public-surface.test.ts` (exported surface has no lifecycle/TTL member — MSA R6), and `tests/boundary/provider-encapsulation.test.ts` (scanner fed a synthetic leaking import fails, then scanning the real tree yields zero violations). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [x] **GREEN** Implement `src/types.ts` (`StorageAdapter`, `UploadInput`, `ObjectExpectation`, `VerifyResult`, `PublicReadCheck`, `ProviderId` — exactly five operations + probe), `src/errors.ts` (`AdapterError`, code taxonomy, `remediation` for auth/bucket/public-read/CORS-adjacent), `src/fake-adapter.ts` (in-memory store persisting cache-control seconds; public/non-public bucket flag), `src/contract-suite.ts` (`runStorageAdapterContractSuite`), scanner in `tests/boundary/provider-encapsulation.test.ts`, and the ESLint `no-restricted-imports` rule blocking `@supabase/*` outside `packages/storage-adapters`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE** Suite cases: `publicUrl` deterministic shape without network; mismatch detail names the mismatched property; manifest TTL 60 vs media TTL 31536000 propagation asserted separately. <!-- sdd-owner: implementation -->
- [x] **REFACTOR** Extract shared suite helpers (bucket factory, expectation builders); keep suite provider-agnostic (never names Supabase). <!-- sdd-owner: implementation -->
- [x] **Verify & bounds** Suite green against the fake; boundary test + lint rule pass on the real tree; MSA R1–R4, R6–R7 traced; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 3 — Supabase reference adapter + provider simulator

| | |
| --- | --- |
| Packages | `packages/storage-adapters` (extends) · `tools/provider-simulator` (new) |
| Specs | MSA R5 (encapsulation, live profile), R4 (env-gated live run), R7 (simulator mirrors headers); AC6; Spike B groundwork |
| Depends on | PR 2 · Branch → PR 2 branch |
| Bounds | Start: contract without a real provider · Finish: Supabase adapter passes the suite (unit-mapped; live env-gated); simulator serves objects with D9 headers · Verify: `pnpm --filter @stories/storage-adapters test && pnpm --filter @stories/provider-simulator test` · Rollback: revert branch |

- [x] **RED** Write `src/supabase-adapter.test.ts` with a stubbed SDK client mapping provider failures → codes: 401 → `AUTH_FAILED`, missing bucket → `BUCKET_NOT_FOUND`, private bucket read → `BUCKET_NOT_PUBLIC`, upload fault → `UPLOAD_FAILED`, missing object → `OBJECT_NOT_FOUND`, size/type mismatch → `VERIFY_MISMATCH`, delete fault → `DELETE_FAILED`, network fault → `NETWORK_ERROR`, each with remediation text; and `tools/provider-simulator/index.test.ts` (GET serves stored bytes; stored `Cache-Control` mirrored: `public, max-age=60` and `public, max-age=31536000, immutable`; ranged GET returns 206 partial content). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [x] **GREEN** Implement `src/supabase-adapter.ts` (wraps SDK; `@supabase/*` imports confined to this package; `upload` persists `cacheControlSeconds` as object metadata; `verify`; `publicUrl` from `publicBaseUrl`; `delete`; `checkPublicRead`) and `tools/provider-simulator/index.ts` (static store with metadata + range support). Register the env-gated live profile: `runStorageAdapterContractSuite` against Supabase runs only with `STORIES_E2E_SUPABASE_*` set, skips otherwise (MSA R4 scenario). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE** Simulator: 404 for unknown keys; content-type passthrough; head-vs-get consistency. Adapter: `UNKNOWN` fallback for unmapped errors. <!-- sdd-owner: implementation -->
- [x] **REFACTOR** Share upload/verify plumbing between fake and Supabase adapter where it does not leak SDK types; re-run the suite against both. <!-- sdd-owner: implementation -->
- [x] **Verify & bounds** Suite green vs fake; live profile registered + skipped without env; boundary scan still clean (MSA R5); diff ≤400 lines; record evidence. Tier 2: run the live profile during apply (see final section). <!-- sdd-owner: implementation -->

### PR 4 — `@stories/core`: data model + expiry materialization

| | |
| --- | --- |
| Package | `packages/core` (new; deps: `drizzle-orm`, `better-sqlite3`, `@stories/manifest-schema`) |
| Specs | SL R4 (status model + `expireStories`), MP R3 precondition (sweep-first generation), design data model |
| Depends on | PR 3 · Branch → PR 3 branch |
| Bounds | Start: no persistence · Finish: SQLite schema + migrations + expiry sweep work · Verify: `pnpm --filter @stories/core test` · Rollback: revert branch |

- [ ] **RED** Write `src/db/schema.test.ts` (tables exist with design columns; `timestamp_ms` mode round-trips epoch-ms; story default status `published`; project delete cascades to stories/history/pending-deletion) and `src/domain/expire-stories.test.ts` (`published` → `expired` when `expiresAt <= now`; boundary equality transitions; future stories untouched; idempotent re-run). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/db/schema.ts` (`projects` incl. `credentialsJson` never selected into DTOs — D8, `stories`, `publishHistory`, `storyMediaPendingDeletion`), `src/db/client.ts` (Drizzle init helper), forward-only migration `drizzle/0001_init.sql` via Drizzle Kit, `src/domain/expire-stories.ts`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Cascade removal removes history and pending-deletion rows; UUID v4 app-side ids; unique project name enforced. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Centralize timestamp helpers (epoch-ms storage, ISO-8601 `Z` serialization at boundaries). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SL R4 sweep scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 5 — `@stories/core`: story domain service

| | |
| --- | --- |
| Package | `packages/core` (extends) |
| Specs | SL R3 (expiry window), R5 (ordering), R7 (removal + pending-deletion row); SL R4 second scenario (stale column) |
| Depends on | PR 4 · Branch → PR 4 branch |
| Bounds | Start: tables without domain rules · Finish: story records follow window/ordering/removal rules · Verify: `pnpm --filter @stories/core test` · Rollback: revert branch |

- [ ] **RED** Write `src/domain/expiry-window.test.ts` (12 h and 45 d rejected; exactly 24 h and exactly 30 d accepted — SL R3 boundary scenario; non-UTC input rejected), `src/domain/story-service.test.ts` (create inserts app-generated UUID with status `published`; update edits `expiresAt`/`position` re-validating the window; ordering comparator: `position` asc, `createdAt` desc tiebreak — SL R5 scenarios; remove deletes the row and writes `storyMediaPendingDeletion` with media+poster keys **in the same transaction** — SL R7 scenario), `src/domain/ordering.test.ts`. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/domain/expiry-window.ts` (Zod refinement: UTC instant 24 h–30 d in the future), `src/domain/ordering.ts`, `src/domain/story-service.ts` (factory over Drizzle db; transactional remove). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Removal of a story without poster records only the media key; transaction rollback when the pending-deletion insert fails leaves the story row intact. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Reuse window refinement in both create and edit paths (single definition). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SL R3/R5/R7 scenarios pass; stale-`published` expiry handled by sweep-first (covered with PR 6 generation); diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 6 — `@stories/core`: manifest generation + atomic publication + history/rollback

| | |
| --- | --- |
| Package | `packages/core` (extends; depends on `@stories/storage-adapters` contract only) |
| Specs | MP R3 (generation rules), R4 (atomic publication + verification), R5 (history + verbatim rollback), R6 (TTL requested on uploads), R7 (provider-only write path); AC2/AC3/AC4 logic |
| Depends on | PR 5 · Branch → PR 5 branch |
| Bounds | Start: local truth without publication · Finish: deterministic manifest bytes, atomic cutover, rollback · Verify: `pnpm --filter @stories/core test` · Rollback: revert branch |

- [ ] **RED** Write `src/publication/generate-manifest.test.ts` (expired excluded even when the status column is stale — sweep runs first; ordering `position` asc / `createdAt` desc; deterministic bytes for equal inputs; URLs built from `publicBaseUrl`; poster URL included when present; empty and 100-story projects valid) and `src/publication/publication-service.test.ts` (happy path against the fake adapter: manifest upload with `cacheControlSeconds: 60`; verify + read-back parse with `manifestSchemaV1` + story-id set equality; `result='success'` history row stores exact bytes; media verify-failure aborts leaving previous manifest bytes unchanged + `result='failed'` row + typed `AdapterError` surfaced; read-back mismatch treated as unverified failure with previous bytes recoverable from history; history pruned to 50; rollback republishes the latest successful bytes **verbatim** — restored bytes may contain since-expired stories which still self-expire by data). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/publication/generate-manifest.ts` (expire → filter → sort → deterministic serialization: fixed key order, no pretty-print), `src/publication/publication-service.ts` (factory `(db, makeAdapter)` implementing design steps 1–6; the single manifest PUT is the only production write path — MP R7), `src/publication/rollback.ts` (verbatim bytes re-upload + verify), history pruning. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Upload-failure at step 4 leaves previous manifest serving; crash-window orphan media accepted (D5) and never referenced; media `cacheControlSeconds: 31536000` asserted for poster+media uploads. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Factor the verify+read-back round into a shared helper reused by publish and rollback. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; MP R3–R6 scenarios pass (served-header assertion lands with the simulator in PR 15 integration); diff ≤400 lines (largest PR — measure early and split generation from publication if over); record evidence. <!-- sdd-owner: implementation -->

### PR 7 — `@stories/core`: cleanup service

| | |
| --- | --- |
| Package | `packages/core` (extends) |
| Specs | EMC R2 (per-story deletion + transitions), R3 (report), R4 (never correctness), R5 (pending-deletion sweep); AC5 logic; D1/Spike A consequences |
| Depends on | PR 6 · Branch → PR 6 branch |
| Bounds | Start: expired rows accumulate forever · Finish: best-effort sweep with per-story outcomes · Verify: `pnpm --filter @stories/core test` · Rollback: revert branch |

- [ ] **RED** Write `src/cleanup/cleanup-service.test.ts`: expiry sweep runs first; expired stories with media selected; success → `cleaned` + `cleanedAt` + error cleared; failure → `lastCleanupError = '<code>: <detail>'` and the job **continues** (mixed-results scenario); poster deleted alongside media; pending-deletion rows swept into the same report; report shape `{ attempted, deleted, failed, errors: [{ storyId, code }] }`; an adapter whose `delete` always fails still completes the job (EMC R4 scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/cleanup/cleanup-service.ts` (factory `(db, makeAdapter)`; explicit `adapter.delete` calls only — no TTL surface, D1) and the `CleanupReport` type. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Story with media but no poster; pending-deletion sweep failure does not block the expired-story pass; report counts match outcomes exactly (3 attempted / 2 deleted / 1 failed scenario). <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Share the expire-first preamble with the publication service. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; EMC R2/R3/R5 + R4 (service half) scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 8 — `@stories/local-api`: security backbone + repo secret scan

| | |
| --- | --- |
| Package | `packages/local-api` (new; deps: `fastify`, `@stories/storage-adapters`) + `tests/boundary/secret-scan.test.ts` |
| Specs | PM R5 (loopback-only security), PM R2 (repo-scan half; redaction hook), D6/D8/D9; AC8 repo half |
| Depends on | PR 7 · Branch → PR 7 branch |
| Bounds | Start: no API process · Finish: hardened loopback server with redaction + repo scan · Verify: `pnpm --filter @stories/local-api test && pnpm vitest run tests/boundary` · Rollback: revert branch |

- [ ] **RED** Write `src/server.test.ts`: binds `127.0.0.1:3789` and honors `STORIES_API_PORT`; foreign `Host` header → `403` before handlers; foreign `Origin` → `403`; responses carry **no** CORS headers (D6); a global `preSerialization` hook replaces values of credential-like keys (`/(credential|secret|token|api.?key|service.?role)/i`) with `"[REDACTED]"` in any serialized payload (D8); logger serializers redact `authorization`/`cookie`; `GET /api/health` → 200. Write `tests/boundary/secret-scan.test.ts` (scanner unit-tested on a synthetic file list, then run on the tracked tree with a fixture secret declared only inside the test file — PM R2 scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/server.ts` (`buildServer({ db, makeAdapter })` factory), `src/plugins/loopback-guard.ts` (Host allowlist `127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>` + Origin allowlist), `src/plugins/redact.ts`, logger serializers, `src/routes/health.ts`; scanner passes on the real tree (`.env*` git-ignored per bootstrap). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Host `[::1]:3789` accepted; IPv6-mapped forms rejected; redaction hits nested objects and arrays; port override reflected in the allowlist. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Collapse guard checks into one `onRequest` hook with typed 403 payloads. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; PM R5 scenarios + PM R2 repo-scan scenario pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 9 — `@stories/local-api`: project management + two-context connection test

| | |
| --- | --- |
| Packages | `packages/local-api` (extends) · `packages/core` (project service) |
| Specs | PM R1 (CRUD), R2 (secrecy in responses), R3 (node probe), R4 (cors-check storage + diagnosis); AC8 response half |
| Depends on | PR 8 · Branch → PR 8 branch |
| Bounds | Start: server without domain routes · Finish: project CRUD + connection/cors endpoints with redacted responses · Verify: `pnpm --filter @stories/local-api test` · Rollback: revert branch |

- [ ] **RED** Write `packages/core/src/domain/project-service.test.ts` (create/list/update/delete; DTOs omit credential columns; delete cascades — PM R1 scenarios) and `packages/local-api/test/projects.test.ts`: CRUD via HTTP with redacted responses; **every** GET endpoint scanned for a fixture secret (PM R2 scenario); `POST /api/projects/:id/connection-test` runs the adapter `checkPublicRead` from Node, stores the result on `projects.lastConnectionCheck`, responds `browserPending: true`; bad credentials diagnose auth-class, never `cors` (PM R3 scenario); `POST /api/projects/:id/cors-check` stores the panel result and diagnoses `cors` when the node probe passed but the browser fetch was rejected; ranged-probe failure reports the video-seeking diagnosis (PM R4 scenarios); invalid payloads → typed 400; unknown id → 404. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/domain/project-service.ts`, `src/routes/projects.ts`, `src/routes/connection-test.ts`, `src/routes/cors-check.ts`, `src/domain/cors-diagnosis.ts` (per-provider remediation strings from `spike-findings.md`). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Redaction hook catches a deliberately mis-mapped DTO field (defense in depth); connection-test overwrites previous results; diagnosis precedence network/auth/bucket before cors. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Factor shared Zod request schemas; keep provider types out of routes (contract only). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; PM R1–R4 scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 10 — `@stories/local-api`: streaming story endpoints

| | |
| --- | --- |
| Packages | `packages/local-api` (extends; dep: `@fastify/multipart`) |
| Specs | SL R1 (streaming creation, validation first), R2 (upload limit), R7 (removal endpoint); MP R4 auto-publish path; AC1/AC7 API half; R5 |
| Depends on | PR 9 · Branch → PR 9 branch |
| Bounds | Start: stories unreachable via API · Finish: multipart streaming creation with limits + auto-publish · Verify: `pnpm --filter @stories/local-api test` · Rollback: revert branch |

- [ ] **RED** Write `packages/local-api/test/stories.test.ts`: multipart creation streams the media part end-to-end (fake adapter captures a stream + `contentLength`; no full-file buffering); Zod parses fields **before** the stream is consumed (invalid `expiresAt` → typed 400 and `adapter.upload` never called — SL R1 scenario); oversized part → `413` typed payload with no story row (limit configured small in test; SL R2 scenario); creation inserts status `published` and triggers a project publish automatically (manifest bytes change without a second call — Q2); `PATCH /api/stories/:id` re-validates the window; `DELETE /api/stories/:id` removes the row + pending-deletion record (SL R7); poster part optional and stored (`posterKey`). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/stories.ts` (multipart handler: parse fields → size guard `min(part, STORIES_MAX_UPLOAD_MB)` → stream into `adapter.upload` → `adapter.verify(key, { size, contentType })` → insert → auto-publish via the PR 6 service), `src/routes/story-edit.ts`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Video with `durationSeconds` field; upload-failure surfaces the typed `AdapterError` code and creates no row; publish trigger failure still records the story (local truth) and reports the publish failure separately. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Extract the field-first validation guard into a reusable multipart helper. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suites green; SL R1/R2/R7 + MP R4 (creation path) scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 11 — `@stories/local-api`: publication endpoints

| | |
| --- | --- |
| Package | `packages/local-api` (extends) |
| Specs | MP R4/R5 endpoints; AC3 panel-facing typed failure |
| Depends on | PR 10 · Branch → PR 10 branch |
| Bounds | Start: publication reachable only in-process · Finish: publish/rollback/history over HTTP · Verify: `pnpm --filter @stories/local-api test` · Rollback: revert branch |

- [ ] **RED** Write `packages/local-api/test/publication.test.ts`: `POST /api/projects/:id/publish` runs the flow and returns success + manifest URL; failure returns the typed `AdapterError` code/detail payload (AC3 panel surfacing); `POST /api/projects/:id/rollback` republishes the latest successful bytes verbatim; `GET /api/projects/:id/publish-history` lists ≤50 rows newest-first with results; unknown project → 404. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/publication.ts` wiring the PR 6 services with Zod-validated params. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Rollback with no successful history row → typed error; history reflects a failed publication without changing the manifest. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** — (thin slice; confirm route/error shapes match PR 10 conventions). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; MP R4/R5 endpoint scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 12 — `@stories/local-api`: cleanup endpoints + triggers

| | |
| --- | --- |
| Package | `packages/local-api` (extends) |
| Specs | EMC R1 (startup + 60-min interval + manual); AC5 surfacing |
| Depends on | PR 11 · Branch → PR 11 branch |
| Bounds | Start: cleanup only invocable in-process · Finish: scheduled + manual cleanup with status endpoint · Verify: `pnpm --filter @stories/local-api test` · Rollback: revert branch |

- [ ] **RED** Write `packages/local-api/test/cleanup.test.ts` + `src/scheduler.test.ts` (fake timers): `POST /api/projects/:id/cleanup` runs the project job and returns the report; `GET /api/cleanup/status` returns the latest report; server startup runs the job without operator action (expired rows deleted via fake adapter); the 60-min interval fires and is configurable (EMC R1 scenarios). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/routes/cleanup.ts` and `src/scheduler.ts` wired into `buildServer` startup. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Startup cleanup failure does not prevent the server from listening (best-effort, D1); interval override via env. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Unify trigger → service → report plumbing in one module. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; EMC R1 scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 13 — `@stories/stories-embed`: viewer core

| | |
| --- | --- |
| Package | `packages/stories-embed` (new; deps: `lit`, `@stories/manifest-schema`) |
| Specs | SEV R2 (expiry filter), R3 (order trusted), R4 (version guard), R6 client-only half (inert on server, `defineStoriesViewer`, `/register` entry); AC2 embed half |
| Depends on | PR 1 (schema) · Branch → PR 12 branch |
| Bounds | Start: no embed package · Finish: element parses, guards, filters, preserves order, client-only · Verify: `pnpm --filter @stories/stories-embed test` · Rollback: revert branch |

- [ ] **RED** Write `src/stories-viewer.test.ts`: fetch + parse via `manifestSchemaV1` (mocked fetch); unknown `version` → console warning + renders nothing, never guesses (SEV R4 scenario); expiry filter by client clock with `vi.setSystemTime` — expired-at-or-before filtered, valid kept, re-checked on each `next()` so a mid-session expiry drops out (SEV R2 scenarios); displayed order equals manifest array order — no re-sort (SEV R3 scenario); `src/registration.test.ts`: module import without `window` registers nothing; `defineStoriesViewer()` registers explicitly; `/register` entry side-effects only in a browser-like env (SEV R6 client-only scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/stories-viewer.ts` (Lit `<stories-viewer manifest-url="…">` core: load → parse → filter → hold), `src/manifest-loader.ts`, `src/registration.ts`, `src/index.ts`, `src/register.ts`. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Malformed payload → warning + empty render; poster present/absent surfaced to the render model; refetch on attribute change. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Split parse/filter into a pure module consumed by the element (kept SSR-free by construction). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SEV R2/R3/R4 + R6 (client-only) scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 14 — `@stories/stories-embed`: viewer UX + distribution builds

| | |
| --- | --- |
| Package | `packages/stories-embed` (extends; build: Vite library + IIFE) |
| Specs | SEV R1 (full-screen tap-through viewer), R5 (visibility refresh), R6 (npm ESM + prebuilt IIFE ≤50 KB gzipped, primary path); Q1/D7/R11 |
| Depends on | PR 13 · Branch → PR 13 branch |
| Bounds | Start: headless element · Finish: interactive viewer shipping as npm + single-file script · Verify: `pnpm --filter @stories/stories-embed test && pnpm --filter @stories/stories-embed build` · Rollback: revert branch |

- [ ] **RED** Write `src/viewer-ux.test.ts` (jsdom): per-story progress bars; prev/next via tap zones and arrow keys; pause on pointer-hold; photo renders, video renders with `posterUrl` and media-only fallback when absent (SEV R1 scenarios); `src/refresh.test.ts`: re-fetch when the tab becomes visible if last fetch >60 s, no re-fetch under 60 s (SEV R5 scenarios); `src/bundle-size.test.ts` (runs post-build): `dist/stories-viewer.iife.js` exists and gzipped size ≤50 KB. All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement the viewer template/styles (full-screen, zero external assets), `vite.config.ts` dual build (ESM `dist/index.js` + types; IIFE `dist/stories-viewer.iife.js` with Lit + Zod + styles inlined), `/register` side-effect entry in the npm build. Tests + build pass; size budget met. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Story expiring mid-session skipped on next navigation (UI level); keyboard focus handling; `posterUrl` absent → no error and no broken image. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Deduplicate progress-bar timing logic; assert no SSR code path in the bundle (string scan test). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Tests + build green; SEV R1/R5/R6 scenarios pass; IIFE ≤50 KB gzipped; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 15 — Demos (Astro/Next) + Playwright smokes + PC-off scenario

| | |
| --- | --- |
| Packages | `apps/demo-astro` (new), `apps/demo-next` (new), `e2e/` (Playwright specs + config) |
| Specs | SEV R7 (demo integrations), MP R6 (served-header integration assert), MP R7 (provider-only host proof), EMC R4 e2e half; AC1/AC9/AC10 Tier 1; D2 end-to-end CORS proof |
| Depends on | PR 14 · Branch → PR 14 branch |
| Bounds | Start: no consumer site exists · Finish: smokes prove script-tag + both frameworks + PC-off · Verify: `pnpm e2e` · Rollback: revert branch; demos have no downstream dependents |

- [ ] **RED/STRUCTURE** Scaffold `apps/demo-astro` (static page: `<script defer src="…/stories-viewer.iife.js">` + `<stories-viewer manifest-url>`) and `apps/demo-next` (`dynamic(() => import('@stories/stories-embed/register'), { ssr: false })`); add `e2e/helpers/simulator-adapter.ts` (contract-backed adapter writing into the provider simulator) and `playwright.config.ts` web-server orchestration: provider simulator + local-api (wired to it) + both demos. Write `e2e/smoke.spec.ts`: plain HTML page + both demos render photo and video, viewer opens and navigates (SEV R7 scenarios); published manifest served by the simulator carries `Cache-Control: public, max-age=60` (MP R6 integration assert). Specs fail before demos exist. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Make the smokes pass: demos build and render against the simulator manifest. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **RED→GREEN (PC-off)** Add `e2e/pc-off.spec.ts`: publish via the API → **stop local-api** → load a demo → site still lists and renders published non-expired stories from the provider (simulator) alone (AC10 / MP R7 / SEV R7 PC-off scenario). Spec fails until orchestration stops the API correctly; then passes. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Smokes assert video playback starts and navigation reaches both stories in each framework (AC9). <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** `pnpm e2e` green; SEV R7 + MP R6/R7 + AC9/AC10 Tier-1 proofs recorded in `verify.md`; diff ≤400 lines (generated lockfiles excluded from the count per one honest-slicing note if needed); record evidence. <!-- sdd-owner: implementation -->

### PR 16 — `@stories/panel`: app shell + projects + connection/CORS UI

| | |
| --- | --- |
| Package | `packages/panel` (new; React + Vite; dev proxy `/api` → loopback per D6) |
| Specs | PM R4 (browser probes on the panel's real origin), PM R1 UI, PM R2 UI surfacing; AC8 UI half |
| Depends on | PR 9 (endpoints) · Branch → PR 15 branch |
| Bounds | Start: no panel · Finish: operator manages projects and runs the two-context connection test · Verify: `pnpm --filter @stories/panel test` · Rollback: revert branch |

- [ ] **RED** Write `src/lib/connection-probe.test.ts` (browser probes: plain `fetch(publicManifestUrl)` + ranged `fetch(mediaUrl, { headers: { Range: 'bytes=0-1023' } })`; rejected fetch + passing node probe ⇒ diagnosis `cors`; range failure ⇒ video-seeking diagnosis) and `src/pages/projects.test.ts` (create/edit forms with validation errors surfaced; list shows non-secret fields only; delete confirms and cascades; connection-test flow: call node probe → run browser probes → POST `cors-check` → render stored diagnosis + per-provider remediation steps on failure). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement the app shell + routes, `src/api-client.ts` (typed, loopback same-origin via Vite proxy), `src/pages/projects/*`, `src/lib/connection-probe.ts`, remediation rendering. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Form blocks submission on invalid expiry/credentials shapes; diagnosis `network`/`auth` renders non-CORS remediation; credentials never displayed or present in client state (AC8). <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Extract shared form-field components. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; PM R4 browser-side scenarios pass in jsdom (real-origin confirmation is Tier 2); diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 17 — `@stories/panel`: story editor (upload, limits, poster capture)

| | |
| --- | --- |
| Package | `packages/panel` (extends) |
| Specs | SL R1 UI, R2 (limit surfaced + pre-check), R3 (window errors as UI errors), R6 (non-blocking poster capture); Q4; R5 UI |
| Depends on | PR 16 · Branch → PR 16 branch |
| Bounds | Start: projects without stories UI · Finish: operator uploads photo/video with poster + limits enforced client-side · Verify: `pnpm --filter @stories/panel test` · Rollback: revert branch |

- [ ] **RED** Write `src/lib/poster-capture.test.ts` (object-URL `<video>` mocked: seek target `min(0.1s, duration / 2)`; canvas capped at 720 px long edge; JPEG quality 0.8; capture failure or 3 s timeout omits the poster part and submission proceeds — SL R6 scenarios) and `src/pages/story-editor.test.ts` (file pre-check blocks submission over `STORIES_MAX_UPLOAD_MB` and shows the current limit — SL R2 scenario; expiry-window API errors mapped to visible UI errors naming the 24 h–30 d rule — SL R3/AC7; submit builds multipart with type/expiresAt/position/durationSeconds + optional poster). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/pages/story-editor/*` and `src/lib/poster-capture.ts` (non-blocking: capture runs concurrently with input; never gates publish). Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Capture timeout race (resolve after submit started) leaves the story intact without poster; oversized selection after a valid one re-blocks; position field editable. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Share the limit constant source (API-provided config) instead of duplicating 200 MB. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Suite green; SL R2/R3/R6 UI scenarios pass; diff ≤400 lines; record evidence. <!-- sdd-owner: implementation -->

### PR 18 — `@stories/panel`: publish/rollback + cleanup status + residual-window docs

| | |
| --- | --- |
| Package | `packages/panel` (extends) |
| Specs | MP R5 UI (rollback), EMC R3 (status/report view), EMC R4 (residual window documented to the operator); AC3/AC5 surfacing |
| Depends on | PR 17 · Branch → PR 17 branch · **Final PR: integration lands on `main`** |
| Bounds | Start: publication/cleanup API-only · Finish: full operator loop closed; change done pending Tier 2 · Verify: `pnpm --filter @stories/panel test && pnpm e2e` · Rollback: revert branch |

- [ ] **RED** Write `src/pages/publish.test.ts` (publish button triggers `POST /publish`; success surfaces the manifest URL; failure surfaces the typed error code/detail — AC3; history list renders results; rollback action republishes with confirmation) and `src/pages/cleanup.test.ts` (cleanup status view renders the latest `CleanupReport` counts and per-story errors — AC5/EMC R3; manual cleanup button; help surface states that expired media may remain reachable by direct URL until the next successful run — EMC R4 operator-visibility scenario). All fail. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **GREEN** Implement `src/pages/publish/*` and `src/pages/cleanup/*` including the residual-window help text. Tests pass. Record evidence. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE** Failed publish leaves the previous manifest notice shown; report with zero expired stories renders an empty state; rollback disabled without a successful history row. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR** Share result/error banner components with PR 16/17 pages. <!-- sdd-owner: implementation -->
- [ ] **Verify & bounds** Panel suite + full `pnpm e2e` green (whole chain integrated); EMC R4 + MP R5 UI scenarios pass; diff ≤400 lines; record evidence; flag the change ready for the apply-phase Tier 2 list below. <!-- sdd-owner: implementation -->

---

## Acceptance-criteria coverage map

| AC (proposal) | Tier 1 proof (PRs) | Tier 2 (apply) |
| --- | --- | --- |
| 1 · Photo publishes; manifest + media serve with panel off | 6, 10, 15 | PC-off run on real bucket |
| 2 · 24 h story expires remotely + client-side | 4/5 (sweep), 6 (generation), 13 (embed filter) | Post-expiry manifest re-fetch on real bucket |
| 3 · Failed verification aborts; previous manifest serves | 6, 11 | — |
| 4 · Short-TTL cache policy asserted | 2 (capture), 3 (simulator mirror), 6 (60 s requested), 15 (served header) | `curl -I` on real manifest URL |
| 5 · Cleanup per-story; failures don't break the job | 7, 12 | Expired objects disappear on real bucket |
| 6 · Adapter passes contract suite; no Supabase types outside | 2, 3 | Live contract profile with operator credentials |
| 7 · Expiry outside 24 h–30 d rejected | 5, 10, 17 | — |
| 8 · Credentials never in responses nor repo | 8, 9, 16 | — |
| 9 · Embed renders in plain HTML + Astro + Next | 13, 14, 15 | — |
| 10 · Panel offline end-to-end | 15 | PC-off run on real bucket |

## Apply-phase Tier 2 verification (D10; record all evidence in `verify.md`)

These run once the chain is integrated, against the operator's real Supabase
project, using the steps documented in `spike-findings.md`:

- [ ] Run the env-gated live contract profile (`STORIES_E2E_SUPABASE_*`) — MSA R4 live scenario, AC6. <!-- sdd-owner: implementation -->
- [ ] Execute the PC-off scenario end-to-end against the real bucket: publish → stop local-api → demo site renders (AC1, AC10, MP R7). <!-- sdd-owner: implementation -->
- [ ] `curl -I` the real manifest URL and assert `Cache-Control: public, max-age=60` (AC4, MP R6). <!-- sdd-owner: implementation -->
- [ ] Confirm hosted CORS from a real site origin: plain GET + ranged video request (Spike B open item; PM R4). <!-- sdd-owner: implementation -->
- [ ] After a story's `expiresAt` passes, re-fetch the real manifest and confirm exclusion (AC2 live half). <!-- sdd-owner: implementation -->

## Review Workload Forecast

| PR | Slice | Est. changed lines |
| --- | --- | --- |
| 1 | `manifest-schema` package | 180–230 |
| 2 | Adapter contract + fake + suite + boundary | 320–380 |
| 3 | Supabase adapter + provider simulator | 220–280 |
| 4 | Core data model + `expireStories` | 220–280 |
| 5 | Core story domain service | 250–310 |
| 6 | Core publication + history/rollback | 340–400 |
| 7 | Core cleanup service | 240–300 |
| 8 | local-api security backbone + secret scan | 300–360 |
| 9 | local-api projects + connection test | 340–400 |
| 10 | local-api streaming story endpoints | 300–360 |
| 11 | local-api publication endpoints | 150–200 |
| 12 | local-api cleanup endpoints + triggers | 140–190 |
| 13 | Embed viewer core | 290–350 |
| 14 | Embed UX + ESM/IIFE builds | 320–390 |
| 15 | Demos + Playwright smokes + PC-off | 280–340 |
| 16 | Panel shell + projects + connection UI | 320–390 |
| 17 | Panel story editor + poster capture | 300–370 |
| 18 | Panel publish/rollback + cleanup UI + docs | 260–320 |
| **Total** | **18 stacked PRs** | **≈4,800–5,900** |

Per-PR `400-line budget risk`: **Low** — every slice is sized ≤400 estimated
lines and each PR carries a measured `git diff --stat` guard before opening
(one honest split pass if exceeded; never shrink diffs to fit).

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

Chain diagram (each PR targets its predecessor's branch; predecessors merge to
`main` in order; PR 18 is the final integration):

```text
main ─▶ PR1 ─▶ PR2 ─▶ PR3 ─▶ PR4 ─▶ PR5 ─▶ PR6 ─▶ PR7 ─▶ PR8 ─▶ PR9 ─▶ PR10
     ─▶ PR11 ─▶ PR12 ─▶ PR13 ─▶ PR14 ─▶ PR15 ─▶ PR16 ─▶ PR17 ─▶ PR18 ─▶ main
```
