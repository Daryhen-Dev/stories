# Delta for Expired Media Cleanup

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: best-effort panel-driven deletion of expired story
media (startup + periodic + manual triggers), per-story status transitions and
error reporting, the cleanup report, and the guarantee that cleanup never gates
availability or expiry correctness (D1, Spike A, R7).

## ADDED Requirements

### Requirement: Cleanup triggers

Traces: proposal capability 6 · D1 · D9 (interval 60 min, configurable)

The system MUST run the expired-media cleanup job on local API startup, on a
periodic schedule defaulting to every 60 minutes (configurable), and on manual
request (`POST /api/projects/:id/cleanup`). No trigger MAY be a prerequisite
for availability or expiry correctness.

#### Scenario: Cleanup runs at startup

- GIVEN the local API starting with expired stories pending deletion
- WHEN startup completes
- THEN the cleanup job has run without any operator action

#### Scenario: Manual cleanup can be requested

- GIVEN the panel running with a project that has expired stories
- WHEN the operator requests manual cleanup for the project
- THEN the job runs for that project and its report is available

### Requirement: Per-story deletion with status transitions

Traces: AC5 · D1 · design cleanup flow

The cleanup job MUST first run the expiry sweep, then select stories with
status `expired` that still have provider media, and attempt deletion of each
story's media object and, when present, its poster object. Each success MUST
transition the story to `cleaned` with `cleanedAt` set and clear any prior
cleanup error; each failure MUST record the error code and detail on the story
and continue with the remaining stories without breaking the job. Provider
deletion MUST go through explicit adapter `delete` calls only.

#### Scenario: Mixed deletion results update statuses individually

- GIVEN two expired stories, one whose media deletes successfully and one whose adapter delete fails
- WHEN the cleanup job runs
- THEN the first story becomes `cleaned` with `cleanedAt` set, the second stays `expired` with its error recorded, and the job completes processing both

#### Scenario: Poster deletion is attempted alongside media

- GIVEN an expired story with both media and poster objects
- WHEN its cleanup attempt succeeds
- THEN both objects are deleted and the story transitions to `cleaned`

### Requirement: Cleanup report

Traces: AC5 · design cleanup flow (`CleanupReport`)

The system MUST produce a cleanup report per run — attempted, deleted, and
failed counts plus per-story errors with story id and error code — and MUST
expose the latest report via `GET /api/cleanup/status`.

#### Scenario: The report reflects a mixed run

- GIVEN a cleanup run over three expired stories with one deletion failure
- WHEN the latest report is fetched
- THEN it reports attempted 3, deleted 2, failed 1, and lists the failed story id with its error code

### Requirement: Cleanup is never a correctness dependency

Traces: R7 (accepted trade-off) · D1 · design cleanup flow

Cleanup MUST remain best-effort: availability and expiry MUST hold with cleanup
permanently broken. Expired media MAY remain reachable by direct public URL
until the next successful cleanup run, and the panel MUST document this
residual window to the operator. No correctness path MAY depend on cleanup
having run.

#### Scenario: Expiry holds while cleanup is permanently failing

- GIVEN an adapter whose delete calls always fail
- WHEN stories pass their `expiresAt` and manifests are regenerated
- THEN expired stories are excluded from fresh manifests and filtered by the embed even though their media objects remain reachable by direct URL

#### Scenario: The residual window is operator-visible

- GIVEN the panel documentation or help surface for cleanup
- WHEN the operator reviews cleanup behavior
- THEN the documented behavior states that expired media may stay reachable by direct URL until the next successful run

### Requirement: Removed-story media is swept best-effort

Traces: design cleanup flow (pending-deletion rows) · proposal capability 6

The cleanup job MUST also sweep pending-deletion records left by story removal,
attempting the same per-object deletion and reporting outcomes in the same
report. Sweeping these records MUST be best-effort and MUST NOT block the
expired-story pass or the job's completion.

#### Scenario: Orphaned media of a removed story is deleted on the next run

- GIVEN a removed story whose pending-deletion record names its media and poster keys
- WHEN the cleanup job runs
- THEN the recorded objects are deleted best-effort and the outcome appears in the same cleanup report
