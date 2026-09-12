# Tasks — `sdd-monorepo-bootstrap`

Tooling-only work units. Strict TDD applies to the proof test (RED → GREEN);
the remaining items are config with runnable exit criteria. Record evidence in
this change's `verify.md`.

## Work units

- [x] T1 — RED: create `tests/smoke.test.ts` asserting `true === true` via a tiny `src-version` helper import that does not exist yet; run `pnpm vitest run` and capture the expected module-not-found failure. GREEN: add root `package.json` + `pnpm-workspace.yaml` + minimal `vitest.config.ts` + the missing helper until the test passes. Exit: `pnpm test` green with the RED output recorded.
- [x] T2 — Add `tsconfig.base.json` (strict) and a root `typecheck` script; exit: `pnpm typecheck` passes with `strict: true` verified against an intentionally unsafe sample file that must fail (temporary, deleted after evidence).
- [x] T3 — Add ESLint flat config + Prettier + scripts; exit: `pnpm lint` passes and formats a sample file idempotently.
- [x] T4 — Extend `.gitignore` (node_modules, dist, .env*, *.db/*.sqlite*, playwright-report/, test-results/); exit: `git status --porcelain` shows none of those patterns.
- [x] T5 — Add Playwright dev-dependency + empty `playwright.config.ts` (no browsers download, no specs); exit: config file parses via `npx playwright --version` without running browsers.
- [x] T6 — Write `verify.md` evidence block (commands + outputs for RED/GREEN/typecheck/lint) and update `openspec/config.yaml` tdd.runner comment from "planned" to installed. Exit: docs match reality.
