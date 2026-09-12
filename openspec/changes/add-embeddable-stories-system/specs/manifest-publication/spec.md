# Delta for Manifest Publication

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: the versioned `stories.json` schema v1 (single shared
definition in `manifest-schema`), generation rules from local truth, atomic
publication with verification, publish history with verbatim rollback, the
cache-TTL policy, and the provider-only production hosting property that makes
PC-off availability possible.

## ADDED Requirements

### Requirement: Versioned stories.json schema v1

Traces: proposal capability 4 · AC1, AC4 · D3 (schema defined once, consumed everywhere)

The system MUST define the manifest schema once, with Zod, as version `1`:
`version` literal `1`, `projectId` UUID, `generatedAt` and all story timestamps
as UTC ISO-8601 strings with `Z` suffix only, and a `stories` array capped at
100 entries. Each story entry MUST contain: `id` UUID, `type` (`photo` or
`video`), `mediaUrl`, optional `posterUrl` (both public URLs), `createdAt`,
`expiresAt`, and integer `position` ≥ 0. Objects MUST be strict (unknown fields
rejected). The manifest MUST contain no secrets and no provider-internal IDs
beyond public URLs and story UUIDs. The embed and the API MUST validate against
this one definition.

#### Scenario: A generated manifest parses against the schema

- GIVEN a published project with at least one story
- WHEN the served `stories.json` is fetched and parsed with the v1 schema
- THEN parsing succeeds with `version` 1 and every timestamp in `Z`-suffixed UTC form

#### Scenario: Non-UTC timestamps are rejected at parse time

- GIVEN a manifest payload whose `generatedAt` uses a UTC offset instead of `Z`
- WHEN it is parsed with the v1 schema
- THEN parsing fails

#### Scenario: Story cap is enforced

- GIVEN a manifest payload with 101 story entries
- WHEN it is parsed with the v1 schema
- THEN parsing fails due to the array cap of 100

### Requirement: Versioning policy is additive within v1

Traces: proposal capability 4 · design manifest schema rules

Within schema version `1`, the system MUST allow additive optional fields only;
breaking changes MUST ship as version `2` alongside v1 for a deprecation
window. Every generated manifest MUST declare `version: 1` explicitly.

#### Scenario: Generated manifests always declare the literal version

- GIVEN any successful publication
- WHEN the manifest bytes are inspected
- THEN the top-level `version` is exactly `1`

#### Scenario: Additive optional fields remain valid

- GIVEN schema v1 plus a newly added optional field on a story entry
- WHEN an older consumer parses the manifest with the previous v1 schema
- THEN parsing still succeeds

### Requirement: Generation rules from local truth

Traces: AC2 · D4 · Q3 · proposal capability 4

The system MUST generate the manifest from SQLite local truth only: the expiry
sweep runs first; stories whose `expiresAt` is at or before `generatedAt` MUST
be excluded; remaining stories MUST be serialized sorted by `position`
ascending with `createdAt` descending as tiebreak; media and poster URLs MUST
be public provider URLs; and serialization MUST be deterministic (fixed key
order, no pretty-print) so equal inputs produce equal bytes.

#### Scenario: Expired stories never enter a fresh manifest

- GIVEN a project with one story whose `expiresAt` has passed and one still valid
- WHEN the manifest is generated
- THEN only the still-valid story appears in the stories array

#### Scenario: Ordering follows position with chronological tiebreak

- GIVEN stories with mixed `position` values and equal positions
- WHEN the manifest is generated
- THEN the stories array is ordered by `position` ascending and, within equal positions, newest `createdAt` first

#### Scenario: Deterministic bytes for equal inputs

- GIVEN the same set of local stories
- WHEN generation runs twice without changes
- THEN the serialized manifest bytes are identical

### Requirement: Atomic publication with verification

Traces: AC1, AC3 · D4 · proposal capability 4

The system MUST publish through a single flow: expiry sweep; upload and verify
any not-yet-uploaded media and posters (any failure aborts with the manifest
untouched); build and serialize the manifest; replace the manifest object in
one upload with cache-control seconds `60` (the atomic cutover); then verify by
checking size and content type and reading back the public URL, parsing it with
the v1 schema, and comparing the story-id set with the generated one. Every
failure MUST leave the previous manifest serving, MUST record a
`result='failed'` publish history row with error detail, and MUST surface the
typed error to the panel. The manifest object MUST be the only production write
target — per-story mutations converge through publication, never through
per-object remote edits.

#### Scenario: Successful publication serves the new manifest

- GIVEN a project with a photo story whose media uploaded and verified
- WHEN publication runs
- THEN the public manifest URL serves schema-valid v1 bytes containing that story, and a `result='success'` history row records the exact bytes

#### Scenario: Media verification failure aborts and preserves the previous manifest

- GIVEN a published project whose current manifest is serving
- WHEN a story is created whose media fails upload verification and publication runs
- THEN publication aborts, the previously serving manifest bytes are unchanged, a `result='failed'` history row is recorded, and the panel shows the typed failure

#### Scenario: Read-back mismatch is treated as unverified failure

- GIVEN publication whose read-back parse or story-id set comparison fails
- WHEN the failure is detected
- THEN publication reports failure with detail, records the failed history row, and the previous known-good bytes remain available from history

### Requirement: Publish history with verbatim rollback

Traces: proposal capability 4 (rollback) · design publication flow

The system MUST retain at least the last 50 publish history rows per project,
each storing the exact manifest bytes published and its result. Rollback
(`POST /api/projects/:id/rollback`) MUST republish the latest
`result='success'` row's stored bytes verbatim — not regenerated. Restored
bytes containing since-expired stories MUST still self-expire through data
(generation exclusion on the next publish and the embed-side filter), so
rollback can never resurrect an expired story as live.

#### Scenario: Rollback restores the last successful bytes

- GIVEN a failed or unwanted publication after a known-good one
- WHEN the operator triggers rollback
- THEN the manifest object is replaced with the stored bytes of the latest successful history entry

#### Scenario: Rollback cannot resurrect expired stories as live

- GIVEN a restored manifest containing a story whose `expiresAt` has passed
- WHEN a site fetches and renders the restored manifest
- THEN the expired story is still excluded by generation on the next publish and filtered by the embed, so it never renders as live

### Requirement: Cache TTL policy on published objects

Traces: AC4 · D9 (manifest `public, max-age=60`; media one year immutable)

The system MUST request `Cache-Control: public, max-age=60` on every manifest
publication and `Cache-Control: public, max-age=31536000, immutable` on media
and poster uploads, so worst-case expiry visibility is bounded to about 60
seconds of staleness. The policy MUST be assertable in integration tests via
the provider simulator's mirrored headers.

#### Scenario: Served manifest carries the short TTL

- GIVEN a successful publication
- WHEN the manifest is fetched from the provider simulator
- THEN the response carries `Cache-Control: public, max-age=60`

### Requirement: Provider is the only production host

Traces: AC1, AC10 · design core insight (PC-off availability) · D4

The manifest and all media MUST live in the provider's public storage; the local
API MUST never serve production traffic to sites. Publication MUST be the only
write path to the public manifest object, so sites can fetch stories while the
operator's PC and panel are off.

#### Scenario: Published content is fetchable with the panel stopped

- GIVEN a successfully published project
- WHEN the local API process is stopped and the public manifest and media URLs are fetched
- THEN both URLs are served by the provider alone with valid content
