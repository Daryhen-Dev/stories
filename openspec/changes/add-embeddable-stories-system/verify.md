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
