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
