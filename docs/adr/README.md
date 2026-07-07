# Architecture Decision Records

Index per spec §12. Each ADR records a decision that is expensive to reverse;
propose changes to one by opening a new superseding ADR, not by editing.

| ADR                                               | Title                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| [ADR-0001](ADR-0001-pure-ts-core-two-shells.md)   | Pure-TS core + two shells; core purity invariant                    |
| [ADR-0002](ADR-0002-stremio-protocol-imdb-ids.md) | Adopt Stremio addon protocol + IMDb `tt…` ID convention unchanged   |
| [ADR-0003](ADR-0003-metadata-precedence.md)       | Metadata precedence: addon-meta-first, provider (TMDB) fallback     |
| [ADR-0004](ADR-0004-stream-ranking-policy.md)     | Stream ranking policy                                               |
| [ADR-0005](ADR-0005-debrid-first.md)              | Debrid-first; torrent engine deferred behind resolver seam          |
| [ADR-0006](ADR-0006-iptv-internal-addon.md)       | IPTV modeled as an internal addon                                   |
| [ADR-0007](ADR-0007-neutrality.md)                | Neutrality: empty-by-default, add-by-URL only, labels module        |
| [ADR-0008](ADR-0008-player-adapter-contract.md)   | `PlayerAdapter` single contract spanning VOD / live / torrent-later |
| [ADR-0009](ADR-0009-agpl-license.md)              | License: AGPL-3.0-or-later; name held separately                    |
