# Apply Progress — `sdd-monorepo-bootstrap`

Cumulative log. No previous progress file existed; this is the initial entry.

## Structured status consumed

- `gentle-pi.sdd-status@2`, store: openspec, apply: ready (change selected by operator after
  ambiguity between `add-embeddable-stories-system` and `sdd-monorepo-bootstrap`).
- actionContext: repo-local, workspaceRoot `/home/daryhen/Documents/proyects/stories`,
  allowedEditRoots = workspace root. No warnings.
- Strict TDD active (runner `pnpm test`, Vitest). Review Workload Forecast guard lines were
  absent from tasks.md; proposal estimates well under the 400-line budget, delivery strategy
  `ask-on-risk` with no budget risk raised — proceeded without a delivery decision.

## Completed work units

- [x] T1 — RED → GREEN: `tests/smoke.test.ts` importing missing
      `tests/helpers/version.js` failed with `Cannot find module` (right reason,
      captured via `npx vitest run` before any config existed); GREEN after
      `package.json` (private, `packageManager: pnpm@11.3.0`, type module) +
      `pnpm-workspace.yaml` (`packages/*`, `apps/*`) + `vitest.config.ts`
      (B3 globs under `test.include`) + helper. `pnpm test` → 1 passed.
      REFACTOR: none needed (stated in verify.md).
- [x] T2 — `tsconfig.base.json` (B2 flags) + `typecheck` script. Strictness
      proven with temporary unsafe sample: TS7006 ×2 + TS2532 → exit 1; sample
      deleted in-unit; clean exit 0.
- [x] T3 — ESLint flat config (`@eslint/js` + typescript-eslint recommended +
      eslint-config-prettier, B4) + Prettier + `lint`/`format`/`format:check`
      scripts. `pnpm lint` exit 0; format idempotency proven.
- [x] T4 — `.gitignore` extended (node_modules, dist, .env*, *.db/*.sqlite*,
      coverage/, .vitest/, playwright-report/, test-results/). Proof: dummy
      files for every pattern invisible to `git status --porcelain`.
- [x] T5 — `@playwright/test` 1.63.0 dev-dependency + minimal
      `playwright.config.ts` (`testDir: ./tests/e2e`, empty, no webServer) +
      `tests/e2e/.gitkeep`. Config parses (`test --list`: 0 tests, expected).
      No browsers downloaded by this change.
- [x] T6 — `verify.md` written with full RED/GREEN/typecheck/lint evidence;
      `openspec/config.yaml` tdd.runner/e2e_runner comments updated from
      "planned" to installed.

## Files changed (new, except noted)

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (new)
- `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js` (new)
- `.prettierrc.json`, `.prettierignore`, `playwright.config.ts` (new)
- `.gitignore` (extended)
- `tests/smoke.test.ts`, `tests/helpers/version.ts`, `tests/e2e/.gitkeep` (new)
- `openspec/changes/sdd-monorepo-bootstrap/verify.md`, `apply-progress.md` (new)
- `openspec/changes/sdd-monorepo-bootstrap/tasks.md` (checkboxes)
- `openspec/config.yaml` (tdd.runner/e2e_runner comments only)

## Test commands run

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm format:check`,
`pnpm exec playwright --version`, `pnpm exec playwright test --list`,
`npx vitest run` (RED evidence, pre-manifest). All final runs green.

## TDD evidence

Full cycle table and raw output in `verify.md`. RED captured before any
config/helper existed; T2 strictness RED via temporary unsafe sample (deleted
in-unit).

## Deviations from design

- TypeScript pinned to `^6` (6.0.3), not 7.x: typescript-eslint 8.70 rejects
  TS 7 (hard lint failure). B2 flags unchanged and verified.
- `.gitignore`/`.prettierignore` include `coverage/`, `.vitest/`, `*.sqlite3`
  beyond the spec minimum — generated-artifact hygiene discovered at runtime.

## Remaining tasks

None — T1–T6 all complete. No unchecked `- [ ]` implementation lines remain in
`tasks.md`.

## Workload / PR boundary

Tooling bootstrap is a single cohesive work unit (workspace scaffold + proof
loop); ~190 authored lines (lockfile excluded, machine-generated). Well under
the 400-line budget. No product code, no `@stories/*` packages, other change
(`add-embeddable-stories-system`) untouched.
