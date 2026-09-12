# Spike Findings — `add-embeddable-stories-system`

Documentation-level evidence for the two mandatory proposal spikes (collected
2026-09-12). Hands-on confirmation against the operator's real provider project
remains an apply-phase step; the connection test and Playwright smokes are the
in-system verification path.

## Spike A — Provider TTL / lifecycle (R1)

**Finding: provider-side deletion of current objects is NOT available for our
per-story expiry. Panel-driven best-effort cleanup stays the correctness path
(R7 accepted).**

Evidence:

- Supabase Storage exposes bucket lifecycle APIs in the JS SDK
  (`getBucketLifecycle`, `deleteBucketLifecycle`; docs also show a lifecycle
  configuration surface with `NoSuchLifecycleConfiguration` and
  `FeatureNotEnabled` errors, "Standard buckets only"):
  <https://supabase.com/docs/reference/javascript/file-buckets-getbucketlifecycle>
  and <https://supabase.com/docs/reference/javascript/file-buckets-deletebucketlifecycle>
- **Decisive limitation:** the documented lifecycle semantics target *noncurrent
  object versions* — "versioning must be on; the rules expire previous versions
  of objects, not the current one." Source: getBucketLifecycle doc page above.
  A studio feature request describes the same AWS-style tiering/expiry model:
  <https://github.com/supabase/supabase/pull/42267>
- Therefore lifecycle rules cannot express "delete this story's object at its
  `expiresAt`" for current objects, and granularity is day-based bucket/prefix
  rules, not per-object timestamps.
- InsForge storage docs (overview) document public buckets and signed URLs but
  **no lifecycle/TTL API**: <https://docs.insforge.dev/core-concepts/storage/overview>
- Supabase object deletion must go through the Storage API, not SQL:
  <https://supabase.com/docs/guides/storage/management/delete-objects> — supports
  our adapter `delete` design (SDK/API path, service-role credentials held
  locally only).

Consequences for design/specs:

- `expired-media-cleanup` remains panel-driven (startup + periodic), best-effort,
  never a correctness dependency.
- `manifest-publication` and the embed enforce expiry purely data-driven.
- Provider lifecycle is recorded as a possible future optimization, not relied on.

## Spike B — CORS on public buckets (R3)

**Finding: Supabase Storage's own app does not set CORS headers; on the hosted
platform CORS is delegated to the platform gateway. Doc-level confirmation of
permissive CORS for public reads is inconclusive → the connection-test CORS
preflight is mandatory, and hands-on confirmation happens in apply with the
operator's real project.**

Evidence:

- supabase/storage `src/app.ts` contains `// kong should take care of cors` with
  `app.register(fastifyCors)` commented out — the storage service itself ships
  no global CORS middleware:
  <https://github.com/supabase/storage/blob/master/src/app.ts>
- The public-object route handler sets no CORS headers either
  (<https://github.com/supabase/storage/blob/003d5f5d/src/http/routes/object/getPublicObject.ts>),
  so any CORS behavior comes from the hosted gateway layer (Kong), not the
  storage app.
- Community guidance treats CORS for hosted storage as working without
  per-bucket configuration
  (<https://github.com/orgs/supabase/discussions/23198>), but no authoritative
  passage was retrievable; treat as unverified.
- InsForge docs do not document a CORS configuration API for buckets
  (<https://docs.insforge.dev/core-concepts/storage/overview>); S3-compatible
  backends typically require bucket-level CORS config
  (<https://docs.insforge.dev/core-concepts/storage/s3-compatibility>).

Consequences for design/specs:

- `project-management` connection test MUST include a real manifest/GET CORS
  check and surface a clear operator-facing error with per-provider manual
  remediation steps (dashboard/CLI) when the check fails.
- Range requests (`Range` header) for video seeking must be part of the check.
- The Astro/Next.js Playwright smokes are the end-to-end CORS proof on real
  origins.

## Open hands-on items (apply phase, operator's real project)

1. Confirm hosted Supabase CORS on a real public bucket from a real site origin
   (GET + ranged video request).
2. Capture the exact InsForge bucket/CORS steps once its adapter work starts.
