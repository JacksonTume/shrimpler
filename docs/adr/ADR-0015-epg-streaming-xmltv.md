# ADR-0015 — EPG pipeline: streaming XMLTV parse, tvg-id matching, snapshot cache

- Status: Accepted
- Date: 2026-07-16

## Context

Spec §8.2 defines the EPG (electronic programme guide) pipeline: XMLTV sources
that are "often large + gzipped + malformed", to be **stream-parsed** (never the
whole file in memory), **matched** to channels via `tvg-id` with a fuzzy fallback,
**timezone-normalized**, reduced to a now/next + grid model, and **cached
aggressively (IndexedDB on web)**. ADR-0006 left EPG as a later increment. Nothing
EPG existed; this is the first increment (ingest + now/next). It forces two
decisions that are expensive to reverse: how a DOM-less core streams a response
body, and the shape of the EPG model + cache.

## Decision

Add a pure `core/src/epg` module mirroring the IPTV subsystem's shape (parser +
matcher + snapshot cache + service), exposed as `core.epg`, and extend the
`HttpAdapter` seam to stream text.

- **Stream, not buffer (HttpAdapter extension).** `HttpAdapter` gains an
  **optional** `getTextStream?(url, opts): AsyncIterable<string>` yielding decoded
  UTF-8 chunks. `AsyncIterable<string>` is a plain ES type, so no web-stream types
  (`ReadableStream`/`DecompressionStream`/`TextDecoderStream`) leak into the
  DOM-less core (ADR-0001) — the web shell owns all of that, including gzip
  inflation of a `.gz` file body (the browser only auto-decodes `Content-Encoding`).
  It is optional so a shell without streaming still works: callers fall back to
  `get().text()`. A generous/absent `timeoutMs` is used for the (long) EPG stream;
  breaking out of the iteration cancels the reader and aborts the fetch.
- **Hand-rolled incremental parser.** `parse-xmltv.ts` scans a running buffer for
  complete `<channel>`/`<programme>` elements, emitting them via callbacks and
  retaining only a partial-element tail across chunk boundaries — no DOMParser (the
  core is DOM-less and a full DOM would defeat streaming). Lenient in the house
  style (parse-m3u / manifest): a malformed element is skipped, never thrown.
  Timestamps (`YYYYMMDDHHMMSS ±HHMM`) normalize to **UTC epoch ms**; a missing
  offset is treated as UTC (deterministic and testable, unlike local time).
- **Match at refresh time, tvg-id then fuzzy.** `match-channels.ts` joins
  programmes to a source's IPTV channels by exact `tvg-id` (case-insensitive),
  falling back to a normalized display-name (lowercased, quality tags like
  HD/FHD/4K dropped, non-alphanumerics stripped). Matching resolves to the IPTV
  channel's stable id at **refresh** time, so a now/next lookup is a direct keyed
  read. Xtream channels, which previously dropped `epg_channel_id`, now carry it as
  `tvgId`.
- **Snapshot cache of the derived model.** `epg-cache.ts` copies the IPTV
  snapshot-cache pattern (meta/body split, TTL staleness, signature-based
  skip-rewrite, quota-safe writes, source-key pruning) but stores the parsed,
  window-trimmed (now-2h … now+36h) programmes-by-channel model — **never the raw
  XMLTV**. It shares the IPTV cache's storage, which the web shell points at
  IndexedDB.
- **Source-URL discovery, not configuration.** EPG endpoints are derived from the
  existing IPTV sources: Xtream accounts expose `xmltv.php`; M3U playlists advertise
  `url-tvg` on their `#EXTM3U` header (sniffed from the head of the streamed
  playlist). Channels for matching come from the already-fetched IPTV content
  snapshots — the EPG pass never re-parses a playlist. No new user config.
- **`core.epg` surface.** `refresh({force?})` is TTL-gated, deduped, and
  background (stale-while-revalidate, like `core.iptv.refresh`); `getNowNext(ids,
at?)` reads the cached snapshots. The web `useNowNext` view-model batches a
  page's live content ids and renders a now/next strip on channel cards.

## Consequences

- Live channel rows show now/next, cached in IndexedDB and refreshed in the
  background — the first half of the EPG story, shipped as one increment.
- The `HttpAdapter` streaming seam is reusable for any future large-document
  ingest; the RN shell implements `getTextStream` (or relies on the buffered
  fallback) when it lands.
- **Deferred:** a dedicated scrolling timeline "TV Guide" grid screen; Xtream
  native EPG endpoints (`get_short_epg`/`get_simple_data_table`) as an alternative
  to XMLTV; a per-playlist manual EPG-URL override; and DVR/catch-up. The stored
  grid model already supports a guide UI, so that increment is additive.
