# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: the packages are layers of one domain (`core` owns the model; `shared-ui` and the shells consume it), so there is one glossary and one ADR directory.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/TECHNICAL_SPEC.md`**: architecture and domain model. Phasing notes in it marked "superseded" defer to GitHub Issues.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. `docs/adr/README.md` indexes them.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md
├── docs/
│   ├── TECHNICAL_SPEC.md
│   └── adr/
│       ├── README.md
│       ├── ADR-0001-pure-ts-core-two-shells.md
│       └── ADR-0002-stremio-protocol-imdb-ids.md
└── packages/
    ├── core/
    ├── shared-ui/
    ├── shell-web/
    └── shell-rn/
```

New ADRs follow the existing `ADR-NNNN-<slug>.md` naming.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (neutrality), but worth reopening because…_
