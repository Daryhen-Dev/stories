# Delta for Stories Embed Viewer

New capability — no canonical spec exists yet; this delta adds the full initial
requirement set. Scope: the Lit `<stories-viewer>` web component, client-side
expiry filtering, manifest-order fidelity, version guard, refresh policy,
client-only distribution as npm package and prebuilt script bundle (Q1, D7),
and the demo integrations that prove Astro/Next.js rendering (R11) including
the PC-off scenario (AC10).

## ADDED Requirements

### Requirement: Full-screen tap-through viewer

Traces: proposal capability 5 · AC9 · design embed distribution table

The system MUST provide a `<stories-viewer>` custom element configured by a
`manifest-url` attribute that renders a full-screen tap-through viewer with
per-story progress bars, prev/next navigation via tap zones and arrow keys, and
pause on pointer-hold. It MUST render photo and video stories, using
`posterUrl` as the video poster when present and a media-only fallback when
absent.

#### Scenario: Photo and video stories render in sequence

- GIVEN a manifest containing a photo story and a video story with a poster
- WHEN the viewer loads the manifest and the operator advances through stories
- THEN both stories render, the video shows its poster, and navigation reaches each story in order

#### Scenario: Video without poster falls back to media-only

- GIVEN a video story without `posterUrl` in the manifest
- WHEN the viewer navigates to it
- THEN the video renders without a poster and no error is shown

### Requirement: Client-side expiry filter

Traces: AC2 · R2, R8 (defense in depth) · design embed rules

After parsing the manifest, the viewer MUST filter out every story whose
`expiresAt` is at or before the current client time, and MUST re-check on each
navigation so a story expiring mid-session disappears on next navigation. This
filter is defense in depth and MUST NOT rely on any local process.

#### Scenario: Expired stories are filtered by the client clock

- GIVEN a manifest containing one story already expired and one still valid
- WHEN the viewer parses the manifest with a mocked client clock
- THEN only the still-valid story is listed and rendered

#### Scenario: A story expiring mid-session drops out on next navigation

- GIVEN the viewer is displaying a session in which the next story's `expiresAt` passes while the current story is shown
- WHEN the operator navigates to the next story
- THEN the expired story is skipped and not rendered

### Requirement: Manifest order is trusted

Traces: Q3 · design manifest schema ordering rules

The viewer MUST render stories in the manifest's serialized order and MUST NOT
re-sort them; ordering authority belongs to publication (`position` ascending,
`createdAt` descending tiebreak).

#### Scenario: No client-side re-sorting occurs

- GIVEN a manifest whose stories array is ordered by position
- WHEN the viewer lists stories for navigation
- THEN the displayed order matches the manifest array order exactly

### Requirement: Manifest version guard

Traces: proposal capability 5 · design manifest schema versioning rules

The viewer MUST parse the manifest with the v1 schema and MUST handle an
unknown `version` by logging a console warning and rendering nothing — it MUST
NOT guess forward or render unvalidated payloads.

#### Scenario: Unknown manifest version renders nothing

- GIVEN a manifest URL serving a payload with `version` 2
- WHEN the viewer fetches and parses it
- THEN it logs a console warning and renders no stories

### Requirement: Visibility-based manifest refresh

Traces: D9 (refresh interval matches manifest TTL 60 s) · design embed rules

The viewer MUST fetch the manifest on connect and MUST re-fetch when the tab
becomes visible if the last fetch is older than 60 seconds, keeping expiry
visibility bounded by the manifest cache TTL.

#### Scenario: Stale manifest is refreshed when the tab becomes visible

- GIVEN the viewer fetched a manifest more than 60 seconds ago while the tab was hidden
- WHEN the tab becomes visible again
- THEN the viewer re-fetches the manifest before continuing

#### Scenario: A recent manifest is not re-fetched

- GIVEN the viewer fetched the manifest less than 60 seconds ago
- WHEN the tab becomes visible again
- THEN no new manifest request is issued

### Requirement: Client-only distribution as npm package and prebuilt bundle

Traces: Q1 · D7 · AC9 · R11 · design embed distribution table

The embed MUST ship client-only in two forms: an npm ESM package that
auto-registers the element only when a browser `window` exists (with an
explicit `defineStoriesViewer()` export and a `/register` side-effect entry),
and a prebuilt single-file IIFE script bundle (Lit, Zod, and styles inlined, no
external assets) of at most 50 KB gzipped. The script bundle MUST be the
primary integration path: one `<script defer src>` plus the custom element tag.
No SSR code path MAY exist.

#### Scenario: Script-tag integration works in a plain HTML page

- GIVEN a plain HTML page including the prebuilt IIFE via `<script defer>` and a `<stories-viewer manifest-url>` element
- WHEN the page loads against a manifest with photo and video stories
- THEN the viewer renders and navigates through both stories

#### Scenario: The module is inert on a server

- GIVEN the npm module imported in an environment without `window`
- WHEN the module is loaded without an explicit registration call
- THEN no element registration runs and no server-side rendering path exists

### Requirement: Demo integrations prove framework rendering

Traces: AC9, AC10 · R11 · D2 (end-to-end CORS proof) · D10 (two-tier verification)

The system MUST include minimal Astro and Next.js demo sites consuming the
embed — Astro via plain script tag, Next.js via client-only dynamic import with
SSR disabled — and Playwright smoke tests proving photo and video stories
render in a plain HTML page and in both demos. The PC-off scenario MUST be
proven by stopping the local API before the site loads and asserting the site
still lists and renders published non-expired stories from the provider alone.

#### Scenario: Both demos render the embed

- GIVEN the Astro demo and the Next.js demo each configured with a manifest URL
- WHEN the Playwright smokes run against both demos
- THEN the viewer opens, navigates, and plays photo and video stories in each framework

#### Scenario: The site renders with the panel offline end-to-end

- GIVEN a published project whose manifest and media are served by the provider
- WHEN the local API is stopped and a demo site is loaded
- THEN the site lists and renders the published non-expired stories fetched from the provider alone
