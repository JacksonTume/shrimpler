# Shrimpler

A simple, neutral, cross-platform media player and content discovery client,
compatible with the Stremio addon protocol.

> Shrimpler hosts, stores, and distributes no content. The app ships empty:
> you supply your own sources (addon manifest URLs, IPTV playlists, optional
> service credentials), and you are responsible for the legality of the
> sources you add.

## What it is

Shrimpler is a media player built from a single pure-TypeScript core consumed
by per-platform shells:

- **Web shell** (React DOM) → browser / PWA now; Samsung Tizen and LG webOS later.
- **RN shell** (React Native via Expo) → Android mobile now (iOS later); Android TV,
  Fire TV, and tvOS later.

It plays what your sources return. It bundles no addons, includes no source
directory, and makes no representation about the provenance of user-supplied
inputs. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) for the full
architecture.

## Repository layout

| Path                 | Package                | Purpose                                                                                                              |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/core`      | `@shrimpler/core`      | Pure-TS shared brain: addon engine, metadata resolution, debrid, IPTV, library, ranking. Zero platform dependencies. |
| `packages/shared-ui` | `@shrimpler/shared-ui` | React logic shared by shells: view-models, the neutral labels module, and the Reef design tokens (ADR-0016).         |
| `packages/shell-web` | `@shrimpler/shell-web` | React DOM shell (Vite): browser/PWA, later Tizen/webOS.                                                              |
| `packages/shell-rn`  | `@shrimpler/shell-rn`  | React Native shell (Expo dev client): Android mobile first, TV later.                                                |
| `docs/`              | —                      | Technical spec and architecture decision records (ADRs).                                                             |

The one load-bearing rule: **core never imports from a shell, the DOM, React,
or any player SDK.** It declares adapter interfaces; shells inject
implementations. This is enforced in CI by dependency-cruiser and by core's
DOM-less TypeScript config.

## Development

Requires Node ≥ 22.13 and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # run the web shell (Vite dev server)
pnpm verify     # lint + boundary check + typecheck + tests + build
```

Individual checks: `pnpm lint`, `pnpm depcruise`, `pnpm typecheck`,
`pnpm test`, `pnpm build`.

Drive the **real addon engine** from the terminal (no UI) against a manifest
URL you supply — installs it, then lists a catalog and resolves meta + ranked
streams for the first few items:

```sh
pnpm smoke <manifest-url> [type] [catalogId]
```

The full in-app flow (search → detail → play) needs two user-supplied,
never-committed credentials: a **TMDB API key** for metadata and a
**Real-Debrid token** to resolve torrent sources to a playable link. Enter them
on the Settings screen, or in dev via a git-ignored `.env` (see
[`packages/shell-web/.env.example`](packages/shell-web/.env.example)). Both are
optional — without them the app still runs on addon-supplied metadata and
direct-URL streams.

IPTV + EPG is **off by default** while that work is paused (see the roadmap).
Opt in on web with `VITE_IPTV_ENABLED=true` in the same `.env`; the RN shell's
gate is a constant in `packages/shell-rn/src/features.ts`.

The **RN shell** runs in an Expo dev client (a custom native build, not Expo
Go). Android first:

```sh
pnpm --filter @shrimpler/shell-rn android   # build + install the dev client
pnpm --filter @shrimpler/shell-rn start     # Metro for an installed dev client
```

Current status and what to work on next: [docs/ROADMAP.md](docs/ROADMAP.md).

## Testing

```sh
pnpm test                                # all suites
npx vitest run --project core            # core package only (plain Node)
npx vitest run --project shell-web       # web shell only (jsdom)
npx vitest run --project shared-ui       # view-models (jsdom)
npx vitest run --project shell-rn        # RN adapters/helpers (node)
npx vitest run packages/core/src/addon/create-engine.test.ts   # one file
```

Everything runs offline — no suite touches the network:

- **Core** tests run in plain Node (this doubles as the §2.2 core-purity
  litmus test). The addon engine is exercised against an in-memory
  `StorageAdapter` and a route-table `HttpAdapter`: install/persistence,
  fan-out, per-addon timeouts, partial-failure isolation, merge/dedup, and
  stream ranking.
- **shell-web** tests run in jsdom: per-screen render tests (home, addon
  manager, search, detail, settings, catalog), the `<video>` player adapter,
  and the back-key stack. View-models are unit-tested against a fake core in
  the shared-ui suite.
- **shell-rn** tests run in plain Node and cover adapters, the composition root,
  and pure helpers only. RN component rendering needs a device or emulator and
  is not covered by CI.

Manual testing: the dev server runs the full Phase 1 flow — add a source by URL,
search a title, open its detail, pick a source, and play (Real-Debrid resolves
torrents to a direct link); watch progress persists to a "Continue watching"
row on the home screen and resumes on replay. Metadata and playback need the
credentials noted under [Development](#development). Use `pnpm smoke` to exercise
the engine against a manifest without the UI.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR — note especially
the project-scope rules (no bundled sources of any kind).

## Trademark

The "Shrimpler" name and any associated logos are held by Jackson separately
from the code license. You may fork and redistribute the code under the AGPL,
but forks may not use the "Shrimpler" name or marks in a way that implies
they are the official project. See [NOTICE](NOTICE).

## Disclaimer

Shrimpler is a neutral media player. It hosts, stores, and distributes no
content; it ships with no sources; it does not and cannot verify the legality
of user-supplied inputs. Users are solely responsible for the sources they
add and for complying with the laws that apply to them.

## License

[AGPL-3.0-or-later](LICENSE). Every source file carries an SPDX header.
Contributions are accepted under the same license
(see [CONTRIBUTING.md](CONTRIBUTING.md)).
