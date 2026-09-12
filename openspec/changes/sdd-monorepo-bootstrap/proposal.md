# Proposal — `sdd-monorepo-bootstrap`

Prerequisite tooling change for `add-embeddable-stories-system`: create the
pnpm workspace and strict-TDD loop that every product PR consumes. This change
adds **no product behavior**; it exists so strict TDD is provably running
before PR 1 of the stories change.

## Problem

The repository is empty (zero commits, no `package.json`). The stories change
assumes a working pnpm workspace, TypeScript strict config, and Vitest from its
first task (`openspec/config.yaml` marks the runners "planned"; strict TDD is
non-negotiable per the SDD contract).

## Objective

A contributor can run `pnpm install && pnpm test` and see one passing test,
with TypeScript strict mode active and lint/format wired. Exit criterion: the
smoke test first fails for the right reason (RED, no config), then passes
(GREEN) — recorded as TDD evidence in the change's `verify.md`.

## Scope

- Root `package.json` (private, pnpm `packageManager` pinned) + `pnpm-workspace.yaml` (`packages/*`, `apps/*`).
- `tsconfig.base.json`: `strict: true`, NodeNext-style module settings, strictest practical flags.
- Vitest at the workspace root (`vitest.config.ts`) + one smoke test asserting the loop runs (e.g., `tests/smoke.test.ts`).
- ESLint (flat config, TS) + Prettier, minimal, matching `openspec/config.yaml` quality intent.
- `.gitignore` additions: `node_modules/`, `dist/`, `.env*`, local SQLite files (`*.db`, `*.sqlite*`), `playwright-report/`, `test-results/`.
- Playwright **dependency + empty config only**; browser download and specs belong to the stories change (PR 15) to keep this change small.

## Non-goals

- Any product package (`@stories/*`), CI, Docker, or editor config beyond basics.
- Playwright browsers install or e2e specs.
- Decisions owned by the stories design (D1–D10).

## Impact

New files only (~8 root files), well under the 400-line budget. No runtime
behavior exists to break. Rollback: delete the files.

## Acceptance criteria

- [ ] `pnpm install` succeeds from a clean clone.
- [ ] `pnpm test` runs Vitest and the smoke test passes (with a recorded RED step before config existed).
- [ ] `pnpm typecheck` (tsc over the base config) passes.
- [ ] `pnpm lint` passes with zero errors.
- [ ] Workspace globs resolve: adding `packages/*` later requires no root change.
