# Project Context — stories

`stories` is a local-first tool that lets one operator publish and manage the
public stories of several projects/sites from a single admin panel on their own
PC. Managed sites (Astro or Next.js) stay thin: they only consume media and a
remote manifest, so editorial control remains with the operator.

Status: SDD context initialized on an empty repository (2026-09-12). Nothing is
implemented yet; this file is the shared context every future change builds on.

## Quick path

1. Read `openspec/config.yaml` for the SDD contract, phase rules, and testing setup.
2. Start any new work as an OpenSpec change under `openspec/changes/<change-id>/`.
3. First change should bootstrap the pnpm monorepo + Vitest, proving strict TDD works.

## Product shape

| Concern | Decision |
| --------- | ---------- |
| User | Single operator; the panel runs locally on their PC. |
| Admin panel | React + Vite app backed by a Node/Fastify local API. |
| Local storage | SQLite via Drizzle ORM; data never leaves the machine by default. |
| Managed projects | Each one carries its own Supabase or InsForge credentials. |
| Consuming sites | Astro or Next.js; they fetch media and a remote manifest. |
| Embed | A Lit Web Component renders stories inside the consuming sites. |
| Remote publishing | The local API exposes the manifest/media that sites consume. |

## Recommended stack

pnpm monorepo · TypeScript (strict) · React/Vite · Node/Fastify · SQLite/Drizzle ·
Zod · Lit Web Component · Vitest (unit) · Playwright (e2e).

The repository is empty, so this stack is a recommendation recorded at init
time, not a verified fact. The first work package should confirm or amend it.

## How SDD runs here

- Strict TDD is on (RED → GREEN → TRIANGULATE → REFACTOR) once Vitest exists;
  until then acceptance criteria live in specs and tasks.
- Review budget: 400 changed lines. `ask-on-risk` pauses for a delivery decision
  (chain vs. single PR) whenever a change would exceed it.
- Phase flow per change: proposal → delta specs → design (if risky) → tasks →
  apply (tracked in tasks.md) → verify (with test evidence) → archive.

## Constraints and open questions

Constraints (treat as fixed unless a proposal revises them):

- Local-first: panel and SQLite data stay on the operator's machine.
- Credentials for Supabase/InsForge are per-project and must never be committed.
- Consuming sites depend only on the remote manifest and media URLs.

Open questions for the first proposal (not decided at init):

- Manifest schema and versioning strategy.
- How sites authenticate against the local/remote API (public read vs. token).
- Adapter interface differences between Supabase and InsForge.
- Deployment story for the remote manifest endpoint (hosting, availability).

## Next step

Create the first change proposal: `sdd-monorepo-bootstrap` (workspace setup,
Vitest/Playwright install, CI-runnable test, and a first failing-then-passing
test to establish the strict TDD loop).
