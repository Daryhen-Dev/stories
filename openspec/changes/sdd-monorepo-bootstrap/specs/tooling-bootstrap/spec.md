# Delta for tooling-bootstrap

```text
## ADDED Requirements

### Requirement: pnpm workspace scaffold
The repository root SHALL provide a private `package.json` with a pinned
`packageManager` and a `pnpm-workspace.yaml` whose globs include `packages/*`
and `apps/*`, so later product packages require no root changes.

#### Scenario: Workspace resolves product globs
- **WHEN** `pnpm install` runs from a clean clone
- **THEN** the install succeeds and both `packages/*` and `apps/*` are recognized workspace globs

### Requirement: Strict TypeScript baseline
The workspace SHALL provide `tsconfig.base.json` with `strict: true` and a root
`typecheck` script that type-checks against it.

#### Scenario: Unsafe code is rejected
- **WHEN** a sample file contains implicit-`any` unsafe code and `pnpm typecheck` runs
- **THEN** the check fails with a strict-mode error (evidence captured with a temporary sample that is removed afterwards)

### Requirement: Strict TDD loop available
The workspace SHALL provide Vitest via a root test script and a smoke test that
proves the loop runs; the first recorded run of the loop MUST be a RED step
(failing for the expected reason) followed by GREEN.

#### Scenario: Smoke test proves the loop
- **WHEN** `pnpm test` runs after the RED evidence is recorded
- **THEN** Vitest executes and the smoke test passes

### Requirement: Lint and format wired
The workspace SHALL provide ESLint (flat config) and Prettier with `lint` and
`format` root scripts.

#### Scenario: Lint passes clean
- **WHEN** `pnpm lint` runs on the scaffold
- **THEN** it exits zero with no errors

### Requirement: Runtime artifacts ignored
`.gitignore` SHALL cover `node_modules/`, `dist/`, `.env*`, local SQLite files
(`*.db`, `*.sqlite*`), `playwright-report/`, and `test-results/`.

#### Scenario: Generated files stay invisible to git
- **WHEN** files matching those patterns exist
- **THEN** `git status --porcelain` does not list them

### Requirement: Playwright config placeholder
The workspace SHALL include Playwright as a dev-dependency with a minimal
`playwright.config.ts`, without downloading browsers or adding specs.

#### Scenario: Config parses without browsers
- **WHEN** the Playwright CLI version command runs
- **THEN** it reports the version without requiring a browser download
```
