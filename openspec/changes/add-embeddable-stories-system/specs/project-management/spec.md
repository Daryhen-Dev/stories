# Delta for Project Management

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: local project CRUD with per-provider credentials held
only on the operator's PC, the two-context connection test (node reachability +
browser CORS probes, D2 / Spike B), and the loopback-only security boundary of
the local API (D6).

## ADDED Requirements

### Requirement: Project CRUD with per-provider credentials

Traces: proposal capability 1 · AC1, AC8 · D8

The system MUST let the single operator create, list, update, and delete
projects locally. Each project MUST store its provider id (`supabase` or
`insforge`), bucket, public base URL, manifest key, and provider credentials,
and all of it MUST be persisted only in the local SQLite database on the
operator's PC.

#### Scenario: A project is created and listed

- GIVEN the local database has no projects
- WHEN the operator creates a project with valid Supabase credentials from the panel
- THEN the project is persisted with an app-generated UUID and appears in the project listing with its non-secret fields

#### Scenario: Deleting a project removes dependent data

- GIVEN a project that has stories and publish history
- WHEN the operator deletes the project
- THEN the project row and its dependent story and history rows are removed from the local database

### Requirement: Credential secrecy in responses and repository

Traces: AC8 · D8 · R6

The system MUST never return saved credentials in plaintext from any API
response: serialized project DTOs MUST omit credential fields, and a global
serialization hook MUST additionally replace the value of any credential-like
key (credential, secret, token, api key, service role) with `"[REDACTED]"` as
defense in depth. The repository MUST never contain credentials; this MUST be
enforced by a repo-wide scan test that uses a fixture secret.

#### Scenario: Fixture secret never leaks through GET endpoints

- GIVEN a project saved with a fixture credential value
- WHEN every GET endpoint of the local API is called and all response bodies are scanned
- THEN the fixture credential value does not appear in any response

#### Scenario: Repo-wide scan rejects tracked secrets

- GIVEN the repository with `.env*` files git-ignored
- WHEN the repo-wide scan test runs
- THEN it fails if any tracked file contains the fixture secret or a credential-bearing file pattern, and passes otherwise

### Requirement: Node reachability probe in the connection test

Traces: D2 · Spike B · proposal capability 1

The system MUST provide a connection test (`POST /api/projects/:id/connection-test`)
that runs the storage adapter's `checkPublicRead` probe from Node, proving DNS,
TLS, auth, and public read reachability. The result MUST be stored on the
project's last connection check, and the response MUST mark the browser probes
as pending. A failed node probe MUST be diagnosed as a network, auth, or bucket
problem — never as CORS.

#### Scenario: Reachable public bucket passes the node probe

- GIVEN a project whose bucket is publicly readable and credentials are valid
- WHEN the connection test runs from Node
- THEN the probe reports success with the observed HTTP status and the response marks browser probes as pending

#### Scenario: Bad credentials are diagnosed without invoking CORS

- GIVEN a project whose credentials are invalid
- WHEN the connection test runs from Node
- THEN the probe fails with an auth-class diagnosis and the result is stored on the project

### Requirement: Browser CORS probe with two-context diagnosis

Traces: D2 · Spike B · AC9 dependency · proposal capability 1

Because CORS can only be observed from a browser context, the connection test
MUST include browser-side probes run by the panel on its real origin: a plain
cross-origin `fetch` of the public manifest URL and a ranged `fetch` of a media
URL (`Range: bytes=0-1023`) to cover video seeking. The panel MUST POST the
combined result to the API (`POST /api/projects/:id/cors-check`), which MUST
store it and return an operator-facing diagnosis: a rejected browser fetch with
a passing node probe MUST be diagnosed as `cors`, and a CORS failure MUST
surface per-provider manual remediation steps (dashboard/CLI guidance).

#### Scenario: CORS-blocked bucket is isolated from network failures

- GIVEN a bucket that answers the node probe successfully but rejects cross-origin browser fetches
- WHEN the panel runs the browser probes and posts the results
- THEN the stored diagnosis is `cors` and the panel shows per-provider remediation steps

#### Scenario: Range requests are part of the check

- GIVEN a bucket that allows plain cross-origin GET but rejects ranged requests
- WHEN the panel runs the browser probes including the ranged media fetch
- THEN the check reports failure for the range probe with a diagnosis pointing at video-seeking capability

### Requirement: Loopback-only API security

Traces: D6 · D9 (bind `127.0.0.1:3789`, port overridable via `STORIES_API_PORT`)

The local API MUST bind only to the loopback interface (`127.0.0.1`) on port
`3789` by default, and MUST set no CORS response headers. Every request MUST be
validated so that the `Host` header is one of the loopback forms for the
listening port and any `Origin` header matches the localhost allowlist;
requests failing either check MUST be rejected with `403`. Panel dev traffic
MUST reach the API same-origin (Vite proxy); packaged mode MUST serve the panel
statics from the API itself.

#### Scenario: Foreign Host header is rejected

- GIVEN the API listening on `127.0.0.1:3789`
- WHEN a request arrives with a `Host` header that is not `127.0.0.1:3789`, `localhost:3789`, or `[::1]:3789`
- THEN the API responds with `403` before touching any handler logic

#### Scenario: Cross-origin browser read is impossible

- GIVEN the API bound to loopback with no CORS headers
- WHEN a browser page on a non-localhost origin sends a request with a foreign `Origin` header
- THEN the request is rejected with `403` and no cross-origin response is readable
