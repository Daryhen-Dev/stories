# Delta for Story Lifecycle

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: story creation via streaming upload with limits (R5),
expiry-window validation (24 h–30 d), the explicit status model with expiry
materialization, operator-controlled ordering (Q3), non-blocking video poster
capture (Q4), and story removal with pending-deletion bookkeeping. SQLite in
`core` is the local source of truth.

## ADDED Requirements

### Requirement: Streaming story creation with validation first

Traces: proposal capability 3 · AC1 · Q2 (immediate publish) · R5

The system MUST create stories via a loopback multipart endpoint
(`POST /api/projects/:id/stories`) that validates all scalar form fields with Zod
BEFORE accepting a file part, then streams the media part end-to-end (browser →
multipart stream → adapter upload) without buffering the whole file. The request
protocol requires scalar metadata before every file part: `type`, `expiresAt`,
`position`, and `mediaSize` are required; `durationSeconds` and `posterSize` are
optional, with `posterSize` required when a poster file is present. The declared
sizes are guarded against the configured limit and counted while streaming; the
actual bytes MUST exactly match the corresponding declaration. A file arriving
before valid required metadata is rejected without an adapter upload. Creation
MUST set the story's local status to `published` and MUST automatically trigger a
project publish afterwards (Q2). Supported media types are photo and video; a
poster file part is optional.

#### Scenario: A photo story is created and auto-published

- GIVEN a project with a working adapter
- WHEN the operator submits a photo with a valid expiry and position
- THEN the media is streamed to storage and verified, a story row with status `published` is inserted, and a project publish is triggered without a second operator action

#### Scenario: Field validation rejects the request before the stream is consumed

- GIVEN a multipart submission with an invalid `expiresAt` field
- WHEN the API processes the request
- THEN validation fails with a typed error and the file stream is not uploaded to storage

#### Scenario: A file cannot precede its validated metadata

- GIVEN a multipart submission whose `media` file part arrives before the required
  scalar metadata
- WHEN the API processes the request
- THEN it rejects the request with a typed validation error and never calls
  `adapter.upload`

### Requirement: Configurable upload size limit

Traces: R5 · D9 (max upload 200 MB via `STORIES_MAX_UPLOAD_MB`)

The system MUST enforce a per-part upload size limit equal to the configured
maximum (default 200 MB), rejecting oversized uploads with HTTP `413` and a
typed error payload. Each declared `mediaSize` or `posterSize` MUST be no greater
than that maximum before its file part is accepted; a streaming byte counter MUST
also reject an actual overflow, underflow, or final size mismatch. The panel MUST
surface the current limit to the operator and pre-check file size before submit.

#### Scenario: Oversized video is rejected with 413

- GIVEN the configured maximum upload size is 200 MB
- WHEN a media part larger than the limit is submitted
- THEN the API responds `413` with a typed error and no story row is created

#### Scenario: The limit is visible before upload

- GIVEN the story editor open in the panel
- WHEN the operator selects a file exceeding the current limit
- THEN the panel blocks submission and shows the limit without sending the request

### Requirement: Expiry window validation

Traces: AC7 · D9 (expiry window 24 h–30 d in the future)

The system MUST validate that a story's `expiresAt` is a UTC instant between 24
hours and 30 days in the future at creation and edit time, rejecting values
outside the window with a Zod validation error that the panel surfaces as a UI
error.

#### Scenario: Too-short expiry is rejected

- GIVEN a story submission with `expiresAt` 12 hours in the future
- WHEN validation runs
- THEN the request is rejected with a validation error and the panel shows the expiry-window rule

#### Scenario: Too-long expiry is rejected

- GIVEN a story submission with `expiresAt` 45 days in the future
- WHEN validation runs
- THEN the request is rejected with a validation error identifying the maximum window

#### Scenario: Boundary values are accepted

- GIVEN story submissions with `expiresAt` exactly 24 hours and exactly 30 days in the future
- WHEN validation runs for each
- THEN both are accepted

### Requirement: Explicit status model with expiry materialization

Traces: AC2, AC5 · D4 · proposal capability 3 (statuses published, expired, cleaned)

The system MUST maintain an explicit story status of `published`, `expired`, or
`cleaned`. Expiry MUST be materialized by an `expireStories(now)` sweep —
transitioning `published` stories whose `expiresAt` is at or before `now` to
`expired` — invoked at API startup, before manifest generation, and before
cleanup; correctness paths MUST NOT trust a stale status column. A `cleaned`
status MUST only be reached after successful deletion of the story's provider
media.

#### Scenario: A story past its expiry becomes expired on sweep

- GIVEN a story with status `published` and `expiresAt` in the past
- WHEN `expireStories(now)` runs
- THEN the story's status becomes `expired`

#### Scenario: Expired stories are excluded from generation regardless of column staleness

- GIVEN a story row still marked `published` whose `expiresAt` is in the past
- WHEN manifest generation runs
- THEN the sweep runs first and the story is not eligible for the manifest

### Requirement: Operator-controlled ordering

Traces: Q3 · proposal capability 3

The system MUST let the operator set an integer `position` per story (default
`0`) and MUST define story order as `position` ascending with `createdAt`
descending (newest first) as tiebreak. Position MUST be editable after
creation.

#### Scenario: Same position orders newest first

- GIVEN two published stories with the same `position`
- WHEN the project's stories are ordered
- THEN the more recently created story comes first

#### Scenario: Position overrides chronology

- GIVEN a story with `position` 1 created after a story with `position` 0
- WHEN the project's stories are ordered
- THEN the `position` 0 story comes first

### Requirement: Non-blocking video poster capture

Traces: Q4 · D9 (poster ≤ 720 px long edge, JPEG quality 0.8, 3 s timeout)

The panel MUST capture a video poster client-side at file selection by drawing
a frame (seek target `min(0.1s, duration / 2)`) to a canvas capped at 720 px on
the long edge and exporting JPEG at quality 0.8, attached as the optional
`poster` part of the same multipart submission. Capture MUST be non-blocking:
a capture failure or 3-second timeout MUST simply omit the poster part, and
publish MUST never be gated on poster availability. No operator-supplied poster
image path exists in the MVP.

#### Scenario: Successful capture attaches a poster

- GIVEN the operator selects a video file that decodes in the browser
- WHEN capture completes within the timeout
- THEN the submission includes a poster part generated from the captured frame

#### Scenario: Capture failure never blocks publish

- GIVEN the operator selects a video whose frame cannot be captured, or capture exceeds 3 seconds
- WHEN the story is submitted
- THEN the poster part is omitted, the story is created and published normally, and the resulting manifest story has no `posterUrl`

### Requirement: Story removal records media for best-effort deletion

Traces: proposal capability 3 · design cleanup flow (pending-deletion row)

The system MUST delete the story row on removal and MUST, in the same
transaction, record its media and poster keys as pending deletion so the
cleanup job sweeps the provider objects best-effort. Removal MUST NOT require
provider deletion to succeed.

#### Scenario: Removing a story leaves deletable media keys behind

- GIVEN a published story with media and a poster in provider storage
- WHEN the operator removes the story
- THEN the story row is gone, a pending-deletion record with its keys exists in the same transaction, and the cleanup job later deletes the objects best-effort
