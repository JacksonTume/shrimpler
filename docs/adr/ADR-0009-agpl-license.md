# ADR-0009 — License: AGPL-3.0-or-later; "Shrimpler" name held separately

- Status: Accepted
- Date: 2026-07-07

## Context

In a scrutinized category, permissive licensing invites closed bad-actor
forks, and a future server-side component (metadata proxy, sync) would open
the hosted-service loophole (spec §12, §14.1).

## Decision

All code is AGPL-3.0-or-later with SPDX headers on every source file;
contributions are inbound-under-the-same-license (no DCO sign-off, no CLA).
The "Shrimpler" name and marks are held by Jackson separately from the code
license (Mozilla/Stremio model): forks may ship the code but may not present
themselves as the official project. Stated in README and NOTICE.

## Consequences

TBD — revisit if a relicense path is ever needed (would require a CLA).
