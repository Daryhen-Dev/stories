# Proposal — `add-embeddable-stories-system`

Deliver the first product slice of `stories`: a local-first admin panel that lets
one operator publish Instagram-style stories (photo/video, 24 h–30 d expiry) to
per-project public manifests hosted on Supabase, plus a Lit embed viewer that
Astro/Next.js sites render — with stories available and expiring correctly even
while the operator's PC is off. This proposal translates the confirmed
pre-proposal handoff into scope, delta capabilities, package impact, risks,
mandatory pre-spec spikes, and a review-load forecast. It implements nothing,
commits nothing, and selects no delivery chain.

- Artifact store: `openspec` (this file).
- Inputs: `exploration.md` (discovery, R1–R11, schema/flow sketches, acceptance
  criteria) and `preproposal.md` (confirmed status, operator answers Q1–Q4, Q5 default).
- Stacks on a separate prerequisite change: `sdd-monorepo-bootstrap`.

## Quick path

1. [Problem and objective](#problem) — the three PC-off guarantees drive everything.
2. [Scope and non-goals](#scope) — the MVP slice, with confirmed decisions Q1–Q4 baked in.
3. [Delta capabilities](#delta-capabilities) — six specs, kept split on purpose.
4. [Spikes before specs](#spikes-before-specs-mandatory) — R1 (provider TTL) and R3 (bucket CORS).
5. [Impact, risks, rollback](#impact-per-package-planned-monorepo) — per package of the planned monorepo.
6. [Review-load forecast](#review-load-forecast-delivery-decision-pending) — budget will be exceeded; delivery decision is **pending** under `ask-on-risk`.
7. [Acceptance criteria](#acceptance-criteria) — mirrored from `exploration.md`, distributed into delta specs.

## Problem

The operator manages the public stories of several projects/sites from one PC.
Today nothing exists: the repository is empty. Three operational pains make this
change worth doing now, and they translate directly into architectural
guarantees (from `exploration.md`, "Core insight"):

1. **PC-off availability.** Sites must render stories while the operator's PC is
   off. The manifest and media must live in provider public storage; the local
   API only publishes there and never serves production traffic.
2. **PC-off expiry.** A 24-hour story must disappear without any local process
   running. Expiry must be data-driven (`expiresAt` UTC in the manifest, short
   manifest cache TTL, client-side filter as defense in depth).
3. **Unbounded storage.** Expired media must eventually be deleted so storage
   stays bounded — as best-effort cleanup, never as a correctness dependency.

## Objective

Ship a working end-to-end loop: the operator adds a project with its Supabase
credentials in the local panel, uploads a photo or video, publishes, and any
Astro/Next.js site renders those stories through the embed — with expiry
enforced remotely and locally, and no panel process required at view time.

**Done means:** every acceptance criterion in [Acceptance criteria](#acceptance-criteria)
passes, including the end-to-end "panel offline, site still renders" test.

## Confirmed decisions (not reopened)

Recorded from the confirmed pre-proposal handoff (`preproposal.md`, 2026-09-12):

| # | Question | Confirmed answer |
| --- | --- | --- |
| Q1 | Embed distribution | npm package **and** prebuilt single-file `<script>` bundle; the bundle is the primary integration path. |
| Q2 | Publish model | Immediate publish + `expiresAt` only; no drafts, no scheduled starts in the MVP. |
| Q3 | Story ordering | Operator-controlled `position`; chronological default (newest first). |
| Q4 | Video poster | Client-side first-frame capture via canvas at upload; non-blocking; no-poster fallback. |
| Q5 | Bootstrap sequencing | `sdd-monorepo-bootstrap` is a separate prerequisite change; this change starts from a working strict-TDD loop (Vitest running). |

Locked macro decisions from `exploration.md` (stack, local-first boundaries,
per-project credentials, atomic publication, 24 h–30 d expiry, Supabase-first
adapters, MVP non-goals) are likewise not reopened.

## Scope

In scope for this change:

- Local project management with per-provider credentials (Supabase now; InsForge
  via the same adapter contract later), connection test, secret redaction.
- A provider-agnostic storage adapter contract (`upload`, `verify`, `publicUrl`,
  `delete`, public-read + CORS check) with Supabase as the reference
  implementation, gated by a shared contract test suite.
- Story lifecycle: create/update/remove per project; photo or video; expiry
  validated to the 24 h–30 d window; operator-controlled `position`; SQLite as
  local source of truth; explicit statuses (published, expired, cleaned).
- Video poster capture (canvas first-frame, non-blocking) at upload time.
- Manifest publication: versioned Zod-defined `stories.json`, generation that
  excludes expired stories, atomic single-object replace with verification,
  publish history for rollback, short cache-TTL policy on the manifest.
- The Lit embed viewer: full-screen tap-through viewer (progress bars,
  prev/next), photo + video, client-side expiry filter, configured by manifest
  URL, consumable via npm package and prebuilt script bundle; Astro and Next.js
  demo pages.
- Best-effort expired-media cleanup (panel start + periodic), with per-story
  deletion results reported and never blocking correctness.
- Two mandatory spikes (R1, R3) that must complete before the adapter/manifest
  specs are finalized.

## Non-goals

- Drafts and scheduled publish starts (deferred per Q2).
- InsForge adapter implementation (contract must accommodate it; implementation is later).
- Monorepo tooling bootstrap (prerequisite change `sdd-monorepo-bootstrap`).
- End-user accounts/roles; comments, reactions, metrics; media editing or
  transcoding; private buckets with signed URLs; multi-PC sync; admin panel
  deployment; mobile; Tauri installer. (Inherited from `exploration.md`.)
- Provider-side automatic expiry automation — assumed unavailable until Spike A
  says otherwise; cleanup stays panel-driven best-effort in the MVP either way.

## Delta capabilities

The six candidate capabilities from `exploration.md` are kept **split as six
delta specs**. Merging was considered and rejected: each capability owns a
distinct integration seam or failure model, and each maps to a reviewable work
unit once the delivery decision is made.

| # | Capability (delta spec) | Why it stands alone |
| --- | --- | --- |
| 1 | `project-management` | Owns the trust boundary: per-provider credentials in SQLite only, redacted in every API response, never in the repo. Connection test (including the R3 CORS check) lives here. |
| 2 | `media-storage-adapters` | Owns the provider seam. The contract (`upload`/`verify`/`publicUrl`/`delete`/CORS check) plus its contract test suite is the object other packages depend on; Supabase types must not leak outside this package (R4). |
| 3 | `story-lifecycle` | Owns the local source of truth: CRUD, expiry-window validation (24 h–30 d), `position` ordering, status model, video poster capture (Q4), streaming upload limits (R5). |
| 4 | `manifest-publication` | Owns the only production artifact: versioned `stories.json` Zod schema, expired-story exclusion, atomic replace + verification, publish history/rollback, cache-TTL policy (R2). |
| 5 | `stories-embed-viewer` | Owns the consumer seam: Lit viewer, client-side expiry filter, `position`-aware ordering, config by manifest URL, npm + prebuilt bundle distribution (Q1), Astro/Next.js demos (R11). |
| 6 | `expired-media-cleanup` | Owns best-effort lifecycle hygiene: per-story deletion of expired provider media, status transition to `cleaned`, failure reporting without breaking the job. |

The Fastify loopback API is treated as the **shared backbone** across
capabilities 1, 3, 4, and 6 — a platform concern inside `local-api`, not its own
delta spec. The `stories.json` schema is defined once in `manifest-publication`
as a shared package (`manifest-schema`) so the embed and the API validate
against one definition.

## Spikes before specs (mandatory)

Both spikes are read-only investigations in scratch provider environments. They
produce written findings recorded in `design.md` **before** the
`media-storage-adapters` contract spec and `manifest-publication` spec are
finalized. No product code, no commits of scratch credentials.

### Spike A — R1: provider TTL/lifecycle capabilities

- **Question:** Does Supabase storage offer object TTL / lifecycle / automatic
  expiration (and what, if anything, does InsForge expose)? Under what plan/tier?
- **Method:** Documentation review plus a hands-on test in a scratch bucket:
  create an object with any available lifecycle/expiration rule and observe
  deletion timing.
- **Exit criteria:** A written finding that decides, with evidence, whether
  provider-side expiry automation exists — or confirms the current assumption
  that cleanup stays purely panel-driven best-effort. Finding feeds
  `expired-media-cleanup` and `manifest-publication` specs.
- **Residual risk if unavailable:** accepted MVP trade-off (R7): expired media
  remains reachable by direct public URL until the panel next runs cleanup; the
  window is documented for the operator.

### Spike B — R3: CORS on public buckets

- **Question:** Can a browser on a real site origin fetch public bucket objects
  cross-origin (GET, and range requests for video)? Can CORS be configured via
  API/CLI, or only through the provider dashboard (manual step)?
- **Method:** Scratch bucket + minimal cross-origin fetch harness from a test
  origin; exercise GET and a ranged video request; document per-provider
  configuration steps.
- **Exit criteria:** Documented, reproducible CORS configuration steps per
  provider; the `project-management` connection test includes a CORS
  preflight check; demo integration is proven feasible or the blocker is
  documented with a workaround.

## Impact per package (planned monorepo)

The workspace does not exist yet; `sdd-monorepo-bootstrap` creates it. Layout
below is this proposal's recommended target, to be confirmed at design time.

| Package | Role | Capabilities touching it | Main impact / risk |
| --- | --- | --- | --- |
| `packages/panel` | React + Vite admin UI on the operator's PC | 1, 3, 4 (status surfacing), 6 | Project CRUD + credential forms, story editor with upload + poster capture, publish controls, cleanup status. Largest UI surface; redaction must hold in every response path (R6). |
| `packages/local-api` | Fastify loopback REST API (shared backbone) | 1, 3, 4, 6 | Endpoints for projects/stories/publish/cleanup; Zod validation; streaming uploads (R5); secret redaction middleware. Bound to loopback only. |
| `packages/core` | Domain: SQLite/Drizzle schema + migrations, story lifecycle, manifest generation from local truth | 1, 3, 4, 6 | Source of truth for stories and projects; expiry-window and `position` rules; publish history. |
| `packages/storage-adapters` | Adapter contract + Supabase reference implementation + contract tests | 2 | Provider seam; contract tests are first-class; no Supabase types outside the package (R4). Shaped by Spike A/B findings. |
| `packages/manifest-schema` | Versioned `stories.json` Zod schema + UTC ISO-8601 rules | 4 (owner), 5 (consumer) | Single definition shared by API and embed; additive-only changes within a version; no secrets, no provider-internal IDs. |
| `packages/stories-embed` | Lit web component viewer | 5 | Full-screen viewer, client-side expiry filter, photo + video, `position` order; ships npm package **and** prebuilt single-file bundle (primary path, Q1); client-only to avoid SSR pitfalls (R11). |
| `apps/demo-astro`, `apps/demo-next` | Minimal consumer sites | 5 | Playwright smoke targets proving script-tag + framework integration (R11). |
| Tooling (shared tsconfig/lint/vitest) | Workspace infra | — | Owned entirely by `sdd-monorepo-bootstrap`; this change only consumes it (R10 resolved by sequencing). |

Affected external areas: the operator's workflow (single new panel), consuming
sites (add one script tag / dependency), and one Supabase project per managed
site (bucket + public manifest object).

## Risks and mitigations

Carried from `exploration.md` (R1–R11), with where each is handled:

| # | Risk | Handling in this change |
| --- | --- | --- |
| R1 | Provider TTL/lifecycle may not exist | **Spike A before adapter spec.** Cleanup stays best-effort regardless. |
| R2 | Manifest caching delays expiry visibility | Short cache-TTL policy on `stories.json` in `manifest-publication`; embed-side `expiresAt` filter as defense in depth. |
| R3 | Bucket CORS blocks embed fetches | **Spike B before adapter spec**; CORS preflight in connection test; documented manual steps per provider. |
| R4 | Adapter fits Supabase only | Contract test suite owned by the contract; Supabase types forbidden outside `storage-adapters` (enforced by a package-boundary test). |
| R5 | Large video uploads via loopback API | Streaming upload, configurable max size, verify-before-publish; limits surfaced in the panel UI. |
| R6 | Credential leakage (git/logs/responses) | Secrets only in local SQLite/env; redaction in every API response; repo-wide "no secrets" scan test with a fixture secret from bootstrap onward. |
| R7 | Expired media reachable by direct URL until cleanup | Accepted MVP trade-off; cleanup on panel start + periodic; window documented for the operator. |
| R8 | Viewer clock skew narrows display windows | Accepted: manifest already excludes expired stories; skew only briefly narrows the embed-side window. |
| R9 | Change size vs 400-line budget | Forecast below; delivery decision is **pending** under `ask-on-risk` — not made here. |
| R10 | Empty repo, tooling missing | Resolved by sequencing: `sdd-monorepo-bootstrap` runs first; strict TDD active before this change's first task. |
| R11 | SSR pitfalls rendering the embed in Astro/Next.js | Embed ships client-only; Astro/Next demos + early Playwright smoke prove integration. |

## Rollback

- **Publication layer:** the manifest replace is atomic per object and publish
  history is kept; rollback = republish the last known-good manifest entry. A
  failed verification leaves the previous manifest serving (acceptance criterion).
- **Media layer:** orphaned uploads from a crash between upload and manifest
  replace are harmless and swept by cleanup; expired-media deletion is
  best-effort and never a correctness dependency.
- **Local layer:** SQLite is the local source of truth; stories can be removed
  and republished; no remote state exists beyond the single manifest object and
  media objects.
- **Repository layer:** the empty-repo baseline makes `git revert` per
  capability slice viable once the delivery decision determines PR granularity.

## Review-load forecast (delivery decision pending)

This is a multi-package, multi-seam system. Honest per-capability estimates
(structure + code + tests + docs):

| Capability | Est. changed lines |
| --- | --- |
| `project-management` | 300–450 |
| `media-storage-adapters` | 300–500 |
| `story-lifecycle` | 400–600 |
| `manifest-publication` | 250–450 |
| `stories-embed-viewer` | 500–800 |
| `expired-media-cleanup` | 150–300 |
| **Total** | **≈ 1,900–3,100** |

That is **5–8× the 400-line review budget**, and at least two capabilities
(`story-lifecycle`, `stories-embed-viewer`) individually sit at or above the
budget. The risk of exceeding the budget in a single PR is therefore
near-certain (R9: likelihood High).

**Delivery decision: PENDING — not taken here.** Per the session preflight
(`ask-on-risk`, `chain_strategy: deferred`), this proposal only documents the
forecast and flags the risk. The chain-vs-single-PR decision must be paused and
asked of the operator before implementation tasks are planned, and no chain
strategy, PR sequence, or `size:exception` is assumed or inferred by this
proposal. Task sizing (units under the budget) remains a `tasks.md` concern.

## Acceptance criteria

Mirrored verbatim from `exploration.md`; delta specs own them per capability,
and `verify.md` must provide test evidence against each:

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

Additional proposal-level success signal: after this change, the operator can go
from "empty provider bucket" to "stories visible on a demo site, PC off" without
touching code.

## Success criteria

- All acceptance criteria above pass with recorded evidence in `verify.md`.
- Spikes A and B have written findings in `design.md` before the adapter and
  manifest specs were finalized.
- The review-load forecast is acknowledged and the delivery decision is
  explicitly resolved with the operator before `tasks.md` is written.
- No confirmed pre-proposal decision (Q1–Q5, locked macro decisions) was
  reopened or silently amended.

## Proposal question round

The proposal-shaping question round already happened at the pre-proposal gate:
the grouped product prompt (Q1–Q4) was answered by the operator on 2026-09-12,
and Q5 was resolved by documented default. No open product questions remain, so
this proposal raises none and reopens none. Two delivery-adjacent parameters
(manifest cache TTL value, max upload size) are deliberately left to the spec
and design phases; if the operator wants a second question round on any scope
edge, it can happen without touching the confirmed decisions above.

## Next step

1. Run Spike A and Spike B; record findings in `design.md`.
2. Write the six delta specs under `openspec/changes/add-embeddable-stories-system/specs/`,
   starting with `manifest-publication` (schema verbatim from `exploration.md`)
   and `media-storage-adapters` (contract + contract tests), then `design.md`
   (required: risky, multi-area).
3. Pause for the `ask-on-risk` delivery decision before `tasks.md`.
