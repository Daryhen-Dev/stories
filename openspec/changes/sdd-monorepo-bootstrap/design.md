# Design — `sdd-monorepo-bootstrap`

Tooling decisions for the workspace scaffold. Product architecture lives in
`add-embeddable-stories-system/design.md` and is not repeated here.

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| B1 | pnpm `packageManager` pinned to the installed 11.3.0 | Reproducible installs; pnpm is the operator-chosen package manager. |
| B2 | `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: NodeNext`-compatible settings, `isolatedModules` | Matches "TypeScript strict" contract; product packages extend the base and may only tighten. |
| B3 | Vitest at the root with a single `vitest.config.ts` (`include: ["packages/**/tests/**/*.test.ts", "packages/**/*.test.ts", "tests/**/*.test.ts", "apps/**/*.test.ts"]`) | One runner process for the whole workspace; projects can add per-package configs later without changing the root. |
| B4 | ESLint flat config with typescript-eslint recommended + Prettier via `eslint-config-prettier` (no formatting rules in ESLint) | Minimal, modern, zero overlap between lint and format. |
| B5 | Playwright: dev-dependency + `playwright.config.ts` with empty `testDir` and no `webServer`; browsers NOT downloaded | The stories change (PR 15) owns e2e; this change only proves the config parses, keeping the diff small. |
| B6 | Smoke test lives in `tests/smoke.test.ts` importing `tests/helpers/version.ts` | Proves the RED→GREEN loop and the include globs without creating product packages. |
| B7 | No CI, no Docker, no editor settings | Out of scope per proposal non-goals. |

## TDD mapping

- T1 is the only behavior-bearing unit: RED (helper missing → Vitest fails with
  module-not-found) → GREEN (helper + configs added) → REFACTOR (nothing
  expected; state that explicitly).
- T2's strictness proof uses a temporary unsafe sample file; evidence recorded,
  file deleted in the same unit.
- T3–T6 are config/doc units with runnable exit criteria (see tasks.md).

## Risks

- Version drift of dev-dependencies over time — mitigated by the lockfile
  committed at PR-open time.
- Playwright download weight if someone runs `npx playwright install` early —
  documented as intentionally deferred.
