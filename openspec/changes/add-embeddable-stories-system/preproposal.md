# Pre-Proposal State — `add-embeddable-stories-system`

Orchestrator-owned pre-proposal record. Persisted before the grouped product
question round, per the SDD pre-proposal gate. Status: `confirmed` — the
operator answered the grouped prompt on 2026-09-12; `sdd-proposal` is cleared
to launch with this handoff.

## Resolved by canonical default (not re-asked)

| Question | Resolution | Basis |
| --- | --- | --- |
| Q5 — Bootstrap sequencing | `sdd-monorepo-bootstrap` runs as a separate prerequisite change before this change's implementation tasks. | `openspec/project.md` next-step note and `exploration.md` recommendation; execution-level decision with a documented default, not a product choice. |

## Pending product questions (grouped prompt issued 2026-09-12)

Each question below is presented losslessly with all options and consequences.
Recommendations come from `exploration.md`.

- **Q1 — Embed distribution**: npm package only, or npm + prebuilt single-file
  script bundle? Recommendation: ship both; the script bundle is the primary
  integration path for demos and future plain-HTML sites.
- **Q2 — Publish model**: immediate publish + `expiresAt` only, or drafts with
  scheduled starts now? Recommendation: immediate publish only for the MVP;
  scheduled starts deferred.
- **Q3 — Story ordering**: chronological only, or operator-controlled
  `position` with chronological default? Recommendation: operator-controlled.
- **Q4 — Video poster**: client-side first-frame capture at upload, manual
  poster image, or none? Recommendation: client-side capture, non-blocking,
  no-poster fallback.

## Resolved product answers (operator, 2026-09-12)

| Question | Operator answer |
| --- | --- |
| Q1 — Embed distribution | npm package **and** prebuilt single-file script bundle; the script bundle is the primary integration path. (Operator phrasing: "pnpm + script".) |
| Q2 — Publish model | Immediate publish + `expiresAt` only; drafts/scheduled starts deferred. |
| Q3 — Story ordering | Operator-controlled `position` with chronological (newest-first) default. |
| Q4 — Video poster | Client-side first-frame capture at upload via canvas; non-blocking; falls back to no poster. |

No open product questions remain. Research lane stays unselected; R1/R3
provider spikes are carried into the proposal as explicit pre-spec spikes.

## Consequences

- ~~`sdd-proposal` must not launch until Q1–Q4 are answered~~ Answers recorded
  above; proposal launched against this confirmed handoff.
- Answers will be appended to this file and mirrored into the proposal inputs.
- Research lane: unselected (no evidence grants in this runtime; provider
  capabilities R1/R3 are carried as proposal-phase spikes instead).

## Key decisions already locked (see `exploration.md`)

Stack, local-first boundaries, provider-per-project credentials, atomic
manifest publication, 24 h–30 d expiry, Supabase-first adapter strategy, and
the MVP non-goals are locked with the operator and are not reopened here.
