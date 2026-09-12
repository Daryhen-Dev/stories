# Delta for Media Storage Adapters

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: the provider-agnostic storage adapter contract (five
operations plus one probe), error normalization, the first-class contract test
suite, the Supabase reference implementation and in-memory fake, and provider
encapsulation (R4).

## ADDED Requirements

### Requirement: Provider-agnostic adapter contract

Traces: proposal capability 2 · AC6 · D3

The system MUST define a single storage adapter contract exposing exactly five
operations plus one probe — `upload`, `verify`, `publicUrl`, `delete`, and
`checkPublicRead` — as the only surface through which any package touches
object storage. Consumers MUST depend only on the contract types
(`StorageAdapter`, `AdapterError`, and the input/result types); the contract
MUST NOT expose provider SDK types. `checkPublicRead` MUST be a Node-side probe
of reachability and public read, with no CORS semantics.

#### Scenario: Any conforming provider passes the same suite

- GIVEN a provider implementation constructed behind the contract
- WHEN the shared contract test suite runs against it
- THEN every contract behavior passes without the suite knowing which provider is behind the adapter

#### Scenario: Upload round-trip preserves size and content type

- GIVEN an adapter implementation
- WHEN an object is uploaded with a declared content type and length and then verified against those expectations
- THEN `verify` reports success with the stored size and content type

### Requirement: Error normalization to a typed taxonomy

Traces: proposal capability 2 · AC3, AC6 · design error taxonomy

The system MUST normalize every adapter failure — SDK, network, or provider
error — into a typed `AdapterError` carrying a code from the fixed taxonomy
(`AUTH_FAILED`, `BUCKET_NOT_FOUND`, `BUCKET_NOT_PUBLIC`, `UPLOAD_FAILED`,
`OBJECT_NOT_FOUND`, `VERIFY_MISMATCH`, `DELETE_FAILED`, `NETWORK_ERROR`,
`CORS_BLOCKED`, `UNKNOWN`) plus an operator-facing `remediation` message for
auth, bucket, public-read, and CORS-adjacent failures. Adapters MUST NEVER
throw raw provider errors across the contract boundary.

#### Scenario: Bad credentials map to the auth code

- GIVEN an adapter constructed with invalid credentials
- WHEN any operation requiring authentication is attempted
- THEN the failure surfaces as `AdapterError` with code `AUTH_FAILED` and a remediation message

#### Scenario: Missing object after delete maps to the not-found code

- GIVEN a key that was deleted
- WHEN `verify` is called for that key
- THEN the result is a failure with code `OBJECT_NOT_FOUND`

### Requirement: Verification and deletion semantics

Traces: proposal capability 2 · AC3, AC6

`verify` MUST compare the stored object against an optional expectation of
content type and size, reporting success with observed values or a
`VERIFY_MISMATCH` failure with detail. `delete` MUST remove the object and make
subsequent verification report `OBJECT_NOT_FOUND`. `publicUrl` MUST return the
deterministic public URL for a key without network access.

#### Scenario: Size mismatch fails verification

- GIVEN an uploaded object of a known size
- WHEN `verify` is called expecting a different size
- THEN the result is a failure with code `VERIFY_MISMATCH` and detail naming the mismatched property

#### Scenario: Deleted objects are no longer publicly verifiable

- GIVEN an uploaded object
- WHEN the adapter deletes it and `verify` runs again
- THEN verification reports `OBJECT_NOT_FOUND`

### Requirement: First-class contract test suite

Traces: AC6 · D3 · D10 (two-tier verification)

The system MUST ship the contract test suite as part of the adapter package
(`runStorageAdapterContractSuite`), asserting for any provider: upload→verify
round-trip including match and mismatch paths, `publicUrl` shape, delete →
`OBJECT_NOT_FOUND`, `checkPublicRead` against public and non-public buckets,
error-code mapping for bad credentials, and propagation of the upload's
cache-control seconds. The suite MUST run against the in-memory fake always, and
against the live Supabase adapter only when environment credentials
(`STORIES_E2E_SUPABASE_*`) are present, skipping otherwise.

#### Scenario: The fake adapter always passes the suite

- GIVEN the repository test run with no provider credentials configured
- WHEN the contract suite runs against the in-memory fake
- THEN all contract behaviors pass and the live Supabase profile is skipped

#### Scenario: The live profile gates on environment credentials

- GIVEN environment credentials `STORIES_E2E_SUPABASE_*` are present
- WHEN the contract suite runs with the live profile enabled
- THEN the same contract behaviors are asserted against the real Supabase project

### Requirement: Provider encapsulation across packages

Traces: R4 · AC6 · D3

The Supabase SDK and its types MUST be imported only inside the adapter
package. This boundary MUST be enforced mechanically by lint rules and a
boundary scan test that fails when any other package imports provider SDK
modules. Nothing in the contract surface MAY name a specific provider except
the reference adapter implementation itself.

#### Scenario: Boundary scan rejects a leaking import

- GIVEN the boundary scan test in the repository
- WHEN a package outside the adapter package imports a Supabase SDK module
- THEN the boundary test fails, naming the offending file

### Requirement: No provider lifecycle or TTL surface

Traces: D1 · Spike A · proposal non-goal (no provider-side expiry automation)

The adapter contract MUST NOT expose any TTL, lifecycle, or scheduled-expiration
operation. Expiry MUST be modeled purely as data (`expiresAt` elsewhere in the
system) plus explicit `delete` calls; nothing in the contract MAY express
"delete at timestamp".

#### Scenario: The contract surface contains no lifecycle operation

- GIVEN the exported contract types of the adapter package
- WHEN the public surface is inspected by a test
- THEN no lifecycle, TTL, or scheduled-expiration member exists

### Requirement: Upload cache-control propagation

Traces: AC4 · D9 (manifest `max-age=60`; media `max-age=31536000, immutable`)

Every upload MUST carry explicit cache-control seconds, and the provider MUST
persist them so that public reads serve the corresponding `Cache-Control`
header: `public, max-age=60` for the manifest object and one year immutable
(`max-age=31536000`) for media and posters. The provider simulator used in
integration tests MUST mirror these headers so the policy is assertable
end-to-end.

#### Scenario: Manifest upload requests the short TTL

- GIVEN a manifest upload performed with cache-control seconds set to `60`
- WHEN the object is fetched through its public URL in the simulated provider
- THEN the response carries `Cache-Control: public, max-age=60`

#### Scenario: Media upload requests the long immutable TTL

- GIVEN a media upload performed with cache-control seconds set to `31536000`
- WHEN the object is fetched through its public URL in the simulated provider
- THEN the response carries `Cache-Control: public, max-age=31536000, immutable`
