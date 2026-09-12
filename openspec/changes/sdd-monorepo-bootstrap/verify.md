# Verify — `sdd-monorepo-bootstrap`

Evidence for the tooling bootstrap. Environment: Node v24.18.0, pnpm 11.3.0
(matching `packageManager`), Linux x64. All technical artifacts in English.

## TDD Cycle Evidence

| Unit | Cycle | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- | --- |
| T1 | RED | `npx vitest run` (no manifest/config yet) | suite fails, module-not-found for missing helper | `Error: Cannot find module './helpers/version.js'` — Test Files: 1 failed (1) | RED confirmed for the right reason |
| T1 | GREEN | `pnpm test` | Vitest runs, smoke test passes | `Test Files 1 passed (1)` / `Tests 1 passed (1)` | GREEN |
| T1 | REFACTOR | — | n/a | No duplication to remove (6-line test + 5-line helper); no changes made | stated |
| T2 | RED (strictness probe) | `pnpm typecheck` with temporary unsafe sample | strict-mode errors, exit 1 | `TS7006` implicit any ×2 (`strict`) + `TS2532` object possibly undefined (`noUncheckedIndexedAccess`), exit 1 | strict proven |
| T2 | GREEN | `pnpm typecheck` (sample deleted) | clean, exit 0 | exit 0 | clean |

The temporary sample `tests/__unsafe-strict-sample.tmp.ts` was deleted in the
same work unit; `tests/` contains only `smoke.test.ts` and `helpers/`.

## Command evidence

### RED (T1, before any config existed)

```text
$ npx vitest run
 RUN  v5.0.0
 ❯ tests/smoke.test.ts (0 test)
 FAIL  tests/smoke.test.ts [ tests/smoke.test.ts ]
Error: Cannot find module './helpers/version.js' imported from
  /home/daryhen/Documents/proyects/stories/tests/smoke.test.ts
 Test Files  1 failed (1)
```

### GREEN (T1, after package.json + pnpm-workspace.yaml + vitest.config.ts + helper)

```text
$ pnpm test
 RUN  v5.0.0
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Typecheck (T2)

```text
$ pnpm typecheck            # clean scaffold
$ tsc -p tsconfig.base.json
(exit 0)

$ pnpm typecheck            # with temporary unsafe sample
tests/__unsafe-strict-sample.tmp.ts(2,21): error TS7006: Parameter 'a' implicitly has an 'any' type.
tests/__unsafe-strict-sample.tmp.ts(2,24): error TS7006: Parameter 'b' implicitly has an 'any' type.
tests/__unsafe-strict-sample.tmp.ts(7,22): error TS2532: Object is possibly 'undefined'.
(exit 1)
```

### Lint & format (T3)

```text
$ pnpm lint
$ eslint .
(exit 0, zero errors)

$ pnpm format && pnpm format:check
All matched files use Prettier code style!
(exit 0 — second pass made no changes: idempotent)
```

### gitignore (T4)

Dummy files created for every pattern (`dist/`, `playwright-report/`,
`test-results/`, `node_modules/`, `.env`, `.env.local`, `*.db`, `*.sqlite3`):
`git status --porcelain` listed none of them. Dummies deleted afterwards.

### Playwright placeholder (T5)

```text
$ pnpm exec playwright --version
Version 1.63.0   (exit 0)

$ pnpm exec playwright test --list
Listing tests: Total: 0 tests in 0 files
(exit 1 — "No tests found" is the expected result for an empty testDir; the
config parsed successfully, no webServer declared)
```

No browsers were downloaded by this change: `~/.cache/ms-playwright/` contents
predate this session (2026-09-11 23:14, machine cache) and no
`playwright install` was executed. Browser installation belongs to the stories
change (PR 15).

### Final suite

```text
pnpm test         → Test Files 1 passed (1), Tests 1 passed (1)
pnpm typecheck    → exit 0
pnpm lint         → exit 0
pnpm format:check → All matched files use Prettier code style!
```

## Deviations and findings

- **TypeScript pinned to `^6` (6.0.3) instead of 7.0.2**: `typescript-eslint`
  8.70 does not support the TS 7 API yet (hard error at lint time: "typescript-
  eslint does not support TS 7.0"). Design B2 requires strict flags, not a TS
  major; all B2 flags verified working under 6.0.3. Upgrade path documented in
  typescript-eslint#10940.
- **Vitest 5 config shape**: `include` lives under `test.include`, not the
  config root — caught by the new strict typecheck (TS2769) and fixed.
- **Workspace-root installs**: pnpm 11 requires `-w` for root devDependencies
  (`ERR_PNPM_ADDING_TO_ROOT`); all installs used `pnpm add -Dw`.
- **Generated artifacts ignored**: Vitest 5 writes `.vitest/json/output.json`;
  added `.vitest/`, `coverage/`, `*.sqlite3` to `.gitignore`/`.prettierignore`
  alongside the spec-required patterns.

## Acceptance criteria (proposal)

- [x] `pnpm install` succeeds from a clean clone (workspace globs `packages/*`, `apps/*`).
- [x] `pnpm test` runs Vitest and the smoke test passes, with recorded RED step before config existed.
- [x] `pnpm typecheck` (tsc over `tsconfig.base.json`) passes; strict rejection proven with temporary sample.
- [x] `pnpm lint` passes with zero errors.
- [x] Workspace globs resolve: `packages/*` and `apps/*` recognized; adding product packages requires no root change.
