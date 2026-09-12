# Exploration — `add-embeddable-stories-system`

Pre-proposal discovery for the first product change of `stories`: a local-first
panel that publishes Instagram-style stories (photo/video, 24 h–30 d expiry) to
per-project public manifests hosted on Supabase or InsForge, consumed by
Astro/Next.js sites through a Lit web component. This document feeds the
proposal and delta specs; it decides nothing final by itself.

## Quick path

1. Read **Locked decisions** — macro choices are already validated with the operator.
2. Read **Core insight** — the PC-off and expiry guarantees drive the architecture.
3. Review **Candidate capabilities**, **Risks**, and **Open questions** — the proposal resolves the latter.

## Locked decisions (not reopened here)

| Area | Decision |
| --- | --- |
| Workspace | pnpm monorepo, TypeScript strict |
| Admin | React + Vite panel on the operator's PC; single operator, no deploy |
| Local API | Node + Fastify bound to loopback |
| Local storage | SQLite via Drizzle ORM, Zod validation everywhere |
| Embed | Lit web component consumed by Astro and Next.js sites |
| Providers | Per-project credentials; Supabase first, InsForge later via adapters with a common contract |
| Publishing | Atomic: upload media → verify → replace public `stories.json` |
| Expiry | Configurable 24 h–30 d; expired stories stop rendering even with the PC off |
| Manifest | `stories.json` per project with public read |

Out of scope for the MVP: end-user accounts/roles, comments/reactions/metrics,
media editing or transcoding, private buckets with signed URLs, multi-PC sync,
admin deployment, mobile, Tauri installer.

## Core insight

Three guarantees shape the whole architecture:

1. **PC-off availability.** Sites must render stories while the operator's PC is
   off, so the manifest and media must live in the provider's public storage.
   The local API only *publishes* there; it never serves production traffic.
   This also resolves the open "manifest endpoint deployment" question from
   init: the provider is the host.
2. **PC-off expiry.** Expired stories must disappear without any local process
   running. Expiry is data-driven: `expiresAt` (UTC) travels in the manifest,
   manifest generation excludes already-expired stories, and the embed re-checks
   `expiresAt` against the viewer's clock (defense in depth). Manifest cache
   headers must be short (e.g., `max-age ≤ 60s`) so freshness propagates
   quickly; media can be cached long.
3. **Cleanup is best-effort, not correctness.** Deleting expired media keeps
   storage bounded and shrinks the window in which expired files remain
   reachable by direct public URL. Availability and expiry never depend on
   cleanup running.

## Candidate capabilities for delta specs

| # | Capability | Scope summary |
| --- | --- | --- |
| 1 | `project-management` | Local CRUD for projects and their per-provider credentials (Supabase now, InsForge later), connection test, secrets persisted in SQLite only, redacted in API responses, never committed. |
| 2 | `media-storage-adapters` | Provider-agnostic adapter contract: `upload`, `verify` (HEAD size/content-type), `publicUrl`, `delete`, public-read and CORS check. Supabase as reference implementation; contract tests belong to the contract, not to Supabase. |
| 3 | `story-lifecycle` | Create/update/remove stories per project; photo or video; expiry validated to the 24 h–30 d window; SQLite is the local source of truth; explicit status model (draft?, published, expired, cleaned). |
| 4 | `manifest-publication` | Zod-defined `stories.json` schema (versioned), generation excluding expired stories, atomic single-object replace with verification, publish history for rollback, cache-header policy. |
| 5 | `stories-embed-viewer` | Lit component: full-screen tap-through viewer (progress bars, prev/next), photo + video, client-side expiry filter, config by manifest URL, consumable via script tag and npm package; demo pages for Astro and Next.js. |
| 6 | `expired-media-cleanup` | Panel-side job (on startup + periodic) that deletes provider media for expired stories and updates local status; failures reported, never blocking correctness. |

The proposal may merge or split these; the Fastify loopback API is treated as
the backbone across capabilities 1, 3, 4, and 6 rather than its own delta.

## Manifest schema sketch (candidate, not final)

```jsonc
{
  "version": 1,
  "projectId": "…",
  "generatedAt": "2026-01-01T12:00:00Z",
  "stories": [
    {
      "id": "…",
      "type": "photo" | "video",
      "mediaUrl": "https://…",
      "posterUrl": "https://…",        // videos only; optional
      "createdAt": "…",
      "expiresAt": "…",                // UTC; drives embed-side filtering
      "position": 3                    // operator-controlled ordering (open question Q3)
    }
  ]
}
```

Design rules to carry into the spec: schema is versioned from day one
(`version` field, additive changes only within a version); every timestamp is
UTC ISO-8601; the manifest contains no secrets and no provider-internal IDs
beyond public URLs.

## Publication flow (candidate)

1. Upload media object via adapter.
2. Verify: object exists, size and content-type match expectations.
3. Build new manifest locally from SQLite, excluding expired stories.
4. Replace `stories.json` with a single PUT (same key) — the atomic step.
5. Verify: fetch public manifest URL, parse with the Zod schema.

Failure properties worth encoding in specs: a crash between steps 1–4 leaves an
orphan media object and the previous (still valid) manifest — harmless and
swept by cleanup; a failed verification at steps 2 or 5 must leave the previous
manifest serving and surface the error in the panel. Object storage replace is
atomic per object, but not transactional across media + manifest — the
ordering above makes that safe.

## Risks

| # | Risk | Impact | Likelihood | Mitigation / note |
| --- | --- | --- | --- | --- |
| R1 | Provider-side TTL/lifecycle deletion may not exist (Supabase storage TTL unverified; InsForge API maturity unknown) | Medium | Medium | Treat cleanup as panel-driven best-effort; verify provider capabilities with a spike before promising automation. |
| R2 | Manifest caching delays expiry visibility (CDN/browser cache serving stale manifest) | Medium | Medium | Short cache TTL policy on `stories.json`; embed-side `expiresAt` filter covers the residual window. |
| R3 | CORS on the public bucket blocks embed fetches from real site domains | High | Medium | Connection test must check (and where possible configure) bucket CORS for GET; document the manual step per provider. |
| R4 | Adapter contract designed against Supabase only fits InsForge poorly | Medium | Medium | Contract tests as first-class spec; forbid Supabase types/SDK leaks outside the adapter package. |
| R5 | Large video uploads through the loopback API (no transcoding allowed) | Medium | Medium | Streaming upload, configurable max size, verify-before-publish; document limits in the panel UI. |
| R6 | Credential leakage (git, logs, API responses) | High | Low | Secrets only in local SQLite/env; redaction in every API response; a repo-wide "no secrets" test; `.gitignore` discipline from bootstrap. |
| R7 | Expired media stays publicly reachable by direct URL until cleanup runs | Medium | Medium | Accepted MVP trade-off; cleanup on panel start + periodic; document the window for the operator. |
| R8 | Viewer clock skew wrongly filters stories in the embed | Low | Low | Defense in depth (manifest already excludes expired); skew only narrows display windows briefly. |
| R9 | Change size vs 400-line review budget: multi-area system, single PR will exceed it | Medium | High | Delivery decision belongs to the proposal phase under `ask-on-risk`; expect chained PRs per capability. |
| R10 | Empty repo: tooling (pnpm workspace, Vitest, Playwright) does not exist yet | High | Certain | Proposal must decide bootstrap sequencing (open question Q5); strict TDD starts only once Vitest lands. |
| R11 | Embed integration pitfalls in Astro/Next.js (SSR attempting to render a client-only component) | Low | Medium | Embed ships as client-only; demo apps and an early Playwright smoke prove integration. |

## Open product questions (few, each with a recommendation)

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | Embed distribution: npm package only, or also a prebuilt single-file script bundle for no-build sites? | Ship both; the prebuilt bundle is the primary path for Astro/Next demos and future plain-HTML sites. |
| Q2 | Publish model: immediate publish only, or drafts with a future "goes live at"? | MVP: publish now + `expiresAt` only; add scheduled starts later if the operator asks. |
| Q3 | Story ordering: strictly chronological, or operator-controlled order/pin? | Operator-controlled `position` with chronological default — cheap in schema, likely wanted. |
| Q4 | Video poster frames without transcoding: client-side first-frame capture at upload, operator-supplied image, or none? | Client-side capture via canvas at upload time, falling back to no poster; never block publish on it. |
| Q5 | Sequencing: is monorepo bootstrap inside this change or a prerequisite change (`sdd-monorepo-bootstrap`)? | Separate prerequisite change (matches `openspec/project.md` next-step note); this change then starts from a working TDD loop. |

## Verifiable acceptance criteria (candidate, capability-level)

- [ ] Given a project with valid Supabase credentials, when the operator uploads a photo and publishes, the project's public manifest URL serves a valid `stories.json` (Zod-valid, correct version) containing that story, and the media URL returns HTTP 200 with the expected content-type — fetched without the panel running.
- [ ] Given a story with a 24 h expiry, when `expiresAt` passes, a freshly fetched manifest excludes it and the embed filters it by client clock (unit test with mocked clock) — with the PC off.
- [ ] Given a failed media verification, publication aborts, the previous manifest keeps serving, and the panel shows the failure.
- [ ] Given a successful publication, the public manifest fetches, parses against the schema, and is cacheable per the short-TTL policy (`Cache-Control` asserted in an integration test).
- [ ] Given expired stories with provider media, when the cleanup job runs, deletion is attempted per story, successes update local status to `cleaned`, and failures are reported without breaking the job.
- [ ] The Supabase adapter passes the shared contract test suite (upload/verify/publicUrl/delete/CORS check) with no Supabase types imported outside the adapter package.
- [ ] Expiry inputs outside 24 h–30 d are rejected by Zod validation and surfaced as UI errors.
- [ ] Saved credentials are never returned in plaintext by any API response and never appear in the repository (repo-wide scan test with a fixture secret).
- [ ] The embed renders photo and video stories in a plain HTML page via script tag, and in Astro and Next.js demo pages (Playwright smoke).
- [ ] With the panel offline end-to-end, a test site still lists and renders published non-expired stories from the provider alone.

## Proposal-phase recommendations

- Resolve Q5 first: bootstrap sequencing determines whether this change's tasks
  start with tooling or with product code.
- Expect the review budget to be exceeded: present the chain/split decision to
  the operator under `ask-on-risk` rather than pre-selecting a chain strategy
  (chain strategy stays deferred per session preflight).
- Carry R1 and R3 into the proposal as explicit spikes (provider capabilities,
  CORS configuration) before the adapter contract spec is finalized.
- Delta specs should own the manifest schema and adapter contract verbatim from
  this document's sketches — they are the two integration seams other packages
  depend on.
