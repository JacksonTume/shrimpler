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
- **RN-TV shell** (react-native-tvos) → Android TV, Fire TV, tvOS, mobile — planned (Phase 2).

It plays what your sources return. It bundles no addons, includes no source
directory, and makes no representation about the provenance of user-supplied
inputs. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) for the full
architecture.

## Repository layout

| Path                 | Package                | Purpose                                                                                                              |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/core`      | `@shrimpler/core`      | Pure-TS shared brain: addon engine, metadata resolution, debrid, IPTV, library, ranking. Zero platform dependencies. |
| `packages/shared-ui` | `@shrimpler/shared-ui` | React logic shared by shells: view-models and the neutral labels module.                                             |
| `packages/shell-web` | `@shrimpler/shell-web` | React DOM shell (Vite): browser/PWA, later Tizen/webOS.                                                              |
| `docs/`              | —                      | Technical spec and architecture decision records (ADRs).                                                             |

The one load-bearing rule: **core never imports from a shell, the DOM, React,
or any player SDK.** It declares adapter interfaces; shells inject
implementations. This is enforced in CI by dependency-cruiser and by core's
DOM-less TypeScript config.

## Development

Requires Node ≥ 22 and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # run the web shell (Vite dev server)
pnpm verify     # lint + boundary check + typecheck + tests + build
```

Individual checks: `pnpm lint`, `pnpm depcruise`, `pnpm typecheck`,
`pnpm test`, `pnpm build`.

In the dev server, the **"Show focus spike"** button (top-right, dev builds
only) opens the spatial-navigation test screen — drive it with arrow keys,
Enter, and Escape/Backspace (see ADR-0010).

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
