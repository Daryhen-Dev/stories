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
