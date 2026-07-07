# ADR-0007 — Neutrality: empty-by-default, add-by-URL only, labels module, no provenance claims

- Status: Accepted
- Date: 2026-07-07

## Context

Store viability depends on the app reading as a neutral media player,
consistently, across code, UI copy, store listing, and public repo artifacts
(spec §9, §14.3).

## Decision

Structural neutrality: no bundled addons or preloaded sources; add-by-URL
only; no in-app source directory; no claims of verifying input legality; all
user-facing strings route through the labels module
(`packages/shared-ui/src/labels`), audited before every store submission.
The repo (README, issues, docs, example configs) holds the same line;
CONTRIBUTING.md encodes it as a scope rule.

## Consequences

TBD — revisit before first store submission.
