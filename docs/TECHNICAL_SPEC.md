# Shrimpler — Technical Specification

**Product:** Shrimpler — a neutral, cross-platform media player & content discovery client
**Status:** Draft v0.2 — foundation document
**Owner:** Jackson
**License:** AGPL-3.0-or-later (code) · "Shrimpler" name held separately (see §14)
**Audience:** Engineering (implementation-ready)

> **Name origin:** tuna → fish → shrimp + _simpler_ → **Shrimpler**. The "simpler" is
> the product thesis: a simple, does-one-thing, neutral player. Keep the branding
> playful; keep the store listings and repo docs sober (see §9, §14).

---

## 1. Overview

### 1.1 What this is

A cross-platform media player and content discovery client compatible with the
**Stremio addon protocol**, shipped **open source (AGPL-3.0-or-later) from day one**.
Shrimpler is a _neutral media player_: it hosts, stores, and distributes no content.
Users supply their own sources — addon manifest URLs, IPTV playlists (M3U / Xtream
Codes), and optional debrid credentials — and the app plays what those sources return.

The product runs from a single **pure-TypeScript core** consumed by **two platform
shells**:

- **RN-TV shell** (`react-native-tvos`) → Android TV, Fire TV, Apple TV (tvOS),
  Android mobile, iOS mobile.
- **Web shell** (React DOM) → Samsung Tizen, LG webOS, browser / PWA.

### 1.2 Design goals

1. **Single source of truth for logic.** ~80% of behaviour (addon protocol, catalog
   merge, metadata resolution, EPG, debrid, library state) lives once in the core and
   is reused by every platform.
2. **Neutral by architecture.** Empty by default; user supplies all sources. No
   bundled addons, no in-app source directory, no piracy signposting. Neutrality is a
   structural property (see §9), not a slogan — it is what keeps the app viable on
   official app stores.
3. **Player abstraction as the spine.** One `PlayerAdapter` contract spans debrid
   direct URLs, live TS/HLS with reconnect, and (optional) torrent-served local HTTP,
   implemented per platform.
4. **The `tt…` IMDb ID convention is load-bearing.** It is simultaneously the addon
   join key and the TMDB metadata-lookup key. Do not invent a competing ID scheme.

### 1.3 Non-goals (v1)

- No in-app addon marketplace / discovery directory (users paste manifest URLs;
  external bundlers combine multiple addons into one master manifest).
- No local torrent engine in v1 (debrid-first; torrent engine is an optional later
  source type behind the same resolver seam — see §6.4).
- No DRM-protected commercial catalogs (Netflix/Disney etc.); out of scope.
- No account system beyond optional third-party sync (Trakt) as a metadata provider.

---

## 2. Architecture

### 2.1 Layered model

```
┌──────────────────────────────────────────────────────────────┐
│  SHELLS  (per-platform UI + input + packaging)                │
│                                                                │
│   RN-TV shell                        Web shell                 │
│   Android TV / Fire TV / tvOS        Tizen / webOS / browser   │
│   Android mobile / iOS mobile                                  │
│   - native views                     - DOM                     │
│   - D-pad focus manager              - spatial-nav focus mgr   │
│   - labels module (neutral strings)  - labels module           │
│   - player adapter impls             - player adapter impls    │
└───────────────────────────┬──────────────────────────────────┘
                            │  imports (one-way, no back-references)
┌───────────────────────────▼──────────────────────────────────┐
│  CORE  (pure TypeScript — zero renderer / DOM / player deps)  │
│                                                                │
│   addon engine · resource clients · merge & rank              │
│   MetadataResolver · MetadataProvider(s)                      │
│   debrid resolver · IPTV subsystem · EPG pipeline             │
│   library / state · cache                                      │
└───────────────────────────┬──────────────────────────────────┘
                            │  defines interfaces; shells inject impls
┌───────────────────────────▼──────────────────────────────────┐
│  ADAPTERS  (interface declared in core, implemented in shell) │
│   PlayerAdapter · StorageAdapter · HttpAdapter                │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 The invariant that makes or breaks the project

> **Core never imports from a shell, and never touches the DOM, a native module, or a
> player SDK.** It declares interfaces; shells inject implementations.

Litmus test: _the entire core must run in plain Node with no UI._ If it can, the
boundary is correct. If any core file imports React, a DOM API, ExoPlayer, or a fetch
polyfill directly, the boundary is broken. This is the one decision that is expensive
to retrofit; everything else is recoverable.

### 2.3 Dependency direction

`shell → core → adapter-interface`. Never the reverse. The core depends only on
TypeScript, its own modules, and the adapter _interfaces_ it declares. Adapters are
injected at shell startup via a composition root (see §7.3).

---

## 3. Repository & package layout

Monorepo (pnpm or npm workspaces), npm scope **`@shrimpler`**. Suggested structure:

```
/packages
  /core                  # @shrimpler/core — pure TS, the shared brain. No platform deps.
    /addon               # protocol client, manifest parsing, resource clients
    /metadata            # MetadataResolver + MetadataProvider interface
    /providers           # TMDB provider impl (uses injected HttpAdapter)
    /debrid              # debrid resolver + provider clients
    /iptv                # M3U + Xtream parsers, EPG pipeline (internal addon)
    /library             # watchlist, continue-watching, installed sources
    /cache               # TTL cache, provider-agnostic
    /ranking             # stream + catalog merge/dedup/rank
    /adapters            # PlayerAdapter, StorageAdapter, HttpAdapter INTERFACES
    /types               # shared domain types (ids, meta, streams, sources)
    /index.ts            # public API surface

  /shared-ui             # @shrimpler/shared-ui — React logic shared by both shells
    /viewmodels          # hooks/view-models that call core, return state+handlers
    /labels              # neutral user-facing string map (see §9.2)

  /shell-rn              # @shrimpler/shell-rn — react-native-tvos app
    /players             # ExoPlayer / AVPlayer adapter impls
    /focus               # D-pad focus model
    /screens
    /composition-root.ts # wires adapters into core

  /shell-web             # @shrimpler/shell-web — React DOM app (Tizen / webOS / browser)
    /players             # <video> / AVPlay / webOS adapter impls
    /focus               # spatial-navigation focus model
    /screens
    /composition-root.ts

/docs                    # this spec + ADRs (see §12)
/.github                 # issue/PR templates (incl. neutrality guardrails, §14)
LICENSE                  # AGPL-3.0
README.md · CONTRIBUTING.md · CODE_OF_CONDUCT.md · NOTICE
```

**Rule:** `@shrimpler/core` has zero dependencies on `shell-*` or `@shrimpler/shared-ui`.
`shared-ui` may depend on `core` and React, but not on either shell. Enforce with lint
boundaries (e.g. `eslint-plugin-boundaries` or `dependency-cruiser`) in CI.

---

## 4. Core domain model

### 4.1 Identifiers

The Stremio ID convention is the universal join key. Types:

```ts
// A content identifier. IMDb-style is the interop standard.
// Movie:   "tt1234567"
// Episode: "tt1234567:1:5"   (imdbId:season:episode)
// Some addons use their own prefixed ids ("kitsu:...", "mal:...") — preserve verbatim.
type ContentId = string;

type MediaType = "movie" | "series" | "tv" | "channel" | string; // open-ended per protocol

interface ParsedId {
  raw: ContentId;
  imdbId?: string; // "tt1234567" when derivable — the TMDB lookup pivot
  season?: number;
  episode?: number;
  namespace?: string; // e.g. "kitsu" when id is "kitsu:12345"
}
```

`imdbId` is what unlocks TMDB fallback (§5). Parsing must be lenient: unknown
namespaces pass through untouched so non-IMDb addons still function (metadata fallback
simply won't apply to them).

### 4.2 Core content types

```ts
interface MetaPreview {
  // catalog row item — lightweight
  id: ContentId;
  type: MediaType;
  name: string;
  poster?: string;
  posterShape?: "poster" | "landscape" | "square";
  releaseInfo?: string;
}

interface MetaDetail extends MetaPreview {
  // detail screen — full
  background?: string;
  logo?: string;
  description?: string;
  cast?: string[];
  director?: string[];
  genres?: string[];
  runtime?: string;
  released?: string;
  videos?: EpisodeRef[]; // for series: episode list
  imdbRating?: string;
}

interface EpisodeRef {
  id: ContentId; // "tt…:S:E"
  season: number;
  episode: number;
  name?: string;
  overview?: string;
  released?: string;
  thumbnail?: string;
}
```

### 4.3 Playable sources — the output of the stream pipeline

```ts
type PlaybackKind = "vod" | "live";

interface PlayableSource {
  id: string; // stable id for this candidate
  kind: PlaybackKind;
  url?: string; // direct HTTP(S)/HLS/TS URL (after debrid resolve)
  magnet?: string; // present only if unresolved torrent (v-later)
  infoHash?: string;
  fileIdx?: number; // file index within a multi-file torrent

  title?: string; // human label ("1080p BluRay", "Channel 4 HD")
  quality?: string; // "2160p" | "1080p" | ...
  headers?: Record<string, string>; // required request headers (some IPTV/CDN)
  drm?: DrmConfig; // reserved; v1 = undefined

  subtitles?: SubtitleTrack[]; // addon-provided subtitle tracks
  behaviorHints?: {
    notWebReady?: boolean; // codec/container unlikely to play in <video>
    bingeGroup?: string;
  };

  // ranking signals (populated by resolver/ranking layer)
  cached?: boolean; // debrid-cached (instant) vs needs download
  seeders?: number;
  source?: string; // originating addon id, for debugging/telemetry
}

interface SubtitleTrack {
  id: string;
  lang: string; // ISO code
  url: string;
}

interface DrmConfig {
  // reserved
  scheme: "widevine" | "fairplay" | "playready";
  licenseUrl: string;
  headers?: Record<string, string>;
}
```

---

## 5. Metadata resolution (the one genuinely new subsystem)

Stream-only addons are common: they return video sources but no browsable catalog or
rich detail. Without a fallback, those produce a blank or raw-text UI. The
`MetadataResolver` fixes this by falling back to a metadata provider (TMDB in v1)
keyed off the IMDb ID.

### 5.1 Precedence rule (documented product decision — see ADR-0003)

1. **Addon meta wins.** If a meta-capable addon returns satisfactory detail for the
   id, use it. The addon is the source of truth.
2. **Provider fills gaps.** If no addon meta (or sparse), resolve via `MetadataProvider`
   using `imdbId` → provider details (poster, backdrop, overview, cast, episode list).
3. **Cache the merged result** (TTL) via `StorageAdapter`.

Metadata providers supply _presentation data only_ (posters, summaries, episode
listings) — never streams. This is both a product feature and a neutrality property:
serving metadata is what every legal catalog does; it says nothing about where video
comes from.

### 5.2 Interfaces

```ts
interface MetadataProvider {
  readonly id: string; // "tmdb" | "trakt" | "tvdb"
  getDetail(imdbId: string, type: MediaType): Promise<MetaDetail | null>;
  getEpisodes?(imdbId: string): Promise<EpisodeRef[]>;
  // Home-screen feeds (trending/popular/lists) for stream-only setups:
  getFeed?(feed: FeedKind, opts?: FeedOpts): Promise<MetaPreview[]>;
}

type FeedKind = "trending" | "popular" | "top_rated" | "user_list";

interface MetadataResolver {
  resolveDetail(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  resolveEpisodes(id: ContentId): Promise<EpisodeRef[]>;
  buildHomeFeeds(): Promise<CatalogRow[]>; // when addons supply no catalog
}
```

`MetadataProvider` implementations live in `core/providers` but receive the
`HttpAdapter` (and any API key) by injection — the core declares no key and performs no
fetch directly, preserving purity. Additional providers (Trakt lists, TVDB) slot in
behind the same interface later.

---

## 6. Addon engine & the stream pipeline

### 6.1 Manifest & resources

An addon is an HTTP server exposing:

- `GET /manifest.json` — declares `resources` (`catalog`, `meta`, `stream`,
  `subtitles`), supported `types`, `idPrefixes`, and catalog definitions.
- `GET /{resource}/{type}/{id}.json` — the resource endpoint.
- `GET /{resource}/{type}/{id}/{extra}.json` — with extra props (search, skip, genre).

All requests are stateless GETs. No auth, no handshake.

```ts
interface AddonManifest {
  id: string;
  version: string;
  name: string;
  resources: (ResourceName | ResourceObject)[];
  types: MediaType[];
  idPrefixes?: string[]; // e.g. ["tt", "kitsu"]
  catalogs: CatalogDef[];
}

type ResourceName = "catalog" | "meta" | "stream" | "subtitles";

interface CatalogDef {
  type: MediaType;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
}

interface InstalledAddon {
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  addedAt: number;
}
```

### 6.2 Engine responsibilities

- Store installed addons (manifest URL + parsed manifest + enabled flag).
- For a given request, **fan out** to every enabled addon that declares it can serve
  the resource+type (and, for meta/stream, whose `idPrefixes` match the id).
- Enforce **per-addon timeouts** and **partial-failure isolation**: a slow or dead
  stream addon must never block catalog render or freeze the UI.
- Return raw per-addon results to the merge/rank layer.

```ts
interface AddonEngine {
  install(manifestUrl: string): Promise<InstalledAddon>;
  remove(manifestUrl: string): Promise<void>;
  setEnabled(manifestUrl: string, enabled: boolean): Promise<void>;
  list(): InstalledAddon[];

  getCatalog(
    type: MediaType,
    catalogId: string,
    extra?: CatalogExtra,
  ): Promise<MetaPreview[]>;
  getMeta(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  getStreams(id: ContentId, type: MediaType): Promise<PlayableSource[]>;
  getSubtitles(id: ContentId, type: MediaType): Promise<SubtitleTrack[]>;
}

interface CatalogExtra {
  search?: string;
  skip?: number;
  genre?: string;
}
```

A **bundled master manifest** (multiple addons combined into one URL by an external
tool) is just one manifest to the engine — no special handling. This is why the v1
addon manager can stay minimal.

### 6.3 Merge & rank

- **Catalog:** dedup by `id`, preserve per-addon ordering signals, merge into rows.
- **Streams:** dedup by `infoHash`/`url`; rank by a documented scoring function:
  resolution → debrid-`cached` → seeders → source reliability. Ranking policy is a
  product decision (ADR-0004) so it is tunable without touching the engine.

### 6.4 Debrid resolver

Takes a magnet/infoHash or restricted link from a stream result and calls the debrid
provider API (Real-Debrid / AllDebrid / Premiumize) to obtain a direct HTTPS URL.
Collapses the "torrent" case into the "direct URL" case, so the player layer never sees
a magnet in v1.

```ts
interface DebridProvider {
  readonly id: string;
  resolve(input: {
    magnet?: string;
    infoHash?: string;
    url?: string;
    fileIdx?: number;
  }): Promise<{ url: string; cached: boolean } | null>;
  checkCached?(infoHashes: string[]): Promise<Record<string, boolean>>;
}
```

Torrent-engine playback (WebTorrent/libtorrent, sequential piece priority, local HTTP
serving) is a **later** addition. When added, it implements the same "resolve a
`PlayableSource.magnet` into a playable `url`" seam — the rest of the pipeline is
unchanged.

---

## 7. Adapters (interface in core, implemented per shell)

### 7.1 PlayerAdapter — the spine

One contract, N implementations (ExoPlayer, AVPlayer, `<video>`, Tizen AVPlay, webOS,
libmpv). Must satisfy VOD direct/HLS, **live TS/HLS with reconnect**, and (later)
torrent-local-HTTP — behind a single interface. This is the highest-value abstraction
and should be designed and frozen before UI work begins.

```ts
interface PlayerAdapter {
  load(source: PlayableSource): Promise<void>;
  play(): void;
  pause(): void;
  seek(positionSec: number): void; // no-op / ignored for kind:'live'
  stop(): void;

  selectSubtitle(trackId: string | null): void;
  selectAudioTrack(trackId: string): void;
  setPlaybackRate?(rate: number): void;

  getState(): PlayerState;
  on(
    event: PlayerEventName,
    cb: (payload: PlayerEventPayload) => void,
  ): () => void;

  destroy(): void;
}

interface PlayerState {
  status:
    | "idle"
    | "loading"
    | "playing"
    | "paused"
    | "buffering"
    | "ended"
    | "error";
  positionSec: number;
  durationSec: number; // Infinity/0 for live
  bufferedSec: number;
  audioTracks: TrackInfo[];
  subtitleTracks: TrackInfo[];
  activeAudioTrackId?: string;
  activeSubtitleTrackId?: string | null;
  error?: PlayerError;
}

type PlayerEventName =
  | "timeupdate"
  | "statuschange"
  | "buffering"
  | "tracks"
  | "ended"
  | "error"
  | "reconnecting";

interface TrackInfo {
  id: string;
  label: string;
  lang?: string;
}
interface PlayerError {
  code: string;
  message: string;
  fatal: boolean;
}
type PlayerEventPayload = Partial<PlayerState> & { error?: PlayerError };
```

**Implementation notes (per-platform, behind the interface):**

- **Codec gap is a web-shell problem.** `<video>` cannot play most HEVC/x265 and many
  MKV containers that ExoPlayer/AVPlayer handle natively. `behaviorHints.notWebReady`
  lets the web shell warn/deprioritize or fall back to a native player API (Tizen
  AVPlay, webOS) where available.
- **Live reconnect** logic (detect drop → re-open stream → resume) lives inside each
  live-capable implementation; the core only observes `'reconnecting'` events.
- **Seek on live** is a no-op unless the source advertises a DVR window.

### 7.2 StorageAdapter & HttpAdapter

```ts
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

interface HttpAdapter {
  get(url: string, opts?: HttpOpts): Promise<HttpResponse>;
  post(url: string, body: unknown, opts?: HttpOpts): Promise<HttpResponse>;
}
interface HttpOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
}
interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
```

- **RN-TV:** MMKV/AsyncStorage; fetch.
- **Web:** IndexedDB (large: EPG/cache) + localStorage (small); fetch. Note TV web
  runtimes have CORS/cert quirks — `HttpAdapter` is the single place to handle them.

### 7.3 Composition root

Each shell wires concrete adapters into the core at startup:

```ts
// shell-*/composition-root.ts
const core = createCore({
  storage: new PlatformStorageAdapter(),
  http: new PlatformHttpAdapter(),
  playerFactory: () => new PlatformPlayerAdapter(),
  providers: [new TmdbProvider({ http, apiKey: TMDB_KEY })],
});
```

---

## 8. IPTV subsystem (modeled as an internal addon)

IPTV is **not** a parallel app. It is an internal module that emits the same
catalog/meta/stream shapes as any addon, so discovery, search, and the player layer
reuse it for free. `type: 'tv' | 'channel'`.

### 8.1 Ingest

- **M3U / M3U8 parser** — `#EXTINF` attributes (`tvg-id`, `tvg-logo`, `group-title`) +
  stream URL. Straightforward.
- **Xtream Codes client** — JSON endpoints for live / VOD / series + EPG endpoint. The
  de-facto standard for provider subscriptions.

### 8.2 EPG pipeline (the genuinely fiddly part)

- **XMLTV** source, often large + gzipped + malformed.
- **Stream-parse** (never load whole file into memory).
- **Match** programmes to channels via `tvg-id`, with fuzzy fallback for the common
  case of inconsistent provider ids.
- **Timezone-normalize**; produce a now/next + grid model.
- Cache aggressively (IndexedDB on web).

### 8.3 Live playback

Live streams are messy: HLS (fine), raw MPEG-TS over HTTP (needs a demuxing player —
ExoPlayer/AVPlayer/libmpv/AVPlay yes, `<video>` no), occasional RTMP/RTSP (may refuse).
No seeking on live; requires reconnect/buffering logic. This is why the `PlayerAdapter`
must treat `kind: 'live'` as a first-class mode, not an afterthought.

**Neutrality note:** the client accepts user-supplied M3U/Xtream credentials and makes
no representation about their provenance — identical code path for a free-to-air
playlist and any other. The app does not (and cannot) police inputs, and must not claim
to (see §9).

---

## 9. Neutrality as an architectural property

Store viability depends on the app reading as a _neutral media player_, consistently,
across code, UI copy, and store listing. This is structural, not cosmetic.

### 9.1 What "neutral" requires structurally

- **Empty by default.** No bundled addons, no preloaded IPTV sources, no in-app source
  directory or "popular addons" list. User supplies everything.
- **No curation toward sources.** Add-by-URL only. External bundlers handle
  aggregation off-device.
- **No provenance claims.** The app must not advertise that it verifies legality of
  user inputs — it can't, and claiming so creates an unkeepable promise.
- **Own branding.** Descriptive "compatible with the Stremio addon protocol" is fine;
  do not imply affiliation. Pick a distinct product name.

### 9.2 The `labels` module

All user-facing strings route through one module per shell (or a shared map in
`shared-ui/labels`). This is the single audit point for the app's "voice," and it must
match store-listing copy. Internal core vocabulary stays accurate; only the
presentation layer renames.

```
CORE (internal, accurate)     →   USER-FACING LABEL (labels module)
  Addon / manifest URL             "Source" / "Manifest Playlist"
  catalog resource                 "Menu" / browsable rows
  stream resource                  "Sources"
  installAddon(manifestUrl)        "Add a Playlist"
```

Audit the labels module before every store submission.

### 9.3 Distribution reality (informs planning, not code)

| Target               | Official store           | Notes                                                                                                      |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Web / PWA            | n/a                      | Unrestricted — always available.                                                                           |
| Android mobile       | Achievable, volatile     | Keep signed APK as fallback for suspensions.                                                               |
| Android TV / Fire TV | Achievable, volatile     | APK / sideload fallback (well-trodden).                                                                    |
| Apple iOS / tvOS     | Achievable w/ discipline | No sideload fallback → neutral framing matters most here. Precedent exists for neutral IPTV+addon players. |
| Samsung Tizen        | Achievable               | Certification hurdle, not a wall.                                                                          |
| LG webOS             | Achievable               | As Tizen.                                                                                                  |

Plan so stores are **not load-bearing**: web + Android-APK carry baseline reach;
official-store presence is upside pursued via disciplined neutral framing.

---

## 10. End-to-end request lifecycle

**VOD, catalog-capable addon:**

```
1. Shell → core.getCatalog(movie, "Action", {skip:0})
2. Engine fans out to catalog-capable addons → merge/dedup → rows
3. User selects item → core.resolveDetail(tt123, movie)
     → addon meta? yes → use it ; no → TMDB by imdbId → MetaDetail
4. User hits play → core.getStreams(tt123, movie)
     → fan out → collect sources (urls + magnets/hashes)
5. Rank ; for magnet/hash → DebridProvider.resolve → direct HTTPS url (+cached flag)
6. Ranked PlayableSource[] → shell picks top (or shows chooser)
7. shell.PlayerAdapter.load(source) → platform player plays
8. 'timeupdate' → core updates continue-watching via StorageAdapter
```

**VOD, stream-only addon (metadata fallback):**

```
1. addon has no catalog → MetadataResolver.buildHomeFeeds()
     → TMDB trending/popular (or user's Trakt list) → rows
2..8 as above; step 3 detail comes from TMDB since addon has no meta
```

**Live IPTV:**

```
1. core.getCatalog(tv, <group>) → IPTV internal addon → channel rows (+EPG now/next)
2. user selects channel → getStreams → live TS/HLS url (kind:'live')
3. PlayerAdapter.load({kind:'live', ...}) → live mode: reconnect on, seek disabled
```

---

## 11. Build phases

### Phase 0 — Foundations (design-frozen before UI)

- Repo/monorepo scaffold; lint boundaries in CI.
- **Freeze `PlayerAdapter` + `PlayableSource` contracts.**
- **Freeze the core/shell boundary** (composition root, adapter interfaces).
- Focus/navigation model spike in _both_ shells (retrofitting spatial nav later is the
  classic TV-port disaster — do it now).

### Phase 1 — Core + debrid VOD MVP

- Addon engine (install/list/fan-out/timeout), resource clients, merge/rank.
- Debrid resolver (one provider end-to-end).
- MetadataResolver + TMDB provider.
- Minimal add-by-URL addon manager.
- One shell (web _or_ RN-TV) with debrid-only player → usable across browser +
  Android TV/Fire TV.
- **Target: a build you actually use.**

### Phase 2 — Second shell + IPTV

- Bring up the other shell (share core + view-models).
- IPTV internal addon: M3U + Xtream ingest, EPG pipeline + guide UI.
- Live playback hardening (TS/HLS + reconnect).
- tvOS via RN side if pursued.

### Phase 3 — Breadth & polish

- Tizen + webOS packaging + store certification.
- Subtitles (OpenSubtitles addon + rendering), Trakt provider, home-screen feeds.
- Optional: torrent engine as an additional resolver source type.
- Store-listing neutrality audit (labels module review) per platform.

---

## 12. Architecture Decision Records (index)

Maintain ADRs in `/docs/adr`. Initial set:

- **ADR-0001** — Pure-TS core + two shells (RN-TV, web); core purity invariant.
- **ADR-0002** — Adopt Stremio addon protocol + IMDb `tt…` ID convention unchanged.
- **ADR-0003** — Metadata precedence: addon-meta-first, provider (TMDB) fallback.
- **ADR-0004** — Stream ranking policy (resolution → cached → seeders → reliability).
- **ADR-0005** — Debrid-first; torrent engine deferred behind resolver seam.
- **ADR-0006** — IPTV modeled as an internal addon, not a parallel subsystem.
- **ADR-0007** — Neutrality: empty-by-default, add-by-URL only, labels module, no
  provenance claims.
- **ADR-0008** — `PlayerAdapter` single contract spanning VOD / live / (torrent-later).
- **ADR-0009** — License: **AGPL-3.0-or-later** for all code; "Shrimpler" name/brand
  held separately from the code license (see §14). Rationale: copyleft keeps forks
  open and closes the hosted-service loophole for any future server-side component
  (metadata proxy, sync), which matters defensively in this category.

---

## 13. Open questions to resolve during Phase 0

1. Monorepo tooling: pnpm workspaces vs Nx vs Turborepo (build caching matters as
   shells grow).
2. First shell to bring up in Phase 1 — web (fastest iteration, worst codecs) vs RN-TV
   (best player, more setup)?
3. Debrid provider for the MVP (Real-Debrid vs AllDebrid vs Premiumize) — API
   ergonomics and cached-check support differ.
4. State management inside shells (the view-model layer contract) — keep core-agnostic.
5. Subtitle rendering strategy on web where the player is native AVPlay (overlay vs
   native).
6. Telemetry/debug mode (a UHF-style user-facing debug log for ISP-block / dead-source
   troubleshooting) — opt-in, privacy-preserving.

---

## 14. Open source & governance

Shrimpler is open source from the first commit. Being public _strengthens_ the neutral-
tool posture (§9): the code is auditable, so "empty media player, user-supplied sources"
is a verifiable fact rather than a marketing claim. It also gives the APK / build-from-
source distribution path for free when a store bounces a build (§9.3). The flip side is
that neutrality now has to hold in public artifacts and be actively moderated — see §14.3.

### 14.1 License — AGPL-3.0-or-later (ADR-0009)

- **All code** is licensed **AGPL-3.0-or-later**. Every package (`@shrimpler/*`) carries
  SPDX headers (`SPDX-License-Identifier: AGPL-3.0-or-later`); a single `LICENSE` file at
  repo root holds the full text.
- **Why copyleft, why AGPL specifically:** derivatives must stay open, which keeps bad-
  actor forks honest, and the AGPL network clause closes the hosted-service loophole for
  any future server-side component (metadata proxy, account/sync service). In a
  scrutinized category that defensive posture is worth the reduced permissiveness.
- **Contributions** are inbound-under-the-same-license (AGPL-3.0-or-later). Default to a
  **DCO** (Developer Certificate of Origin, `Signed-off-by` on commits) rather than a CLA
  — lighter weight for a solo-led project and sufficient for provenance. Optionally add a
  CLA later only if a relicense path ever needs to be preserved.

### 14.2 Trademark — held separately from the code license

The AGPL covers the _code_, not the _name_. "Shrimpler" and any logo are held separately
(the Mozilla/Firefox and Stremio model). Practical effect: anyone may fork and ship the
AGPL code, but a fork may **not** call itself "Shrimpler" or use the marks in a way that
implies it is the official project. State this in `README.md` (a short Trademark section)
and `NOTICE`. Formal registration is optional and can come later; asserting common-law
use in-repo is enough to start.

### 14.3 Neutrality in public artifacts (a moderation duty, not just a doc)

Going open source adds a governance burden: the community will, in good faith, try to
make the project "more useful" in ways that break §9 neutrality. This must be refused
consistently.

- **The repo is a listing.** README, wiki, issues, discussions, and example configs hold
  the same neutral line as a store listing — no bundled addon lists, no default sources,
  no links to or names of infringing manifests/providers, no "where to get content"
  guidance.
- **`CONTRIBUTING.md` encodes the rule explicitly:** PRs that add default/bundled
  addons, preloaded IPTV sources, an in-app source directory, or docs pointing at
  infringing sources are **out of scope and will be closed.** Give contributors the
  reason (neutral-tool posture / store viability), not just a rejection.
- **Issue & PR templates** (`.github/`) steer away from "add my favourite addon"
  requests and source-sharing. A pinned issue / discussion can explain the stance once.
- **`NOTICE`** carries the standing disclaimer: _Shrimpler is a media player; it hosts,
  stores, and distributes no content; users are responsible for the legality of the
  sources they add._ Mirror this in the README header and the app's About screen.
- **Example configs ship empty or point only at unambiguously legal sources** (public-
  domain catalogs, the user's own Jellyfin, free-to-air playlists) — never as a curated
  "starter pack" of streaming sources.

### 14.4 Repo bootstrap checklist (Phase 0)

```
LICENSE                    # AGPL-3.0 full text
NOTICE                     # neutral-tool disclaimer (§14.3)
README.md                  # neutral framing in header; Trademark + Disclaimer sections
CONTRIBUTING.md            # DCO/sign-off; the §14.3 neutrality rule; boundary rules (§2.2)
CODE_OF_CONDUCT.md         # standard (e.g. Contributor Covenant)
.github/
  ISSUE_TEMPLATE/          # bug / feature; steer away from source-sharing requests
  PULL_REQUEST_TEMPLATE.md # checklist incl. "no bundled/default sources", sign-off
  workflows/ci.yml         # lint + boundary checks (§3) + typecheck + tests
/docs/TECHNICAL_SPEC.md    # this document
/docs/adr/                 # ADR-0001 … ADR-0009 stubs (§12)
package.json               # workspaces; scope @shrimpler
```

- Grab the **`@shrimpler` npm scope** and a domain (`shrimpler.app` / `.tv`) early.
- SPDX headers on every source file from the first commit (cheap now, tedious to
  backfill).
- Wire the **dependency-boundary lint into CI on commit one** — the core-purity
  invariant (§2.2) is far easier to keep than to recover, and in public a broken
  boundary is a broken boundary everyone can see.
