# Contributing to Shrimpler

Thanks for your interest! Please read this whole page — two things here are
non-negotiable and PRs that miss them will be closed: the **project scope
rules** and the **DCO sign-off**.

## Project scope — what will not be merged

Shrimpler's viability depends on it being a _neutral media player_:
empty by default, add-by-URL only, no curation toward sources. That
neutrality is structural (see spec §9 / ADR-0007), and it must hold in every
public artifact — code, docs, issues, and discussions — the same way it holds
in a store listing.

The following are **out of scope and will be closed**, regardless of how
useful they'd be:

- Default or bundled addons, or preloaded IPTV sources.
- An in-app addon/source directory, "popular addons" list, or any curation
  toward sources.
- Documentation, examples, or configs that point at infringing manifests,
  providers, or "where to get content" guidance.
- Claims that the app verifies the legality of user inputs (it can't, and
  claiming so creates an unkeepable promise).

This isn't hostility to the ideas — it's what keeps a neutral player
publishable on official app stores and keeps the project defensible. Example
configs may only reference unambiguously legal sources (public-domain
catalogs, your own Jellyfin, free-to-air playlists), never a "starter pack"
of streaming sources.

## Architecture boundary rules

The core-purity invariant (spec §2.2 / ADR-0001) is the one decision that is
expensive to retrofit:

- `@shrimpler/core` never imports from a shell, `@shrimpler/shared-ui`, React,
  the DOM, a native module, a player SDK, or **any npm package at all**.
  It declares adapter interfaces; shells inject implementations.
- `@shrimpler/shared-ui` may depend on core and React — never on a shell.
- Litmus test: the entire core must run in plain Node with no UI
  (`packages/core/src/create-core.smoke.test.ts` asserts this).

These rules are enforced in CI by dependency-cruiser
(`.dependency-cruiser.cjs`) and by core's DOM-less tsconfig. `pnpm depcruise`
must pass before you push.

## Developer Certificate of Origin (DCO)

Contributions are accepted under the project license (AGPL-3.0-or-later),
inbound-under-the-same-license. Every commit must be signed off:

```sh
git commit -s -m "Your change"
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer certifying
the [Developer Certificate of Origin](https://developercertificate.org/) —
that you have the right to submit the work under the project license. PRs
with unsigned commits will not be merged.

## Practical checklist

- New source files start with `// SPDX-License-Identifier: AGPL-3.0-or-later`.
- User-facing strings go through the labels module
  (`packages/shared-ui/src/labels`) — never hard-coded in screens.
- `pnpm verify` passes locally (lint, depcruise, typecheck, tests, build).
- Architectural changes get an ADR in `docs/adr/`.
