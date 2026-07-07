# Pull request

## What & why

<!-- Describe the change and the motivation. Link related issues/ADRs. -->

## Checklist

- [ ] No bundled/default sources, source directories, or source-pointing docs
      (see CONTRIBUTING.md — these are out of scope and will be closed).
- [ ] Boundary rules respected: core imports nothing platform-specific;
      `pnpm depcruise` passes.
- [ ] `pnpm verify` passes (lint, depcruise, typecheck, tests, build).
- [ ] New source files carry the SPDX header
      (`// SPDX-License-Identifier: AGPL-3.0-or-later`).
- [ ] User-facing strings routed through the labels module, not hard-coded.
- [ ] All commits are signed off (`git commit -s`, DCO).
